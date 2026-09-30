const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, Decimal128, Long } = require('mongodb');
const { preserveTypes, diffToUpdate, valueAtPath } = require('../../src/db/type-preserve');
const { serializeDoc, serializeDocEJSON } = require('../../src/db/serialize');

const oid = new ObjectId();
const when = new Date('2024-05-01T10:00:00Z');
const stored = {
  _id: oid, ref: oid, when, price: Decimal128.fromString('9.99'), big: Long.fromString('9007199254740993'),
  n: 5, s: 'text', nested: { at: when, tags: ['a', 'b'], id: oid }, list: [{ at: when }],
};

test('unchanged values keep the exact stored instance (display form)', () => {
  const display = serializeDoc(stored);
  for (const key of ['ref', 'when', 'price', 'nested', 'list']) {
    assert.equal(preserveTypes(stored[key], display[key]), stored[key], key);
  }
});

test('unchanged values keep the exact stored instance (EJSON form)', () => {
  const ejson = serializeDocEJSON(stored);
  for (const key of ['ref', 'when', 'price', 'big', 'nested']) {
    assert.equal(preserveTypes(stored[key], ejson[key]), stored[key], key);
  }
});

test('edited scalars are coerced to the stored type', () => {
  assert.ok(preserveTypes(oid, new ObjectId().toHexString()) instanceof ObjectId);
  const d = preserveTypes(when, '2030-01-02T03:04:05.000Z');
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString(), '2030-01-02T03:04:05.000Z');
  assert.equal(preserveTypes(Decimal128.fromString('1'), '2.50')._bsontype, 'Decimal128');
  assert.equal(preserveTypes(Long.fromString('1'), '9223372036854775807').toString(), '9223372036854775807');
  assert.equal(preserveTypes(Decimal128.fromString('1'), 3)._bsontype, 'Decimal128');
});

test('text that does not fit the stored type stays text', () => {
  assert.equal(preserveTypes(oid, 'not-an-id'), 'not-an-id');
  assert.equal(preserveTypes(when, 'someday'), 'someday');
  assert.equal(preserveTypes(Long.fromString('1'), '1.5'), '1.5');
  assert.equal(preserveTypes(Long.fromString('1'), '9223372036854775808'), '9223372036854775808', 'beyond int64 is not wrapped');
  assert.equal(preserveTypes(when, 12345), 12345, 'numbers are not treated as dates');
});

test('explicit Extended JSON markers win over the stored type', () => {
  assert.ok(preserveTypes('text', { $oid: oid.toHexString() }) instanceof ObjectId);
  assert.ok(preserveTypes(undefined, { $date: '2024-01-01T00:00:00Z' }) instanceof Date);
});

test('nested objects and arrays are reconciled element by element', () => {
  const out = preserveTypes(stored.nested, { at: '2031-01-01T00:00:00.000Z', tags: ['a', 'c'], id: oid.toHexString() });
  assert.ok(out.at instanceof Date);
  assert.equal(out.id, oid);
  assert.deepEqual(out.tags, ['a', 'c']);
  const arr = preserveTypes(stored.list, [{ at: when.toISOString() }, { at: 'x' }]);
  assert.equal(arr[0].at, when);
  assert.equal(arr[1].at, 'x', 'new element has no stored type to follow');
});

test('diffToUpdate emits only changed paths', () => {
  const edited = serializeDoc(stored);
  delete edited._id;
  edited.s = 'changed';
  edited.nested.tags = ['z'];
  delete edited.price;
  edited.added = 1;
  const { $set, $unset } = diffToUpdate(stored, edited);
  assert.deepEqual(Object.keys($set).sort(), ['added', 'nested.tags', 's']);
  assert.deepEqual($unset, { price: '' });
});

test('diffToUpdate never touches _id and returns nothing for an identical doc', () => {
  const { $set, $unset } = diffToUpdate(stored, serializeDoc(stored));
  assert.deepEqual($set, {});
  assert.deepEqual($unset, {});
});

test('diffToUpdate sets a whole subdocument when its keys cannot be addressed', () => {
  const s = { m: { 'a.b': 1 } };
  const { $set } = diffToUpdate(s, { m: { 'a.b': 2 } });
  assert.deepEqual($set, { m: { 'a.b': 2 } });
  const t = { m: { $x: 1 } };
  assert.deepEqual(diffToUpdate(t, { m: { y: 1 } }).$set, { m: { y: 1 } });
});

test('valueAtPath walks objects and arrays and tolerates gaps', () => {
  assert.equal(valueAtPath(stored, 'nested.tags.1'), 'b');
  assert.equal(valueAtPath(stored, 'nested.missing.deep'), undefined);
  assert.equal(valueAtPath({ a: null }, 'a.b'), undefined);
});

test('raw Double and Int32 keep their type on numeric edits', () => {
  const { Double, Int32 } = require('mongodb');
  const d = preserveTypes(new Double(5), 7);
  assert.equal(d._bsontype, 'Double');
  assert.equal(d.valueOf(), 7);
  assert.equal(preserveTypes(new Double(5), '2.5').valueOf(), 2.5);
  assert.equal(preserveTypes(new Int32(1), '8')._bsontype, 'Int32');
  assert.equal(preserveTypes(new Int32(1), 1.5), 1.5, 'a fraction does not fit an Int32');
  assert.equal(preserveTypes(new Int32(1), 2 ** 40), 2 ** 40, 'out of Int32 range stays a plain number');
  const same = new Double(5);
  assert.equal(preserveTypes(same, 5), same, 'unchanged value keeps the stored instance');
});
