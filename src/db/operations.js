const { ObjectId } = require('mongodb');
const { getClient } = require('./connection');
const { serializeDoc, deserializeInput } = require('./serialize');

function buildIdQuery(docId) {
  // An id may arrive as a plain string, or as Extended JSON ({"$oid":"..."})
  // from the JSON view. Revive the latter to a real ObjectId first.
  const revived = deserializeInput(docId);
  if (revived instanceof ObjectId) return { _id: revived };
  const isEligible = ObjectId.isValid(revived) && (String(revived) === revived);
  return { _id: isEligible ? new ObjectId(revived) : revived };
}

/**
 * Get a single document by _id.
 */
async function getDocument(side, dbName, collName, docId) {
  const client = getClient(side);
  const query = buildIdQuery(docId);
  const doc = await client.db(dbName).collection(collName).findOne(query);
  return doc ? serializeDoc(doc) : null;
}

async function insertDocument(side, dbName, collName, doc) {
  const client = getClient(side);
  // Revive Extended JSON ($oid/$date/...) so pasted docs keep their BSON types.
  doc = deserializeInput(doc);
  // Convert _id string back to ObjectId if valid
  if (doc._id) {
    const { _id } = buildIdQuery(doc._id);
    doc._id = _id;
  }
  const result = await client.db(dbName).collection(collName).insertOne(doc);
  return { insertedId: result.insertedId.toString() };
}

async function updateDocument(side, dbName, collName, docId, updates) {
  const client = getClient(side);
  const query = buildIdQuery(docId);
  // Remove _id from updates to avoid immutable field error, then revive any
  // Extended JSON markers in the edited fields back into BSON types.
  const { _id, ...fieldsToUpdate } = updates;
  const result = await client.db(dbName).collection(collName).replaceOne(query, deserializeInput(fieldsToUpdate));
  return { modifiedCount: result.modifiedCount };
}

async function deleteDocument(side, dbName, collName, docId) {
  const client = getClient(side);
  const query = buildIdQuery(docId);
  const result = await client.db(dbName).collection(collName).deleteOne(query);
  return { deletedCount: result.deletedCount };
}

async function patchDocument(side, dbName, collName, docId, updates) {
  const client = getClient(side);
  const query = buildIdQuery(docId);
  const { _id, ...fieldsToUpdate } = updates;
  const result = await client.db(dbName).collection(collName).updateOne(query, { $set: deserializeInput(fieldsToUpdate) });
  return { modifiedCount: result.modifiedCount };
}

async function copyDocument(fromSide, toSide, dbName, collName, docId) {
  const doc = await getDocument(fromSide, dbName, collName, docId);
  if (!doc) throw new Error('Document not found');
  const toClient = getClient(toSide);
  const query = buildIdQuery(doc._id);
  doc._id = query._id;
  // Try to insert; if it already exists, replace
  await toClient.db(dbName).collection(collName).replaceOne(query, doc, { upsert: true });
  return { success: true };
}
async function copyCollectionAcross(fromSide, fromDb, fromColl, toSide, toDb, toColl) {
  const fromClient = getClient(fromSide);
  const toClient = getClient(toSide);

  const sourceColl = fromClient.db(fromDb).collection(fromColl);
  const targetColl = toClient.db(toDb).collection(toColl);

  // Ensure the target collection exists even for an empty source.
  const total = await sourceColl.countDocuments({});
  if (total === 0) {
    const existing = await toClient.db(toDb).listCollections({ name: toColl }).toArray();
    if (existing.length === 0) await toClient.db(toDb).createCollection(toColl);
    return { copiedCount: 0, matchedCount: 0, upsertedCount: 0, modifiedCount: 0 };
  }

  // Stream the source in batches and upsert by _id so existing docs are UPDATED
  // (not skipped) and new docs are inserted — this is what a sync must do.
  const BATCH_SIZE = 500;
  const cursor = sourceColl.find({});
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

  while (await cursor.hasNext()) {
    batch.push(await cursor.next());
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
  const client = getClient(side);
  await client.db(dbName).createCollection(collName || '_init');
  return { success: true };
}

async function dropDatabase(side, dbName) {
  const client = getClient(side);
  await client.db(dbName).dropDatabase();
  return { success: true };
}

async function dropCollection(side, dbName, collName) {
  const client = getClient(side);
  await client.db(dbName).collection(collName).drop();
  return { success: true };
}

async function createCollection(side, dbName, collName, options = {}) {
  const client = getClient(side);
  await client.db(dbName).createCollection(collName, options);
  return { success: true };
}

async function renameField(side, dbName, collName, oldName, newName) {
  const client = getClient(side);
  const result = await client.db(dbName).collection(collName).updateMany({}, { $rename: { [oldName]: newName } });
  return { modifiedCount: result.modifiedCount };
}

async function deleteDocuments(side, dbName, collName, query) {
  const client = getClient(side);
  if (query._id && typeof query._id === 'string' && ObjectId.isValid(query._id)) {
    query._id = new ObjectId(query._id);
  }
  const result = await client.db(dbName).collection(collName).deleteMany(query);
  return { deletedCount: result.deletedCount };
}

async function deleteOneByFilter(side, dbName, collName, filter) {
  const client = getClient(side);
  const result = await client.db(dbName).collection(collName).deleteOne(filter);
  return { deletedCount: result.deletedCount };
}

async function insertManyDocs(side, dbName, collName, docs) {
  const client = getClient(side);
  const result = await client.db(dbName).collection(collName).insertMany(deserializeInput(docs));
  return { insertedCount: result.insertedCount };
}

async function updateOneByFilter(side, dbName, collName, filter, update) {
  const client = getClient(side);
  const result = await client.db(dbName).collection(collName).updateOne(filter, update);
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
}

async function updateManyByFilter(side, dbName, collName, filter, update) {
  const client = getClient(side);
  const result = await client.db(dbName).collection(collName).updateMany(filter, update);
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
}

module.exports = {
  buildIdQuery,
  getDocument,
  insertDocument,
  updateDocument,
  deleteDocument,
  patchDocument,
  copyDocument,
  copyCollectionAcross,
  createDatabase,
  dropDatabase,
  dropCollection,
  createCollection,
  renameField,
  deleteDocuments,
  deleteOneByFilter,
  insertManyDocs,
  updateOneByFilter,
  updateManyByFilter,
};
