const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, Decimal128, Long, Double, Int32 } = require('mongodb');
const { useDatabase, freshDb } = require('../helpers/db-fixture');
const { serializeDoc } = require('../../src/db/serialize');

const ctx = useDatabase();
const oid = new ObjectId();
const ref = new ObjectId();
const when = new Date('2024-05-01T10:00:00Z');

async function seed(t) {
  if (ctx.skip) return t.skip(ctx.skip);
  const { name, handle } = await freshDb(ctx, 'writes');
  await handle.collection('c').insertOne({
    _id: oid, ref, when, price: Decimal128.fromString('9.99'), big: Long.fromString('9007199254740993'),
    ratio: new Double(2), i32: new Int32(3), nested: { at: when, id: ref, tags: ['x'] }, s: 'text',
  });
  const raw = () => handle.collection('c').findOne({ _id: oid }, { promoteValues: false });
  return { name, handle, raw };
}

function assertTypesIntact(d) {
  assert.ok(d.ref instanceof ObjectId, 'ref');
  assert.ok(d.when instanceof Date, 'when');
  assert.ok(d.nested.at instanceof Date && d.nested.id instanceof ObjectId, 'nested');
  assert.equal(d.price._bsontype, 'Decimal128');
  assert.equal(d.big.toString(), '9007199254740993');
  assert.equal(d.ratio._bsontype, 'Double', 'whole-number double stays a double');
  assert.equal(d.i32._bsontype, 'Int32');
}

test('updateDocument with the lossy display form writes only the edited field', async (t) => {
  const s = await seed(t); if (!s) return;
  const display = serializeDoc(await s.handle.collection('c').findOne({ _id: oid }));
  display.s = 'edited';
  const res = await ctx.db.updateDocument('source', s.name, 'c', oid.toHexString(), display);
  assert.equal(res.modifiedCount, 1);
  const d = await s.raw();
  assertTypesIntact(d);
  assert.equal(d.s, 'edited');
});

test('updateDocument with EJSON: typed edits and removed fields', async (t) => {
  const s = await seed(t); if (!s) return;
  const ej = await ctx.db.getDocument('source', s.name, 'c', oid.toHexString());
  assert.ok(ej.ref.$oid, 'getDocument returns Extended JSON');
  ej.when = { $date: '2030-01-01T00:00:00.000Z' };
  delete ej.s;
  await ctx.db.updateDocument('source', s.name, 'c', oid.toHexString(), ej);
  const d = await s.raw();
  assert.equal(d.when.getUTCFullYear(), 2030);
  assert.equal(d.s, undefined);
  assert.equal(d.big.toString(), '9007199254740993', 'big Long survives the EJSON round trip');
});

test('updateDocument is a no-op when nothing changed and ignores _id', async (t) => {
  const s = await seed(t); if (!s) return;
  const display = serializeDoc(await s.handle.collection('c').findOne({ _id: oid }));
  display._id = 'other';
  assert.deepEqual(await ctx.db.updateDocument('source', s.name, 'c', oid.toHexString(), display), { modifiedCount: 0 });
});

test('updateDocument on a missing document fails clearly', async (t) => {
  const s = await seed(t); if (!s) return;
  await assert.rejects(ctx.db.updateDocument('source', s.name, 'c', new ObjectId().toHexString(), { a: 1 }), /not found/);
});

test('patchDocument coerces edited text to the stored type', async (t) => {
  const s = await seed(t); if (!s) return;
  await ctx.db.patchDocument('source', s.name, 'c', oid.toHexString(),
    { 'nested.at': '2023-03-03T00:00:00.000Z', ref: ref.toHexString(), price: '1.25', _id: 'ignored' });
  const d = await s.raw();
  assert.equal(d.nested.at.getUTCFullYear(), 2023);
  assert.ok(d.ref instanceof ObjectId);
  assert.equal(d.price.toString(), '1.25');
  assert.equal(d._id.toHexString(), oid.toHexString());
});

test('setField adds new fields as given and keeps types on existing ones', async (t) => {
  const s = await seed(t); if (!s) return;
  await ctx.db.setField('source', s.name, 'c', oid.toHexString(), 'fresh', { $date: '2020-01-01T00:00:00Z' });
  await ctx.db.setField('source', s.name, 'c', oid.toHexString(), 'when', '2021-01-01T00:00:00.000Z');
  const d = await s.raw();
  assert.ok(d.fresh instanceof Date && d.when instanceof Date);
  await assert.rejects(ctx.db.setField('source', s.name, 'c', oid.toHexString(), '_id', 1), /_id/);
});

test('insertDocument keeps nested ObjectIds in a compound _id', async (t) => {
  const s = await seed(t); if (!s) return;
  const res = await ctx.db.insertDocument('source', s.name, 'c', { _id: { k: 1, r: { $oid: ref.toHexString() } }, v: 1 });
  assert.equal(JSON.parse(res.insertedId).r.$oid, ref.toHexString());
  const d = await s.handle.collection('c').findOne({ 'v': 1 });
  assert.ok(d._id.r instanceof ObjectId);
  const hexRes = await ctx.db.insertDocument('source', s.name, 'c', { _id: new ObjectId().toHexString(), v: 2 });
  assert.ok(ObjectId.isValid(hexRes.insertedId));
});

test('ambiguous ids: hex-looking string, numeric, compound', async (t) => {
  const s = await seed(t); if (!s) return;
  const hex = new ObjectId().toHexString();
  await s.handle.collection('c').insertMany([{ _id: hex, v: 's' }, { _id: 42, v: 'n' }, { _id: { a: 1, b: ref }, v: 'c' }]);
  assert.equal((await ctx.db.getDocument('source', s.name, 'c', hex)).v, 's');
  assert.equal((await ctx.db.getDocument('source', s.name, 'c', '42')).v, 'n');
  assert.equal((await ctx.db.getDocument('source', s.name, 'c', { a: 1, b: { $oid: ref.toHexString() } })).v, 'c');
  assert.equal(await ctx.db.getDocument('source', s.name, 'c', 'missing'), null);
  assert.equal((await ctx.db.deleteDocument('source', s.name, 'c', hex)).deletedCount, 1);
});

test('deleteDocuments revives Extended JSON filters', async (t) => {
  const s = await seed(t); if (!s) return;
  await s.handle.collection('c').insertMany([{ when: when, tag: 'a' }, { when: new Date(0), tag: 'b' }]);
  const res = await ctx.db.deleteDocuments('source', s.name, 'c', { when: { $gt: { $date: '2000-01-01T00:00:00Z' } }, tag: 'a' });
  assert.equal(res.deletedCount, 1);
  const byId = await ctx.db.deleteDocuments('source', s.name, 'c', { _id: oid.toHexString() });
  assert.equal(byId.deletedCount, 1);
});

test('renameField validates paths and only touches documents with the field', async (t) => {
  const s = await seed(t); if (!s) return;
  await s.handle.collection('c').insertOne({ other: 1 });
  assert.equal((await ctx.db.renameField('source', s.name, 'c', 's', 'label')).modifiedCount, 1);
  for (const [from, to] of [['s', '$bad'], ['_id', 'x'], ['a..b', 'c'], ['a', 'a.b'], ['a.b', 'a']]) {
    await assert.rejects(ctx.db.renameField('source', s.name, 'c', from, to), undefined, `${from} -> ${to}`);
  }
  assert.equal((await ctx.db.renameField('source', s.name, 'c', 'x', 'x')).modifiedCount, 0);
});

test('patchDocument and updateDocument keep Double and Int32 on numeric edits', async (t) => {
  if (ctx.skip) return t.skip(ctx.skip);
  const { name, handle } = await freshDb(ctx, 'numtypes');
  await handle.collection('c').insertOne({ _id: 1, d: new Double(2), i: new Int32(2), keep: new Double(9) });
  const raw = () => handle.collection('c').findOne({ _id: 1 }, { promoteValues: false });
  await ctx.db.patchDocument('source', name, 'c', 1, { d: '3' });
  await ctx.db.updateDocument('source', name, 'c', 1, { _id: 1, d: 3, i: 4, keep: 9 });
  const doc = await raw();
  assert.equal(doc.d._bsontype, 'Double');
  assert.equal(doc.i._bsontype, 'Int32');
  assert.equal(doc.i.valueOf(), 4);
  assert.equal(doc.keep._bsontype, 'Double', 'untouched whole-number double not rewritten as int');
});
