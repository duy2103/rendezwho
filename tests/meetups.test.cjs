/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, require: () => ({}), Date, Intl };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/meetups.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
test('meetup timestamps require explicit offsets and real calendar dates', () => {
  const parse = context.exports.parseMeetupTime;
  assert.equal(parse('2027-01-15T18:00+01:00'), '2027-01-15T17:00:00.000Z');
  for (const value of [
    '2027-02-30T18:00Z',
    '2027-01-15T18:00',
    '2027-13-01T18:00Z',
    'bad',
    '2027-01-15T25:00Z',
  ])
    assert.throws(() => parse(value));
});
