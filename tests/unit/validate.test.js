const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../src/main/validate');

test('validateSide accepts only source/target', () => {
  assert.equal(v.validateSide('source'), 'source');
  assert.throws(() => v.validateSide('admin'));
  assert.throws(() => v.validateSide(undefined));
});

test('validateString rejects empty and non-strings, trims', () => {
  assert.equal(v.validateString('  x ', 'n'), 'x');
  for (const bad of ['', '   ', null, 5, {}]) assert.throws(() => v.validateString(bad, 'n'));
});

test('validateObject / validateOptions', () => {
  assert.deepEqual(v.validateObject({ a: 1 }, 'o'), { a: 1 });
  for (const bad of [null, [], 'x', 1]) assert.throws(() => v.validateObject(bad, 'o'));
  assert.deepEqual(v.validateOptions(undefined, 'o'), {});
  assert.deepEqual(v.validateOptions(null, 'o'), {});
});

test('validateDocId allows 0 and objects, rejects empty', () => {
  assert.equal(v.validateDocId(0), 0);
  assert.deepEqual(v.validateDocId({ $oid: 'x' }), { $oid: 'x' });
  for (const bad of [undefined, null, '']) assert.throws(() => v.validateDocId(bad));
});

test('sanitizeErrorMessage redacts connection strings', () => {
  const msg = v.sanitizeErrorMessage('failed mongodb+srv://user:pw@host/db?x=1, retry');
  assert.ok(!msg.includes('pw'));
  assert.ok(msg.includes('mongodb://***'));
  assert.equal(v.sanitizeErrorMessage(undefined), 'An unknown error occurred.');
});
