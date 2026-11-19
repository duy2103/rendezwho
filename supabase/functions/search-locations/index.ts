import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return reply({ error: 'Sign in required.' }, 401);
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(bearer);
  if (authError || !user) return reply({ error: 'Sign in required.' }, 401);
  try {
    const text = await request.text();
    if (text.length > 2048) return reply({ error: 'Search is too long.' }, 400);
    const input = JSON.parse(text);
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!['city', 'place'].includes(input.kind) || query.length < 2 || query.length > 150) {
      return reply({ error: 'Enter a search of 2–150 characters.' }, 400);
    }
    const language = ['en', 'de', 'fr', 'it'].includes(input.language) ? input.language : 'en';
    let city: { id: string; latitude: number; longitude: number } | null = null;
    if (input.kind === 'place') {
      const scoped = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      });
      const { data, error } = await scoped
        .from('cities')
        .select('id,latitude,longitude')
        .eq('id', input.cityId)
        .single();
      if (error || !data || data.latitude == null || data.longitude == null) {
        return reply(
          {
            error:
              'Choose a city from external search to search nearby places. Manual places remain available.',
          },
          400,
        );
      }
      city = data;
    }
    const { data: allowed, error: budgetError } = await admin.rpc('maps_take_search_budget', {
      actor: user.id,
    });
    if (budgetError) throw budgetError;
    if (!allowed)
      return reply({ error: 'Search is busy. Please wait a minute and try again.' }, 429);
    const identity = JSON.stringify([
      input.kind,
      query.toLocaleLowerCase(),
      city?.id ?? null,
      language,
    ]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const { data: cached, error: cacheError } = await admin
      .from('maps_search_cache')
      .select('payload')
      .eq('cache_key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (cacheError) throw cacheError;
    if (cached) return reply({ cacheId: key, ...cached.payload });
    if (Deno.env.get('MAPS_SEARCH_ENABLED') !== 'true') {
      return reply(
        {
          error: 'External search is not enabled yet. Use an existing city or add a custom place.',
        },
        503,
      );
    }
    const endpoint = new URL(Deno.env.get('PHOTON_URL') ?? 'https://photon.komoot.io/api/');
    if (endpoint.protocol !== 'https:') throw new Error('Search endpoint must use HTTPS');
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('limit', '8');
    endpoint.searchParams.set('lang', language);
    if (input.kind === 'city') {
      for (const tag of ['place:city', 'place:town', 'place:village', 'place:municipality'])
        endpoint.searchParams.append('osm_tag', tag);
    } else if (city) {
      endpoint.searchParams.set('lat', String(city.latitude));
      endpoint.searchParams.set('lon', String(city.longitude));
      // Explicit nearby search, not a claim about administrative city boundaries.
      const dx = Math.min(5, 0.45 / Math.max(0.1, Math.cos((city.latitude * Math.PI) / 180)));
      endpoint.searchParams.set(
        'bbox',
        [
          Math.max(-180, city.longitude - dx),
          Math.max(-90, city.latitude - 0.45),
          Math.min(180, city.longitude + dx),
          Math.min(90, city.latitude + 0.45),
        ].join(','),
      );
    }
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Rendezwho/1.0 (place-search)' },
    });
    if (!response.ok)
      return reply({ error: 'Place search is temporarily unavailable. Try a custom place.' }, 503);
    const payload = await response.json();
    const seen = new Set<string>();
    const results = (Array.isArray(payload.features) ? payload.features : []).flatMap(
      (feature: any) => {
        const p = feature.properties ?? {};
        const coordinates = feature.geometry?.coordinates;
        const type = (
          {
            N: 'node',
            W: 'way',
            R: 'relation',
            node: 'node',
            way: 'way',
            relation: 'relation',
          } as Record<string, string>
        )[p.osm_type];
        if (!type || !/^\d+$/.test(String(p.osm_id)) || !Array.isArray(coordinates)) return [];
        const [longitude, latitude] = coordinates;
        if (
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude) ||
          Math.abs(longitude) > 180 ||
          Math.abs(latitude) > 90
        )
          return [];
        const provider_id = `osm:${type}:${p.osm_id}`;
        if (seen.has(provider_id) || typeof p.name !== 'string' || !p.name.trim()) return [];
        seen.add(provider_id);
        const name =
          input.kind === 'city'
            ? [...new Set([p.name, p.state, p.country].filter(Boolean))].join(', ')
            : p.name;
        return [
          {
            provider_id,
            kind: input.kind,
            city_id: city?.id ?? null,
            name: name.slice(0, input.kind === 'city' ? 150 : 200),
            address: [p.housenumber, p.street, p.postcode, p.city, p.country]
              .filter(Boolean)
              .join(', ')
              .slice(0, 500),
            category: String(p.osm_value ?? 'place').slice(0, 50),
            region: String(p.state ?? '').slice(0, 150),
            country_code: /^[a-z]{2}$/i.test(p.countrycode ?? '')
              ? p.countrycode.toUpperCase()
              : null,
            latitude,
            longitude,
          },
        ];
      },
    );
    const normalized = { results };
    const { error: writeError } = await admin
      .from('maps_search_cache')
      .upsert({
        cache_key: key,
        payload: normalized,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
    if (writeError) throw writeError;
    return reply({ cacheId: key, ...normalized });
  } catch {
    return reply(
      { error: 'Could not search places. Please try again or add a custom place.' },
      503,
    );
  }
});
