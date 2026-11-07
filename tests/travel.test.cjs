/* global __dirname */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, Date };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(require('node:path').join(__dirname, '../src/lib/travel.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  context,
);
const { overlappingTrips } = context.exports;
test('nearby requires the same city and overlapping dates, including arrival/departure boundaries', () => {
  const own = [{ city_id: 'berlin', arrival: '2026-11-10', departure: '2026-11-12' }];
  const network = [
    { id: 'boundary', city_id: 'berlin', arrival: '2026-11-12', departure: '2026-11-14' },
    { id: 'other-city', city_id: 'paris', arrival: '2026-11-10', departure: '2026-11-12' },
    { id: 'later', city_id: 'berlin', arrival: '2026-11-13', departure: '2026-11-15' },
  ];
  assert.equal(
    overlappingTrips(own, network)
      .map((t) => t.id)
      .join(','),
    'boundary',
  );
  assert.equal(overlappingTrips([], network).length, 0);
});
