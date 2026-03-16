const { ObjectId } = require('mongodb');
const { getClient } = require('./connection');
const { serializeDoc } = require('./serialize');

function buildIdQuery(docId) {
  const isEligible = ObjectId.isValid(docId) && (String(docId) === docId);

  return {
    _id: isEligible ? new ObjectId(docId) : docId
  };
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
  // Remove _id from updates to avoid immutable field error
  const { _id, ...fieldsToUpdate } = updates;
  const result = await client.db(dbName).collection(collName).replaceOne(query, fieldsToUpdate);
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
  const result = await client.db(dbName).collection(collName).updateOne(query, { $set: fieldsToUpdate });
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
// check copy collection and copy accross if i remove this create copied count 0 
async function copyCollection(fromSide, toSide, dbName, collName) {
  const fromClient = getClient(fromSide);
  const toClient = getClient(toSide);

  const docs = await fromClient.db(dbName).collection(collName).find({}).toArray();
  if (docs.length === 0) {
    await toClient.db(dbName).createCollection(collName);
    return { copiedCount: 0 };
  }
  try {
    const result = await toClient.db(dbName).collection(collName).insertMany(docs, { ordered: false });
    return { copiedCount: result.insertedCount };
  } catch (err) {
    if (err.code === 11000) {
      // Some duplicates, but others inserted
      return { copiedCount: err.result?.nInserted || 0, warning: 'Some documents already existed' };
    }
    throw err;
  }
}


async function copyCollectionAcross(fromSide, fromDb, fromColl, toSide, toDb, toColl) {
  const fromClient = getClient(fromSide);
  const toClient = getClient(toSide);

  const docs = await fromClient.db(fromDb).collection(fromColl).find({}).toArray();
  if (docs.length === 0) {
    await toClient.db(toDb).createCollection(toColl);
    return { copiedCount: 0 };
  }
  try {
    const result = await toClient.db(toDb).collection(toColl).insertMany(docs, { ordered: false });
    return { copiedCount: result.insertedCount };
  } catch (err) {
    if (err.code === 11000) {
      return { copiedCount: err.result?.nInserted || 0, warning: 'Some documents already existed' };
    }
    throw err;
  }
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


module.exports = {
  getDocument,
  insertDocument,
  updateDocument,
  deleteDocument,
  patchDocument,
  copyDocument,
  copyCollection,
  copyCollectionAcross,
  createDatabase,
  dropDatabase,
  dropCollection,
  createCollection,
  renameField,
  deleteDocuments,
};
