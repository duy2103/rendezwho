/* global __dirname */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name, env = {}) {
  const context = { exports: {}, require() {}, Map, Set, URL, process: { env } };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(__dirname, `../src/lib/${name}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    context,
  );
  return context.exports;
}
test('map accepts zero coordinates, rejects invalid coordinates and deduplicates travelers', () => {
  const { hasCoordinates, cityPoints, pointsGeoJSON } = load('mapData');
  assert.equal(hasCoordinates({ latitude: 0, longitude: 0 }), true);
  for (const value of [
    { latitude: null, longitude: 0 },
    { latitude: NaN, longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
  ])
    assert.equal(hasCoordinates(value), false);
  const points = cityPoints([
    { city_id: 'a', city: 'A', user_id: 'u', location: { latitude: 52, longitude: 13 } },
    { city_id: 'a', city: 'A', user_id: 'u', location: { latitude: 52, longitude: 13 } },
    { city_id: 'a', city: 'A', user_id: 'v', location: { latitude: 52, longitude: 13 } },
    { city_id: 'b', city: 'B', user_id: 'v', location: null },
  ]);
  assert.equal(points.length, 1);
  assert.equal(points[0].count, 2);
  assert.equal(JSON.stringify(pointsGeoJSON(points).features[0].geometry.coordinates), '[13,52]');
});
test('invites accept only valid codes and trusted links, rejecting ambiguous or hostile URLs', () => {
  const { invitationToken, invitationLink } = load('invites', {
    EXPO_PUBLIC_JOIN_BASE_URL: 'https://rendezwho.example/join',
  });
  const token = '11111111-1111-4111-8111-111111111111';
  assert.equal(invitationToken(` ${token} `), token);
  assert.equal(invitationToken(`rendezwho://join?token=${token}`), token);
  assert.equal(invitationToken(invitationLink(token)), token);
  for (const bad of [
    `https://evil.example/join?token=${token}`,
    `rendezwho://join?token=${token}&token=${token}`,
    `rendezwho://other?token=${token}`,
    'broken',
  ])
    assert.throws(() => invitationToken(bad));
});
