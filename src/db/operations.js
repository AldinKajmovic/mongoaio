const { getClient } = require('./connection');
const { serializeDocEJSON, deserializeInput } = require('./serialize');
const { buildIdQuery, coerceNewId } = require('./id-query');
const { diffToUpdate, preserveTypes, valueAtPath } = require('./type-preserve');

// Raw reads for copy/sync keep Int32/Double/Long exact.
const RAW_READ = { promoteValues: false };

function collection(side, dbName, collName) {
  return getClient(side).db(dbName).collection(collName);
}

/** One document by _id, as Extended JSON (editable without losing types). */
async function getDocument(side, dbName, collName, docId) {
  const doc = await collection(side, dbName, collName).findOne(buildIdQuery(docId));
  return doc ? serializeDocEJSON(doc) : null;
}

async function insertDocument(side, dbName, collName, doc) {
  // Revive Extended JSON ($oid/$date/...) so pasted docs keep their BSON types.
  const revived = deserializeInput(doc);
  if (revived._id !== undefined) revived._id = coerceNewId(revived._id);
  const result = await collection(side, dbName, collName).insertOne(revived);
  const id = result.insertedId;
  const isCompound = id !== null && typeof id === 'object' && !id._bsontype;
  return { insertedId: isCompound ? JSON.stringify(serializeDocEJSON({ id }).id) : String(id) };
}

/** Save an edited document as a diff against the stored one. */
async function updateDocument(side, dbName, collName, docId, updates) {
  const coll = collection(side, dbName, collName);
  const stored = await coll.findOne(buildIdQuery(docId), RAW_READ);
  if (!stored) throw new Error('Document not found — it may have been deleted.');

  const { _id, ...fields } = updates;
  const { $set, $unset } = diffToUpdate(stored, fields);
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  if (!update.$set && !update.$unset) return { modifiedCount: 0 };

  const result = await coll.updateOne({ _id: stored._id }, update);
  return { modifiedCount: result.modifiedCount };
}

async function deleteDocument(side, dbName, collName, docId) {
  const result = await collection(side, dbName, collName).deleteOne(buildIdQuery(docId));
  return { deletedCount: result.deletedCount };
}

/** $set the given dotted paths, coercing each value to the stored field's type. */
async function patchDocument(side, dbName, collName, docId, updates) {
  const coll = collection(side, dbName, collName);
  const stored = await coll.findOne(buildIdQuery(docId), RAW_READ);
  if (!stored) throw new Error('Document not found — it may have been deleted.');

  const $set = {};
  for (const [path, value] of Object.entries(updates)) {
    if (path === '_id') continue;
    $set[path] = preserveTypes(valueAtPath(stored, path), value);
  }
  if (Object.keys($set).length === 0) return { modifiedCount: 0 };
  const result = await coll.updateOne({ _id: stored._id }, { $set });
  return { modifiedCount: result.modifiedCount };
}

/** Copy one document between sides (upsert by _id). */
async function copyDocument(fromSide, toSide, fromDb, collName, docId, toDb = fromDb) {
  const doc = await collection(fromSide, fromDb, collName).findOne(buildIdQuery(docId), RAW_READ);
  if (!doc) throw new Error('Document not found');
  await collection(toSide, toDb, collName).replaceOne({ _id: doc._id }, doc, { upsert: true });
  return { success: true };
}

/** Sync selected field paths from one side's document to the other's. */
async function syncFields(fromSide, toSide, fromDb, toDb, collName, docId, paths) {
  const src = await collection(fromSide, fromDb, collName).findOne(buildIdQuery(docId), RAW_READ);
  if (!src) throw new Error('Source document not found');

  const update = {};
  for (const path of paths) {
    if (path === '_id') continue;
    const value = valueAtPath(src, path);
    if (value === undefined) (update.$unset ||= {})[path] = '';
    else (update.$set ||= {})[path] = value;
  }
  if (!update.$set && !update.$unset) return { modifiedCount: 0 };

  const result = await collection(toSide, toDb, collName).updateOne({ _id: src._id }, update);
  if (result.matchedCount === 0) throw new Error('Target document not found');
  return { modifiedCount: result.modifiedCount };
}

async function copyCollectionAcross(fromSide, fromDb, fromColl, toSide, toDb, toColl) {
  const toClient = getClient(toSide);
  const sourceColl = collection(fromSide, fromDb, fromColl);
  const targetColl = toClient.db(toDb).collection(toColl);

  const cursor = sourceColl.find({}, RAW_READ);

  // Ensure the target collection exists even for an empty source. Probing the
  // cursor avoids the extra full pass a pre-emptive countDocuments would cost.
  if (!(await cursor.hasNext())) {
    const existing = await toClient.db(toDb).listCollections({ name: toColl }).toArray();
    if (existing.length === 0) await toClient.db(toDb).createCollection(toColl);
    return { copiedCount: 0, matchedCount: 0, upsertedCount: 0, modifiedCount: 0 };
  }

  // Stream the source in batches and upsert by _id so existing docs are UPDATED
  // (not skipped) and new docs are inserted — this is what a sync must do.
  const BATCH_SIZE = 500;
  let batch = [];
  let upsertedCount = 0;
  let modifiedCount = 0;
  let matchedCount = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const ops = batch.map(doc => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
    }));
    const res = await targetColl.bulkWrite(ops, { ordered: false });
    upsertedCount += res.upsertedCount || 0;
    modifiedCount += res.modifiedCount || 0;
    matchedCount += res.matchedCount || 0;
    batch = [];
  };

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  return {
    copiedCount: upsertedCount + modifiedCount,
    matchedCount,
    upsertedCount,
    modifiedCount,
  };
}

async function createDatabase(side, dbName, collName) {
  await getClient(side).db(dbName).createCollection(collName || '_init');
  return { success: true };
}

async function dropDatabase(side, dbName) {
  await getClient(side).db(dbName).dropDatabase();
  return { success: true };
}

async function dropCollection(side, dbName, collName) {
  await collection(side, dbName, collName).drop();
  return { success: true };
}

async function createCollection(side, dbName, collName, options = {}) {
  await getClient(side).db(dbName).createCollection(collName, options);
  return { success: true };
}

/** Reject a path $rename can't take: empty segments, `$` operators, `_id`. */
function assertRenamablePath(path, label) {
  const parts = path.split('.');
  if (parts.some(p => p === '' || p.startsWith('$'))) {
    throw new Error(`Invalid ${label} "${path}": segments must be non-empty and must not start with "$".`);
  }
  if (parts[0] === '_id') throw new Error('The _id field cannot be renamed.');
}

async function renameField(side, dbName, collName, oldName, newName) {
  assertRenamablePath(oldName, 'field name');
  assertRenamablePath(newName, 'new field name');
  if (oldName === newName) return { modifiedCount: 0 };
  if (newName.startsWith(`${oldName}.`) || oldName.startsWith(`${newName}.`)) {
    throw new Error('A field cannot be renamed into its own parent or child.');
  }
  const result = await collection(side, dbName, collName)
    .updateMany({ [oldName]: { $exists: true } }, { $rename: { [oldName]: newName } });
  return { modifiedCount: result.modifiedCount };
}

async function deleteDocuments(side, dbName, collName, query) {
  const filter = deserializeInput(query);
  if (typeof filter._id === 'string') Object.assign(filter, buildIdQuery(filter._id));
  const result = await collection(side, dbName, collName).deleteMany(filter);
  return { deletedCount: result.deletedCount };
}

module.exports = {
  buildIdQuery,
  getDocument,
  insertDocument,
  updateDocument,
  deleteDocument,
  patchDocument,
  copyDocument,
  syncFields,
  copyCollectionAcross,
  createDatabase,
  dropDatabase,
  dropCollection,
  createCollection,
  renameField,
  deleteDocuments,
};
