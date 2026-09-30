const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, Double } = require('mongodb');
const { useDatabase, freshDb } = require('../helpers/db-fixture');

const ctx = useDatabase();

async function pair(t) {
  if (ctx.skip) return t.skip(ctx.skip);
  const a = await freshDb(ctx, 'cmpa');
  const b = await freshDb(ctx, 'cmpb');
  const compare = (opts = {}) => ctx.db.compareDocuments(a.name, b.name, 'k', { limit: 10, ...opts });
  return { a, b, compare };
}

test('splits ids by type-aware key', async (t) => {
  const p = await pair(t); if (!p) return;
  const hex = '65f000000000000000000001';
  await p.a.handle.collection('k').insertMany([{ _id: 1 }, { _id: '1' }, { _id: new ObjectId(hex) }, { _id: { c: 1 } }]);
  await p.b.handle.collection('k').insertMany([{ _id: 1 }, { _id: hex }, { _id: { c: 1 } }]);
  const res = await p.compare();
  assert.equal(res.counts.common, 2, 'number 1 and compound id');
  assert.equal(res.counts.onlyInSource, 2, '"1" and the ObjectId');
  assert.equal(res.counts.onlyInTarget, 1, 'hex string');
});

test('identical content in a different key order is identical; type changes are differences', async (t) => {
  const p = await pair(t); if (!p) return;
  const when = new Date('2024-01-01T00:00:00Z');
  await p.a.handle.collection('k').insertMany([{ _id: 1, a: 1, b: { x: 1, y: 2 } }, { _id: 2, d: when }, { _id: 3, r: new Double(1.5) }]);
  await p.b.handle.collection('k').insertMany([{ _id: 1, b: { y: 2, x: 1 }, a: 1 }, { _id: 2, d: when.toISOString() }, { _id: 3, r: 1.5 }]);
  const res = await p.compare();
  assert.equal(res.pageIdenticalCount, 2);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0]._id, '2');
  assert.ok(res.items[0].diffs.some(d => d.field === 'd' && d.type === 'modified'));
});

test('paging and tabs', async (t) => {
  const p = await pair(t); if (!p) return;
  await p.a.handle.collection('k').insertMany(Array.from({ length: 25 }, (_, i) => ({ _id: i, v: i })));
  await p.b.handle.collection('k').insertMany(Array.from({ length: 5 }, (_, i) => ({ _id: i, v: i })));
  const page2 = await p.compare({ tab: 'only-source', page: 2 });
  assert.equal(page2.pagination.total, 20);
  assert.equal(page2.pagination.totalPages, 2);
  assert.deepEqual(page2.items.map(d => d._id), [15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  const beyond = await p.compare({ tab: 'only-source', page: 9 });
  assert.equal(beyond.items.length, 0);
  const onlyTarget = await p.compare({ tab: 'only-target' });
  assert.equal(onlyTarget.items.length, 0);
});

test('search matches string ids, ObjectIds and numbers; regex characters are literal', async (t) => {
  const p = await pair(t); if (!p) return;
  const oid = new ObjectId();
  await p.a.handle.collection('k').insertMany([{ _id: 'user.1' }, { _id: 'userX1' }, { _id: oid }, { _id: 77 }]);
  assert.equal((await p.compare({ tab: 'only-source', search: 'user.1' })).pagination.total, 1);
  assert.equal((await p.compare({ tab: 'only-source', search: oid.toHexString() })).pagination.total, 1);
  assert.equal((await p.compare({ tab: 'only-source', search: '77' })).pagination.total, 1);
  assert.equal((await p.compare({ tab: 'only-source', search: '(' })).pagination.total, 0);
});

test('the id split is cached and dropped by writes made through the app', async (t) => {
  const p = await pair(t); if (!p) return;
  await p.a.handle.collection('k').insertMany([{ _id: 1 }, { _id: 2 }]);
  assert.equal((await p.compare()).counts.onlyInSource, 2);
  await p.b.handle.collection('k').insertOne({ _id: 1 });
  assert.equal((await p.compare()).counts.onlyInSource, 2, 'external write within TTL is not seen (cached)');
  await ctx.db.insertDocument('target', p.b.name, 'k', { _id: 2 });
  const res = await p.compare();
  assert.equal(res.counts.onlyInSource, 0);
  assert.equal(res.counts.common, 2);
});

test('copyDocument writes to the target database name and keeps raw types', async (t) => {
  const p = await pair(t); if (!p) return;
  const oid = new ObjectId();
  await p.a.handle.collection('k').insertOne({ _id: oid, r: new Double(2), ref: new ObjectId(), at: new Date() });
  await ctx.db.copyDocument('source', 'target', p.a.name, 'k', oid.toHexString(), p.b.name);
  const copied = await p.b.handle.collection('k').findOne({ _id: oid }, { promoteValues: false });
  assert.equal(copied.r._bsontype, 'Double');
  assert.ok(copied.ref instanceof ObjectId && copied.at instanceof Date);
  await assert.rejects(ctx.db.copyDocument('source', 'target', p.a.name, 'k', 'missing', p.b.name), /not found/);
});

test('syncFields copies selected paths server-side and removes ones missing at the source', async (t) => {
  const p = await pair(t); if (!p) return;
  const when = new Date();
  await p.a.handle.collection('k').insertOne({ _id: 1, d: when, n: { a: 1, b: 2 } });
  await p.b.handle.collection('k').insertOne({ _id: 1, d: 'old', n: { a: 0, b: 0 }, extra: true });
  await ctx.db.syncFields('source', 'target', p.a.name, p.b.name, 'k', '1', ['d', 'n.a', 'extra']);
  const doc = await p.b.handle.collection('k').findOne({ _id: 1 });
  assert.ok(doc.d instanceof Date);
  assert.deepEqual(doc.n, { a: 1, b: 0 });
  assert.equal(doc.extra, undefined);
  await assert.rejects(ctx.db.syncFields('source', 'target', p.a.name, p.b.name, 'k', '99', ['d']), /not found/);
});

test('copyCollectionAcross upserts, keeps doubles, and creates empty targets', async (t) => {
  const p = await pair(t); if (!p) return;
  await p.a.handle.collection('k').insertMany(Array.from({ length: 1200 }, (_, i) => ({ _id: i, r: new Double(1) })));
  await p.b.handle.collection('k').insertOne({ _id: 0, r: 'stale' });
  const res = await ctx.db.copyCollectionAcross('source', p.a.name, 'k', 'target', p.b.name, 'k');
  assert.equal(res.upsertedCount, 1199);
  assert.equal(res.modifiedCount, 1);
  assert.equal((await p.b.handle.collection('k').findOne({ _id: 0 }, { promoteValues: false })).r._bsontype, 'Double');
  await p.a.handle.createCollection('empty');
  await ctx.db.copyCollectionAcross('source', p.a.name, 'empty', 'target', p.b.name, 'empty');
  assert.equal((await p.b.handle.listCollections({ name: 'empty' }).toArray()).length, 1);
});

test('compound _ids with nested ObjectIds stay addressable from the compare view', async (t) => {
  const p = await pair(t); if (!p) return;
  const _id = { org: new ObjectId(), n: 1 };
  const onlyId = { org: new ObjectId(), n: 2 };
  await p.a.handle.collection('k').insertMany([{ _id, v: 1, w: 'src' }, { _id: onlyId, v: 3 }]);
  await p.b.handle.collection('k').insertOne({ _id, v: 2, w: 'dst' });

  const common = await p.compare();
  assert.equal(common.itemIds.length, common.items.length);
  const ref = common.itemIds[0];
  assert.equal(ref.label, JSON.stringify({ org: _id.org.toHexString(), n: 1 }));
  assert.deepEqual(ref.writeId, { org: { $oid: _id.org.toHexString() }, n: { $numberInt: '1' } });

  await ctx.db.patchDocument('source', p.a.name, 'k', ref.writeId, { v: 5 });
  assert.equal((await p.a.handle.collection('k').findOne({ _id })).v, 5);
  await ctx.db.syncFields('source', 'target', p.a.name, p.b.name, 'k', ref.writeId, ['w']);
  assert.equal((await p.b.handle.collection('k').findOne({ _id })).w, 'src');

  const only = await p.compare({ tab: 'only-source' });
  assert.equal(only.itemIds.length, 1);
  await ctx.db.deleteDocument('source', p.a.name, 'k', only.itemIds[0].writeId);
  assert.equal(await p.a.handle.collection('k').countDocuments({ _id: onlyId }), 0);
});
