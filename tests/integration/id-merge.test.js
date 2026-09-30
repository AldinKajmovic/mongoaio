const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, Decimal128, Binary, MinKey, MaxKey, Timestamp, Long, Double } = require('mongodb');
const { useDatabase, freshDb } = require('../helpers/db-fixture');
const { compareIds } = require('../../src/db/bson-order');
const { idPage, streamIdPage, lookupIdPage } = require('../../src/db/id-merge');
const { typedKey } = require('../../src/db/serialize');

const ctx = useDatabase();

/** One _id of every orderable kind, deliberately inserted out of order. */
function mixedIds() {
  return [
    'b', 'a', 'B', 'é', '\u{1F600}', '', '', 7, -2.5, 0, new Long('9007199254740993'), Decimal128.fromString('3.25'),
    new ObjectId('65f000000000000000000002'), new ObjectId('65f000000000000000000001'),
    new Date('2024-01-02'), new Date('2023-12-31'), true, false, null, new MinKey(), new MaxKey(),
    { a: 1 }, { a: 'x' }, { a: 1, b: 2 }, { b: 0 }, { a: { c: 1 } },
    new Binary(Buffer.from('zz')), new Binary(Buffer.from('a')), new Binary(Buffer.from('a'), 4),
    new Timestamp({ t: 5, i: 1 }), new Timestamp({ t: 4, i: 9 }),
  ];
}

test('compareIds agrees with the server sort order for every supported _id type', async (t) => {
  if (ctx.skip) return t.skip(ctx.skip);
  const { handle } = await freshDb(ctx, 'order');
  await handle.collection('ids').insertMany(mixedIds().map(_id => ({ _id })));
  const sorted = (await handle.collection('ids').find({}, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray()).map(d => d._id);
  for (let i = 1; i < sorted.length; i++) {
    assert.equal(compareIds(sorted[i - 1], sorted[i]), -1, `${typedKey(sorted[i - 1])} < ${typedKey(sorted[i])}`);
  }
});

async function pair(t, targetOptions) {
  if (ctx.skip) return t.skip(ctx.skip);
  const a = await freshDb(ctx, 'mrga');
  const b = await freshDb(ctx, 'mrgb');
  if (targetOptions) await b.handle.createCollection('k', targetOptions);
  return { source: a.handle.collection('k'), target: b.handle.collection('k') };
}

/** Expected split, computed independently with Sets of typed keys. */
async function expectedSplit(source, target) {
  const read = async (c) => (await c.find({}, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray()).map(d => d._id);
  const [s, t] = await Promise.all([read(source), read(target)]);
  const sKeys = new Set(s.map(typedKey)), tKeys = new Set(t.map(typedKey));
  return {
    onlyInSource: s.filter(id => !tKeys.has(typedKey(id))).map(typedKey),
    onlyInTarget: t.filter(id => !sKeys.has(typedKey(id))).map(typedKey),
    common: s.filter(id => tKeys.has(typedKey(id))).map(typedKey),
  };
}

async function assertMatchesExpected(page, source, target) {
  const expected = await expectedSplit(source, target);
  for (const tab of ['onlyInSource', 'onlyInTarget', 'common']) {
    for (const skip of [0, 4, 100]) {
      const res = await page(source, target, {}, tab, skip, 4);
      assert.equal(res.counts[tab], expected[tab].length, `${tab} count`);
      assert.deepEqual(res.pageIds.map(typedKey).sort(), expected[tab].slice(skip, skip + 4).sort(), `${tab} skip ${skip}`);
    }
  }
}

test('streamed and looked-up pages both match an independent split', async (t) => {
  const p = await pair(t); if (!p) return;
  const ids = mixedIds();
  await p.source.insertMany(ids.filter((_, i) => i % 3 !== 0).map(_id => ({ _id })));
  await p.target.insertMany(ids.filter((_, i) => i % 3 !== 1).map(_id => ({ _id })).concat([{ _id: new Double(7) }]));
  await assertMatchesExpected(streamIdPage, p.source, p.target);
  await assertMatchesExpected(lookupIdPage, p.source, p.target);
});

test('a case-insensitive collation is compared exactly without loading every id', async (t) => {
  const p = await pair(t, { collation: { locale: 'en', strength: 2 } }); if (!p) return;
  await p.source.insertMany(['a', 'B', 'c'].map(_id => ({ _id })));
  await p.target.insertMany(['A', 'B', 'D'].map(_id => ({ _id })));
  const res = await idPage(p.source, p.target, {}, 'common', 0, 10);
  assert.deepEqual(res.pageIds, ['B'], "'a' and 'A' are different ids even though the collation folds case");
  assert.deepEqual(res.counts, { onlyInSource: 2, onlyInTarget: 2, common: 1, sourceTotal: 3, targetTotal: 3 });
});

test('the lookup path pages correctly across batch boundaries', async (t) => {
  const p = await pair(t); if (!p) return;
  await p.source.insertMany(Array.from({ length: 2500 }, (_, i) => ({ _id: i })));
  await p.target.insertMany(Array.from({ length: 2500 }, (_, i) => ({ _id: i * 2 })));
  const res = await lookupIdPage(p.source, p.target, {}, 'onlyInSource', 1000, 3);
  assert.deepEqual(res.counts, { onlyInSource: 1250, onlyInTarget: 1250, common: 1250, sourceTotal: 2500, targetTotal: 2500 });
  assert.deepEqual(res.pageIds, [2001, 2003, 2005]);
});
