/* global __dirname */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function loadModule(name, imports) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', name + '.ts'), 'utf8');
  const context = {
    exports: {},
    require: (id) => imports[id],
    Date,
    Set,
    URL,
    process: { env: {} },
  };
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    context,
  );
  return context.exports;
}
function setup(result = { data: { id: 'saved' }, error: null }) {
  const calls = [];
  const chain = { then: (ok, fail) => Promise.resolve(result).then(ok, fail) };
  for (const method of [
    'from',
    'update',
    'insert',
    'upsert',
    'eq',
    'select',
    'single',
    'rpc',
    'neq',
    'gte',
    'lte',
    'order',
    'limit',
    'range',
    'or',
  ]) {
    chain[method] = (...args) => {
      calls.push([method, ...JSON.parse(JSON.stringify(args))]);
      return chain;
    };
  }
  const api = loadModule('data', {
    './supabase': { database: () => chain },
    './validation': loadModule('validation', {}),
    './invites': loadModule('invites', {}),
  });
  return { api, calls };
}
const city = { id: 'city-a', name: 'Berlin, Germany', country_code: null, region: '' };
test('profile writes update only editable columns; signup trigger owns creation', async () => {
  const { api, calls } = setup();
  await api.saveProfile('user-a', ' Ada ', ' Hello ', city);
  assert.deepEqual(calls, [
    ['from', 'profiles'],
    [
      'update',
      { full_name: 'Ada', bio: 'Hello', home_city: 'Berlin, Germany', home_city_id: 'city-a' },
    ],
    ['eq', 'id', 'user-a'],
    ['select', 'id'],
    ['single'],
  ]);
});
test('missing profile never reports a successful save', async () => {
  const { api } = setup({ data: null, error: null });
  await assert.rejects(api.saveProfile('user-a', 'Ada', '', null), /unavailable/);
});
test('trip and sharing go through a single atomic RPC with explicit private groups', async () => {
  const { api, calls } = setup({ data: 'trip-id', error: null });
  await api.saveTrip('user-a', city, '2026-12-01', '2026-12-02', ' note ');
  assert.deepEqual(calls, [
    [
      'rpc',
      'maps_save_checkin',
      {
        checkin_id: null,
        location: city.id,
        arrival_date: '2026-12-01',
        departure_date: '2026-12-02',
        trip_note: 'note',
        groups: [],
      },
    ],
  ]);
});
test('editing retains chosen shares and deduplicates community IDs', async () => {
  const { api, calls } = setup({ data: 'trip-id', error: null });
  await api.saveTrip('user-a', city, '2026-12-01', '2026-12-02', '', 'trip-id', ['g1', 'g1', 'g2']);
  assert.equal(calls[0][2].checkin_id, 'trip-id');
  assert.deepEqual(calls[0][2].groups, ['g1', 'g2']);
});
test('invalid trip dates never reach the backend', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.saveTrip('user-a', city, '2026-02-30', '2026-03-01', ''));
  assert.equal(calls.length, 0);
});
test('saving a place passes canonical IDs through the atomic RPC', async () => {
  const { api, calls } = setup();
  await api.savePlace(
    'user-a',
    city,
    { id: 'place-a', city_id: 'city-a', name: 'Cafe', category: null },
    'hello',
  );
  assert.deepEqual(calls, [
    [
      'rpc',
      'maps_save_place',
      {
        location: 'city-a',
        place_name: 'Cafe',
        place_note: 'hello',
        existing_place: 'place-a',
        lat: null,
        lng: null,
      },
    ],
  ]);
});
test('account deletion never implicitly deletes owned communities', async () => {
  const { api, calls } = setup({ data: null, error: { message: 'Transfer ownership first' } });
  await assert.rejects(api.deleteMyAccount(), (e) => e.message === 'Transfer ownership first');
  assert.deepEqual(calls, [['rpc', 'delete_my_account', { delete_owned_communities: false }]]);
});
test('malformed invite codes are rejected without an RPC', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.joinCommunity('not-a-token'), /invitation code/);
  assert.equal(calls.length, 0);
});

test('map date-range queries include historical overlaps instead of applying a today cutoff', async () => {
  const { api, calls } = setup({ data: [], error: null });
  await api.listNetworkTrips('user-a', '2025-01-01', '2025-01-31');
  assert.ok(calls.some((c) => c[0] === 'gte' && c[1] === 'departure' && c[2] === '2025-01-01'));
  assert.ok(calls.some((c) => c[0] === 'lte' && c[1] === 'arrival' && c[2] === '2025-01-31'));
});
