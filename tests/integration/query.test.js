const test = require('node:test');
const assert = require('node:assert/strict');
const { useDatabase, freshDb } = require('../helpers/db-fixture');

const ctx = useDatabase();
const SLOW = { $expr: { $function: { body: 'function(){ sleep(150); return true; }', args: [], lang: 'js' } } };

async function seed(t, n = 30) {
  if (ctx.skip) return t.skip(ctx.skip);
  const s = await freshDb(ctx, 'query');
  await s.handle.collection('c').insertMany(Array.from({ length: n }, (_, i) => ({ i, even: i % 2 === 0 })));
  return s;
}

test('executeQuery pages, sorts, projects and counts', async (t) => {
  const s = await seed(t); if (!s) return;
  const res = await ctx.db.executeQuery('source', s.name, 'c', { filter: { even: true }, sort: { i: -1 }, projection: { i: 1 }, limit: 5, skip: 5 });
  assert.equal(res.total, 15);
  assert.equal(res.page, 2);
  assert.deepEqual(res.items.map(d => d.i), [18, 16, 14, 12, 10]);
  assert.equal(res.items[0].even, undefined);
  assert.equal(res.itemsEJSON.length, 5);
});

test('an empty filter uses the metadata count', async (t) => {
  const s = await seed(t); if (!s) return;
  assert.equal((await ctx.db.executeQuery('source', s.name, 'c', {})).total, 30);
});

test('counting a view falls back to countDocuments', async (t) => {
  const s = await seed(t); if (!s) return;
  await s.handle.createCollection('evens', { viewOn: 'c', pipeline: [{ $match: { even: true } }] });
  assert.equal((await ctx.db.executeQuery('source', s.name, 'evens', {})).total, 15);
});

test('Extended JSON in filters is revived', async (t) => {
  const s = await seed(t); if (!s) return;
  await s.handle.collection('c').insertOne({ at: new Date('2024-01-01T00:00:00Z') });
  const res = await ctx.db.executeQuery('source', s.name, 'c', { filter: { at: { $gte: { $date: '2023-12-31T00:00:00Z' } } } });
  assert.equal(res.total, 1);
});

test('the per-query time limit is enforced', async (t) => {
  const s = await seed(t, 10); if (!s) return;
  await assert.rejects(ctx.db.executeQuery('source', s.name, 'c', { filter: SLOW, maxTimeMS: 200 }), /time limit/);
});

test('cancel returns immediately and kills the server operation', async (t) => {
  const s = await seed(t, 40); if (!s) return;
  const running = ctx.db.executeQuery('source', s.name, 'c', { filter: SLOW, opId: 'q-cancel', maxTimeMS: 60000 });
  const settled = assert.rejects(running, /cancel/i);
  await new Promise(r => setTimeout(r, 300));
  const started = Date.now();
  const res = await ctx.db.cancelOp('q-cancel');
  await settled;
  assert.ok(res.cancelled);
  assert.ok(Date.now() - started < 2000);
  await new Promise(r => setTimeout(r, 300));
  const left = await ctx.client.db('admin').command({ currentOp: 1, 'command.comment': 'mongoaio:q-cancel' });
  assert.equal(left.inprog.length, 0);
});

test('runAggregate truncates, cancels and detects $out', async (t) => {
  const s = await seed(t); if (!s) return;
  const res = await ctx.db.runAggregate('source', s.name, 'c', [{ $match: { even: true } }], { limit: 5 });
  assert.equal(res.items.length, 5);
  assert.equal(res.truncated, true);
  const out = await ctx.db.runAggregate('source', s.name, 'c', [{ $match: {} }, { $out: 'copy' }], {});
  assert.equal(out.written, true);
  assert.equal(await s.handle.collection('copy').countDocuments(), 30);
  const running = ctx.db.runAggregate('source', s.name, 'c', [{ $match: SLOW }], { opId: 'agg-cancel' });
  const settled = assert.rejects(running, /cancel/i);
  await new Promise(r => setTimeout(r, 300));
  await ctx.db.cancelOp('agg-cancel');
  await settled;
});

test('explain returns a summary within the time limit', async (t) => {
  const s = await seed(t); if (!s) return;
  const res = await ctx.db.explainQuery('source', s.name, 'c', { filter: { i: 3 }, maxTimeMS: 5000 });
  assert.ok(res.summary);
  assert.ok(res.raw);
});

test('schema analysis samples documents', async (t) => {
  const s = await seed(t); if (!s) return;
  const res = await ctx.db.analyzeSchema('source', s.name, 'c', 10);
  assert.equal(res.totalCount, 30);
  assert.ok(res.fields.some(f => (f.path || f.name) === 'i'));
});
