/* global __dirname */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(
  require('node:path').join(__dirname, '../src/lib/validation.ts'),
  'utf8',
);
const context = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  context,
);
const { validateDates } = context.exports;
test('allows same-day stays and leap days', () => {
  assert.doesNotThrow(() => validateDates('2028-02-29', '2028-02-29'));
  assert.doesNotThrow(() => validateDates('2026-12-31', '2027-01-02'));
});
for (const bad of [
  '2026-02-29',
  '2026-04-31',
  '2026-13-01',
  '2026-00-01',
  '2026-01-00',
  '2026-1-01',
  '',
  '2026-11-06T00:00:00Z',
]) {
  test(`rejects invalid calendar date ${JSON.stringify(bad)}`, () =>
    assert.throws(() => validateDates(bad, '2029-01-01')));
}
test('rejects departure before arrival', () =>
  assert.throws(() => validateDates('2026-12-02', '2026-12-01')));
test('validates departure independently', () =>
  assert.throws(() => validateDates('2026-01-01', '2026-02-30')));
