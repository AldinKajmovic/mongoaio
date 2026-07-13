const { getClient } = require('./connection');
const { deserializeInput } = require('./serialize');
const { buildIdQuery } = require('./operations');


async function unsetField(side, dbName, collName, docId, fieldPath) {
  if (fieldPath === '_id') throw new Error('The _id field cannot be removed.');
  const coll = getClient(side).db(dbName).collection(collName);
  const result = await coll.updateOne(buildIdQuery(docId), { $unset: { [fieldPath]: '' } });
  return { modifiedCount: result.modifiedCount };
}

async function setField(side, dbName, collName, docId, fieldPath, value) {
  if (fieldPath === '_id') throw new Error('The _id field cannot be modified.');
  const coll = getClient(side).db(dbName).collection(collName);
  const revived = deserializeInput(value);
  const result = await coll.updateOne(buildIdQuery(docId), { $set: { [fieldPath]: revived } });
  return { modifiedCount: result.modifiedCount, matchedCount: result.matchedCount };
}

module.exports = { unsetField, setField };
