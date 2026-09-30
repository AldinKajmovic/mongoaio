const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, Long, Decimal128, Binary } = require('mongodb');
const { serializeDoc, serializeDocEJSON, deserializeInput, bsonEqual, typedKey, _computeDiffsRecursive } = require('../../src/db/serialize');

test('serializeDoc flattens BSON types for display', () => {
  const oid = new ObjectId();
  const out = serializeDoc({ _id: oid, d: new Date('2024-01-01T00:00:00Z'), b: new Binary(Buffer.from('hi')) });
  assert.equal(out._id, oid.toHexString());
  assert.equal(out.d, '2024-01-01T00:00:00.000Z');
  assert.equal(out.b, 'aGk=');
});

test('deserializeInput revives Extended JSON markers', () => {
  const oid = new ObjectId();
  const out = deserializeInput({ a: { $oid: oid.toHexString() }, d: { $date: '2024-01-01T00:00:00Z' }, l: { $numberLong: '9007199254740993' } });
  assert.ok(out.a instanceof ObjectId);
  assert.ok(out.d instanceof Date);
  assert.equal(out.l.toString(), '9007199254740993');
});

test('deserializeInput is idempotent on values that are already native', () => {
  const oid = new ObjectId();
  const once = deserializeInput({ _id: { k: 1, r: { $oid: oid.toHexString() } } });
  const twice = deserializeInput(once);
  assert.ok(twice._id.r instanceof ObjectId, 'nested ObjectId survives a second pass');
  assert.equal(deserializeInput({ l: Long.fromString('9007199254740993') }).l.toString(), '9007199254740993');
});

test('deserializeInput keeps query operators and passes primitives through', () => {
  assert.equal(Number(deserializeInput({ $gt: 5 }).$gt), 5);
  assert.equal(deserializeInput('abc'), 'abc');
  assert.equal(deserializeInput(null), null);
  assert.equal(deserializeInput(undefined), undefined);
  const pipeline = deserializeInput([{ $match: { x: { $in: [1, 'a'] } } }, { $limit: 3 }]);
  assert.ok(Array.isArray(pipeline) && pipeline.length === 2);
});

test('bsonEqual ignores key order but not types', () => {
  assert.ok(bsonEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }));
  const d = new Date('2024-01-01T00:00:00Z');
  assert.ok(!bsonEqual({ d }, { d: d.toISOString() }), 'Date vs its ISO string');
  assert.ok(!bsonEqual({ id: new ObjectId('65f000000000000000000001') }, { id: '65f000000000000000000001' }));
  assert.ok(!bsonEqual([1, 2], [2, 1]), 'array order matters');
  assert.ok(bsonEqual(Decimal128.fromString('1.10'), Decimal128.fromString('1.10')));
  assert.ok(bsonEqual(new Binary(Buffer.from('x')), new Binary(Buffer.from('x'))));
});

test('typedKey separates ids that look alike', () => {
  const keys = new Set([typedKey(1), typedKey('1'), typedKey(new ObjectId('65f000000000000000000001')), typedKey('65f000000000000000000001')]);
  assert.equal(keys.size, 4);
});

test('_computeDiffsRecursive reports type changes and nested paths in display form', () => {
  const d = new Date('2024-01-01T00:00:00Z');
  const diffs = _computeDiffsRecursive({ _id: 1, d, n: { a: 1, b: 2 }, only: 1 }, { _id: 2, d: d.toISOString(), n: { a: 1, b: 3 }, extra: 1 });
  const byField = Object.fromEntries(diffs.map(x => [x.field, x]));
  assert.equal(byField.d.type, 'modified');
  assert.equal(byField.d.sourceValue, d.toISOString());
  assert.equal(byField['n.a'].type, 'same');
  assert.equal(byField['n.b'].type, 'modified');
  assert.equal(byField.only.type, 'missing_in_target');
  assert.equal(byField.extra.type, 'added_in_target');
  assert.equal(byField._id, undefined, 'top-level _id is not diffed');
});

test('serializeDocEJSON keeps Longs beyond 2^53 exact', () => {
  const out = serializeDocEJSON({ a: Long.fromString('9007199254740993'), nested: [{ b: Long.fromString('-9007199254740995') }], small: Long.fromString('7') });
  assert.deepEqual(out.a, { $numberLong: '9007199254740993' });
  assert.deepEqual(out.nested[0].b, { $numberLong: '-9007199254740995' });
  assert.equal(out.small, 7);
});

test('serializeDocEJSON round-trips through deserializeInput', () => {
  const doc = { _id: new ObjectId(), d: new Date(), l: Long.fromString('9007199254740993'), dec: Decimal128.fromString('0.1') };
  const back = deserializeInput(JSON.parse(JSON.stringify(serializeDocEJSON(doc))));
  assert.ok(bsonEqual(back, doc));
});

test('serializeDoc shows Longs as numbers when safe and exact strings when not', () => {
  assert.deepEqual(serializeDoc({ a: Long.fromNumber(7), b: Long.fromString('9007199254740993') }), { a: 7, b: '9007199254740993' });
});

test('canonicalEJSON keeps the exact numeric type', () => {
  const { Double, Int32 } = require('mongodb');
  const { canonicalEJSON } = require('../../src/db/serialize');
  assert.deepEqual(canonicalEJSON(new Double(5)), { $numberDouble: '5.0' });
  assert.deepEqual(deserializeInput(canonicalEJSON(new Double(5)))._bsontype, 'Double');
  assert.deepEqual(canonicalEJSON({ n: new Int32(2) }), { n: { $numberInt: '2' } });
});
