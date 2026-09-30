const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, Double } = require('mongodb');
const { useDatabase, freshDb } = require('../helpers/db-fixture');
const { serializeDocEJSON } = require('../../src/db/serialize');

const ctx = useDatabase();

async function seed(t, doc) {
  if (ctx.skip) return t.skip(ctx.skip);
  const { name, handle } = await freshDb(ctx, 'fields');
  const _id = new ObjectId();
  await handle.collection('c').insertOne({ _id, ...doc });
  const ejson = serializeDocEJSON(await handle.collection('c').findOne({ _id }));
  const apply = (changes) => ctx.db.applyFieldChanges('source', name, 'c', ejson._id, changes);
  const raw = () => handle.collection('c').findOne({ _id }, { promoteValues: false });
  return { name, handle, ejson, apply, raw, _id };
}

test('set and unset land in one atomic update and the saved doc comes back', async (t) => {
  const s = await seed(t, { n: 1, gone: true, keep: new Double(2) }); if (!s) return;
  const res = await s.apply({ set: { n: 2 }, unset: ['gone'], expect: { n: 1, gone: true } });
  assert.equal(res.document.n, 2);
  assert.equal(res.documentEJSON.gone, undefined);
  assert.equal((await s.raw()).keep._bsontype, 'Double');
});

test('a stale expected value is a conflict and nothing is written', async (t) => {
  const s = await seed(t, { n: 1 }); if (!s) return;
  await s.handle.collection('c').updateOne({ _id: s._id }, { $set: { n: 5 } });
  await assert.rejects(s.apply({ set: { n: 2 }, expect: { n: 1 } }), /changed on the server/);
  assert.equal((await s.raw()).n.valueOf(), 5);
});

test('a deleted document is reported as a conflict', async (t) => {
  const s = await seed(t, { n: 1 }); if (!s) return;
  await s.handle.collection('c').deleteOne({ _id: s._id });
  await assert.rejects(s.apply({ set: { n: 2 } }), /changed on the server|deleted/);
});

test('null values and missing fields are distinguished', async (t) => {
  const s = await seed(t, { z: null }); if (!s) return;
  await s.apply({ set: { z: 1 }, expect: { z: null } });
  await assert.rejects(s.apply({ set: { y: 1 }, expectMissing: ['z'] }), /changed/);
  await s.apply({ set: { y: 1 }, expectMissing: ['y'] });
  assert.equal((await s.raw()).y.valueOf(), 1);
});

test('expected values match typed and nested data exactly', async (t) => {
  const when = new Date('2024-01-01T00:00:00Z');
  const s = await seed(t, { when, sub: { a: [1, { b: new ObjectId() }] } }); if (!s) return;
  await s.apply({ set: { when: '2025-01-01T00:00:00.000Z' }, expect: { when: s.ejson.when, sub: s.ejson.sub } });
  const d = await s.raw();
  assert.ok(d.when instanceof Date && d.when.getUTCFullYear() === 2025);
});

test('regex values skip the equality check instead of failing it', async (t) => {
  const s = await seed(t, { pattern: /ab+c/i, n: 1 }); if (!s) return;
  await s.apply({ set: { n: 2 }, expect: { pattern: s.ejson.pattern } });
  assert.equal((await s.raw()).n.valueOf(), 2);
});

test('exact mode restores the given types (undo) without coercion', async (t) => {
  const hex = new ObjectId().toHexString();
  const s = await seed(t, { v: hex }); if (!s) return;
  await s.apply({ set: { v: { $oid: hex } } });
  assert.ok((await s.raw()).v instanceof ObjectId);
  await s.apply({ set: { v: hex }, expect: { v: { $oid: hex } }, exact: true });
  assert.equal(typeof (await s.raw()).v, 'string', 'coercion would have kept it an ObjectId');
});

test('nested paths and array indexes', async (t) => {
  const s = await seed(t, { a: { b: [1, 2, 3] } }); if (!s) return;
  await s.apply({ set: { 'a.b.1': 20 }, unset: ['a.b.2'], expect: { 'a.b.1': 2 } });
  assert.deepEqual((await s.raw()).a.b.map(v => (v === null ? null : v.valueOf())), [1, 20, null]);
});

test('_id can never be set or unset', async (t) => {
  const s = await seed(t, { n: 1 }); if (!s) return;
  await assert.rejects(s.apply({ set: { _id: 1 } }), /_id/);
  await assert.rejects(s.apply({ unset: ['_id'] }), /_id/);
});

test('an empty change set returns the current document without writing', async (t) => {
  const s = await seed(t, { n: 1 }); if (!s) return;
  const res = await s.apply({});
  assert.equal(res.document.n, 1);
});

test('edits keep a whole-number double a double, and undo restores its exact type', async (t) => {
  const { Int32 } = require('mongodb');
  const s = await seed(t, { d: new Double(5), i: new Int32(3) }); if (!s) return;
  assert.equal(s.ejson.d, 5, 'relaxed EJSON cannot tell 5.0 from 5');

  const res = await s.apply({ set: { d: 7, i: 4 }, expect: { d: 5, i: 3 } });
  assert.equal((await s.raw()).d._bsontype, 'Double', 'edit kept the double');
  assert.equal((await s.raw()).i._bsontype, 'Int32');
  assert.deepEqual(res.previousEJSON, { d: { $numberDouble: '5.0' }, i: { $numberInt: '3' } });

  await s.apply({ set: { d: 'text' }, expect: { d: 7 } });
  assert.equal((await s.raw()).d, 'text', 'a deliberate type change is kept');
  await s.apply({ set: { d: res.previousEJSON.d }, expect: { d: 'text' }, exact: true });
  const undone = await s.raw();
  assert.equal(undone.d._bsontype, 'Double', 'undo restored a double, not an int');
  assert.equal(undone.d.valueOf(), 5);
});
