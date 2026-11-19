/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
function setup({
  authenticated = true,
  allowed = true,
  cached = null,
  upstreamOk = true,
  empty = false,
  googleEnabled = false,
  googleAllowed = true,
  googleOk = true,
} = {}) {
  let handler;
  let fetches = 0;
  const writes = [];
  const urls = [];
  const db = {
    auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: null }),
    },
    rpc: async (name) => ({
      data: name === 'maps_take_google_budget' ? googleAllowed : allowed,
      error: null,
    }),
    from: () => {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        gt() {
          return chain;
        },
        single: async () => ({
          data: { id: 'city', latitude: 52.5, longitude: 13.4 },
          error: null,
        }),
        maybeSingle: async () => ({ data: cached ? { payload: cached } : null, error: null }),
        upsert: async (value) => {
          writes.push(value);
          return { error: null };
        },
      };
      return chain;
    },
  };
  const context = {
    exports: {},
    require: () => ({ createClient: () => db }),
    Deno: {
      env: {
        get: (key) =>
          ({
            SUPABASE_URL: 'https://project.example',
            SUPABASE_SERVICE_ROLE_KEY: 'test',
            MAPS_SEARCH_ENABLED: 'true',
            GOOGLE_PLACES_ENABLED: googleEnabled ? 'true' : 'false',
            GOOGLE_PLACES_API_KEY: 'server-key',
          })[key],
      },
      serve: (fn) => {
        handler = fn;
      },
    },
    Response,
    URL,
    TextEncoder,
    AbortSignal,
    crypto: webcrypto,
    Set,
    fetch: async (url) => {
      urls.push(new URL(url));
      fetches++;
      if (String(url).includes('places.googleapis.com'))
        return {
          ok: googleOk,
          json: async () => ({
            places: [
              {
                id: 'ChIJ_test',
                displayName: { text: 'Google cafe' },
                formattedAddress: 'Private provider address',
                attributions: [],
              },
            ],
          }),
        };
      return {
        ok: upstreamOk,
        json: async () => ({
          features: empty
            ? []
            : [
                {
                  geometry: { coordinates: [13.4, 52.5] },
                  properties: {
                    osm_type: 'N',
                    osm_id: 1,
                    name: 'Berlin',
                    osm_key: 'place',
                    osm_value: 'city',
                    countrycode: 'de',
                    country: 'Germany',
                  },
                },
                {
                  geometry: { coordinates: [200, 52] },
                  properties: { osm_type: 'N', osm_id: 2, name: 'Bad' },
                },
                {
                  geometry: { coordinates: [13.4, 52.5] },
                  properties: { osm_type: 'N', osm_id: 1, name: 'Duplicate' },
                },
              ],
        }),
      };
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, '../supabase/functions/search-locations/index.ts'),
        'utf8',
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  return {
    call: (body, auth = true) =>
      handler(
        new Request('https://function.example', {
          method: 'POST',
          headers: auth ? { Authorization: 'Bearer session' } : {},
          body: JSON.stringify(body),
        }),
      ),
    fetches: () => fetches,
    writes,
    urls,
  };
}
test('search requires a verified user before querying upstream', async () => {
  for (const auth of [true, false]) {
    const s = setup({ authenticated: false });
    assert.equal((await s.call({ kind: 'city', query: 'Berlin' }, auth)).status, 401);
    assert.equal(s.fetches(), 0);
  }
});
test('search enforces shared budget and returns a recoverable rate error', async () => {
  const s = setup({ allowed: false });
  assert.equal((await s.call({ kind: 'city', query: 'Berlin' })).status, 429);
  assert.equal(s.fetches(), 0);
});
test('cached search avoids upstream and normalization removes duplicates and invalid coordinates', async () => {
  const cached = setup({ cached: { results: [{ name: 'Cached' }] } });
  assert.equal((await cached.call({ kind: 'city', query: 'Berlin' })).status, 200);
  assert.equal(cached.fetches(), 0);
  const s = setup();
  const result = await (await s.call({ kind: 'city', query: 'Berlin' })).json();
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].provider_id, 'osm:node:1');
  assert.equal(result.results[0].country_code, 'DE');
  assert.equal(s.writes.length, 1);
});
test('upstream failure does not poison the cache', async () => {
  const s = setup({ upstreamOk: false });
  assert.equal((await s.call({ kind: 'city', query: 'Berlin' })).status, 503);
  assert.equal(s.writes.length, 0);
});

test('current-city lookup rounds coordinates and only caches city results', async () => {
  const s = setup();
  const response = await s.call({
    kind: 'city',
    nearby: { latitude: 52.512345, longitude: 13.412345 },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].kind, 'city');
  assert.equal(s.urls[0].pathname, '/reverse');
  assert.equal(s.urls[0].searchParams.get('lat'), '52.5');
  assert.equal(s.urls[0].searchParams.get('lon'), '13.4');
  assert.equal(s.urls[0].searchParams.has('q'), false);
  assert.equal(JSON.stringify(s.writes).includes('52.512345'), false);
});
test('invalid current-city coordinates never reach the provider', async () => {
  for (const latitude of [91, '52', null]) {
    const s = setup();
    assert.equal((await s.call({ kind: 'city', nearby: { latitude, longitude: 13 } })).status, 400);
    assert.equal(s.fetches(), 0);
  }
});

test('OSM matches never spend Google requests', async () => {
  const s = setup({ googleEnabled: true });
  const body = await (await s.call({ kind: 'place', query: 'Cafe', cityId: 'city' })).json();
  assert.equal(body.provider, 'osm');
  assert.equal(s.fetches(), 1);
});
test('empty OSM results fall back, while Google display content is never cached', async () => {
  const s = setup({ googleEnabled: true, empty: true });
  const body = await (await s.call({ kind: 'place', query: 'Cafe', cityId: 'city' })).json();
  assert.equal(body.provider, 'google');
  assert.equal(body.results[0].name, 'Google cafe');
  assert.equal(body.results[0].latitude, null);
  assert.equal(s.fetches(), 2);
  const stored = JSON.stringify(s.writes);
  assert.equal(stored.includes('Google cafe'), false);
  assert.equal(stored.includes('Private provider address'), false);
  assert.equal(stored.includes('google:ChIJ_test'), true);
});
test('Google budget or disabled provider prevents paid requests', async () => {
  for (const options of [{ googleEnabled: false }, { googleEnabled: true, googleAllowed: false }]) {
    const s = setup({ ...options, empty: true });
    const body = await (await s.call({ kind: 'place', query: 'Cafe', cityId: 'city' })).json();
    assert.equal(body.results.length, 0);
    assert.ok(body.notice);
    assert.equal(s.fetches(), 1);
  }
});
test('cached OSM misses still allow Google fallback and provider failure is recoverable', async () => {
  const s = setup({ googleEnabled: true, cached: { results: [] } });
  assert.equal(
    (await (await s.call({ kind: 'place', query: 'Cafe', cityId: 'city' })).json()).provider,
    'google',
  );
  assert.equal(s.fetches(), 1);
  const failure = setup({ googleEnabled: true, upstreamOk: false, googleOk: false });
  const body = await (await failure.call({ kind: 'place', query: 'Cafe', cityId: 'city' })).json();
  assert.ok(body.notice);
  assert.equal(failure.writes.length, 0);
});
