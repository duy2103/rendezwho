/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
function setup({ authenticated = true, allowed = true, cached = null, upstreamOk = true } = {}) {
  let handler;
  let fetches = 0;
  const writes = [];
  const db = {
    auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: null }),
    },
    rpc: async () => ({ data: allowed, error: null }),
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
    fetch: async () => {
      fetches++;
      return {
        ok: upstreamOk,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: [13.4, 52.5] },
              properties: {
                osm_type: 'N',
                osm_id: 1,
                name: 'Berlin',
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
