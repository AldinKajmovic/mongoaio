const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { buildIdQuery, coerceNewId } = require('../../src/db/id-query');

const HEX = '65f000000000000000000001';

test('an ObjectId-looking string matches either the ObjectId or the string', () => {
  const { _id } = buildIdQuery(HEX);
  assert.equal(_id.$in.length, 2);
  assert.ok(_id.$in.some(v => v instanceof ObjectId && v.toHexString() === HEX));
  assert.ok(_id.$in.includes(HEX));
});

test('numeric text also matches the number', () => {
  assert.deepEqual(buildIdQuery('42')._id.$in, ['42', 42]);
  assert.deepEqual(buildIdQuery('-1.5')._id.$in, ['-1.5', -1.5]);
});

test('plain strings, numbers and markers pass through exactly', () => {
  assert.deepEqual(buildIdQuery('abc'), { _id: 'abc' });
  assert.equal(Number(buildIdQuery(7)._id), 7);
  assert.ok(buildIdQuery({ $oid: HEX })._id instanceof ObjectId);
  const compound = buildIdQuery({ k: 1, r: { $oid: HEX } })._id;
  assert.ok(compound.r instanceof ObjectId);
  const native = new ObjectId(HEX);
  assert.ok(buildIdQuery(native)._id.equals(native));
});

test('coerceNewId turns hex text into an ObjectId, leaves other ids alone', () => {
  assert.ok(coerceNewId(HEX) instanceof ObjectId);
  assert.equal(coerceNewId('custom-id'), 'custom-id');
  assert.ok(coerceNewId({ $oid: HEX }) instanceof ObjectId);
});
