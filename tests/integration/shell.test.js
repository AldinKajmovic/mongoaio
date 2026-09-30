const test = require('node:test');
const assert = require('node:assert/strict');
const { useDatabase, freshDb } = require('../helpers/db-fixture');

const ctx = useDatabase();

async function shell(t) {
  if (ctx.skip) return t.skip(ctx.skip);
  const s = await freshDb(ctx, 'shell');
  await s.handle.collection('c').insertMany(Array.from({ length: 25 }, (_, i) => ({ i })));
  const run = (code, opts) => ctx.db.evaluateShell('source', s.name, code, opts);
  return { ...s, run };
}

test('expressions, statements and top-level await', async (t) => {
  const s = await shell(t); if (!s) return;
  assert.equal((await s.run('1 + 1')).result, 2);
  assert.equal((await s.run('const x = 2; x * 3')).result, 6);
  assert.equal((await s.run('await db.c.countDocuments({})')).result, 25);
  assert.equal((await s.run('let n = 0; for (const d of await db.c.find({i: {$lt: 3}}).toArray()) n += d.i; n')).result, 3);
});

test('find() is server-paginated with a live cursor', async (t) => {
  const s = await shell(t); if (!s) return;
  const first = await s.run('db.c.find({}).sort({i: 1})', { pageSize: 10 });
  assert.equal(first.paginated, true);
  assert.equal(first.result.length, 10);
  assert.equal(first.total, 25);
  assert.equal(first.hasMore, true);
  const next = await ctx.db.shellCursorNext(first.cursorId);
  assert.deepEqual(next.result.map(d => d.i), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  await ctx.db.closeShellCursor(first.cursorId);
  assert.deepEqual(await ctx.db.shellCursorNext(first.cursorId), { expired: true });
  const page3 = await s.run('db.c.find({}).sort({i: 1})', { pageSize: 10, page: 3 });
  assert.deepEqual(page3.result.map(d => d.i), [20, 21, 22, 23, 24]);
  assert.equal(page3.hasMore, false);
});

test('mutating or self-paged code is not re-run for pagination', async (t) => {
  const s = await shell(t); if (!s) return;
  const paged = await s.run('db.c.find({}).limit(3)');
  assert.ok(!paged.paginated);
  assert.equal(paged.result.length, 3);
  const mutating = await s.run('db.c.insertOne({i: 99}); db.c.find({})');
  assert.ok(!mutating.paginated);
  assert.equal(await s.handle.collection('c').countDocuments({ i: 99 }), 1);
});

test('mongosh helpers and print()', async (t) => {
  const s = await shell(t); if (!s) return;
  const res = await s.run('print("hello", {a: 1}); ObjectId("65f000000000000000000001").toHexString()');
  assert.equal(res.result, '65f000000000000000000001');
  assert.deepEqual(res.printed, ['hello {"a":1}']);
  assert.equal((await s.run('NumberLong("9007199254740993").toString()')).result, '9007199254740993');
  assert.ok((await s.run('ISODate("2024-01-01")')).result);
});

test('Node globals are shadowed', async (t) => {
  const s = await shell(t); if (!s) return;
  assert.equal((await s.run('typeof require')).result, 'undefined');
  assert.equal((await s.run('typeof process')).result, 'undefined');
});

test('syntax errors and driver errors surface as rejections', async (t) => {
  const s = await shell(t); if (!s) return;
  await assert.rejects(s.run('db.c.find({'), SyntaxError);
  await assert.rejects(s.run('db.c.aggregate([{$bogus: 1}]).toArray()'), /bogus|Unrecognized/i);
});

test('large cursors stream a page at a time instead of being drained', async (t) => {
  const s = await shell(t); if (!s) return;
  await s.handle.collection('big').insertMany(Array.from({ length: 1100 }, (_, i) => ({ i })));
  const res = await s.run('db.big.aggregate([{$match: {}}])', { pageSize: 50 });
  assert.equal(res.paginated, true);
  assert.equal(res.result.length, 50);
  assert.equal(res.hasMore, true);
  await ctx.db.closeShellCursor(res.cursorId);
});

test('live cursors are capped so forgotten results cannot leak', async (t) => {
  const s = await shell(t); if (!s) return;
  const ids = [];
  for (let i = 0; i < 27; i++) ids.push((await s.run('db.c.find({})', { pageSize: 1 })).cursorId);
  assert.deepEqual(await ctx.db.shellCursorNext(ids[0]), { expired: true }, 'oldest evicted');
  assert.equal((await ctx.db.shellCursorNext(ids[26])).result.length, 1);
  for (const id of ids) await ctx.db.closeShellCursor(id);
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Wait long enough that a still-running loop would have written more rows. */
async function assertLoopStopped(coll) {
  const before = await coll.countDocuments({});
  await sleep(250);
  assert.equal(await coll.countDocuments({}), before, 'script kept writing after it was stopped');
}

test('a shell script is stopped at its time limit', async (t) => {
  const s = await shell(t); if (!s) return;
  await assert.rejects(
    s.run('for (;;) { await db.loop.insertOne({ at: new Date() }); }', { maxTimeMS: 300 }),
    /exceeded time limit/);
  await assertLoopStopped(s.handle.collection('loop'));
});

test('cancel-op stops a running shell script', async (t) => {
  const s = await shell(t); if (!s) return;
  const run = assert.rejects(
    s.run('for (;;) { await db.loop.insertOne({ at: new Date() }); }', { opId: 'shell-cancel-test' }),
    /cancelled/);
  await sleep(150);
  assert.equal((await ctx.db.cancelOp('shell-cancel-test')).cancelled, true);
  await run;
  await assertLoopStopped(s.handle.collection('loop'));
});

test('a finished shell run is no longer cancellable and its live cursor survives', async (t) => {
  const s = await shell(t); if (!s) return;
  const res = await s.run('db.c.find({}).sort({i: 1})', { pageSize: 5, opId: 'shell-done-test' });
  assert.deepEqual(await ctx.db.cancelOp('shell-done-test'), { cancelled: false });
  const next = await ctx.db.shellCursorNext(res.cursorId);
  assert.deepEqual(next.result.map(d => d.i), [5, 6, 7, 8, 9]);
  await ctx.db.closeShellCursor(res.cursorId);
});

test('a synchronous infinite loop is stopped at the time limit and the shell recovers', async (t) => {
  const s = await shell(t); if (!s) return;
  const started = Date.now();
  await assert.rejects(s.run('while (true) {}', { maxTimeMS: 300 }), /exceeded time limit/);
  assert.ok(Date.now() - started < 3000, 'stopped within the grace period, main thread never blocked');
  assert.equal((await s.run('1 + 1')).result, 2, 'a fresh worker runs the next command');
});

test('cancel-op stops a synchronous loop and leaves the main thread responsive', async (t) => {
  const s = await shell(t); if (!s) return;
  const run = assert.rejects(s.run('for (;;) {}', { opId: 'shell-sync-cancel' }), /cancelled/);
  await sleep(200);
  const tick = Date.now();
  await sleep(10);
  assert.ok(Date.now() - tick < 200, 'main event loop keeps running while the script spins');
  assert.equal((await ctx.db.cancelOp('shell-sync-cancel')).cancelled, true);
  await run;
  assert.equal((await s.run('await db.c.countDocuments({})')).result, 25);
});

test('reconnecting restarts the shell worker with the new connection', async (t) => {
  const s = await shell(t); if (!s) return;
  const res = await s.run('db.c.find({})', { pageSize: 5 });
  await ctx.db.connectBoth(ctx.uri, ctx.uri);
  assert.deepEqual(await ctx.db.shellCursorNext(res.cursorId), { expired: true }, 'old worker and its cursors are gone');
  assert.equal((await s.run('await db.c.countDocuments({})')).result, 25);
});
