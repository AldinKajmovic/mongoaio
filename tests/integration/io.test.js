const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { ObjectId } = require('mongodb');
const { useDatabase, freshDb } = require('../helpers/db-fixture');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mongoaio-io-'));
const dialogAnswer = { path: null, canceled: false };
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') {
    return {
      dialog: {
        showSaveDialog: async () => ({ canceled: dialogAnswer.canceled, filePath: dialogAnswer.path }),
        showOpenDialog: async () => ({ canceled: dialogAnswer.canceled, filePaths: [dialogAnswer.path] }),
      },
    };
  }
  return origLoad.call(this, request, ...rest);
};
const io = require('../../src/main/io');
test.after(() => { Module._load = origLoad; fs.rmSync(dir, { recursive: true, force: true }); });

const ctx = useDatabase();

async function seed(t) {
  if (ctx.skip) return t.skip(ctx.skip);
  const s = await freshDb(ctx, 'io');
  await s.handle.collection('c').insertMany([
    { _id: new ObjectId(), name: '=HYPERLINK("x")', zip: '00123', at: new Date('2024-01-01T00:00:00Z'), n: { a: 1 } },
    { _id: new ObjectId(), name: 'plain, "quoted"', zip: '10001', n: { a: 2, b: 3 } },
  ]);
  return s;
}

for (const format of ['json', 'jsonl', 'csv']) {
  test(`${format} export then import round-trips`, async (t) => {
    const s = await seed(t); if (!s) return;
    dialogAnswer.path = path.join(dir, `out.${format}`);
    const exported = await io.exportData(null, ctx.db, { dbName: s.name, collName: 'c', format, scope: 'all' });
    assert.equal(exported.count, 2);
    const imported = await io.importData(null, ctx.db, { dbName: s.name, collName: `back_${format}`, format });
    assert.equal(imported.insertedCount, 2);
    const coll = s.handle.collection(`back_${format}`);
    const first = await coll.findOne({ name: '=HYPERLINK("x")' });
    assert.ok(first, 'formula guard is undone on import');
    assert.equal(first.zip, '00123', 'zero-padded text survives');
    const docs = [first, await coll.findOne({ name: 'plain, "quoted"' })];
    assert.ok(docs[1], 'quotes and commas survive');
    if (format !== 'csv') {
      assert.ok(docs[0].at instanceof Date && docs[0]._id instanceof ObjectId, 'types survive');
    } else {
      assert.equal(docs[1]['n.b'], 3, 'CSV flattens nested fields');
      const text = fs.readFileSync(dialogAnswer.path, 'utf8');
      assert.ok(text.includes(`"'=HYPERLINK(""x"")"`), 'formula neutralised in the file');
    }
  });
}

test('export honours filter and limit; cancel returns canceled', async (t) => {
  const s = await seed(t); if (!s) return;
  dialogAnswer.path = path.join(dir, 'filtered.json');
  const res = await io.exportData(null, ctx.db, { dbName: s.name, collName: 'c', filter: { zip: '10001' }, limit: 5 });
  assert.equal(res.count, 1);
  dialogAnswer.canceled = true;
  assert.deepEqual(await io.exportData(null, ctx.db, { dbName: s.name, collName: 'c' }), { canceled: true });
  dialogAnswer.canceled = false;
});

test('import skips duplicates and malformed lines instead of failing the batch', async (t) => {
  const s = await seed(t); if (!s) return;
  dialogAnswer.path = path.join(dir, 'dupes.jsonl');
  fs.writeFileSync(dialogAnswer.path, '{"_id":1}\n{"_id":1}\nnot json\n\n{"_id":2}\n');
  const res = await io.importData(null, ctx.db, { dbName: s.name, collName: 'd' });
  assert.equal(res.insertedCount, 2);
  assert.equal(res.skipped, 2);
});

test('import requires db and collection', async () => {
  await assert.rejects(io.importData(null, null, {}), /required/);
  await assert.rejects(io.exportData(null, null, {}), /required/);
});
