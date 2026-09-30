const { ObjectId, BSON } = require('mongodb');
const { getClient } = require('./connection');
const { serializeDoc, serializeDocEJSON } = require('./serialize');
const { DEFAULT_QUERY_LIMIT } = require('./constants');
const { beginOp, resolveTimeout } = require('./op-registry');

/** Revive the ObjectId/ISODate/NumberLong/NumberDecimal markers the query bar emits. */
const TYPE_MARKERS = new Set(['$date', '$numberLong', '$numberDecimal', '$numberInt', '$numberDouble', '$binary', '$uuid']);

function reviveMarker(marker) {
  const [key] = Object.keys(marker);
  const revived = BSON.EJSON.deserialize({ v: marker }, { relaxed: false }).v;
  if (key === '$date' && (!(revived instanceof Date) || Number.isNaN(revived.getTime()))) {
    throw new Error(`Invalid date: ${JSON.stringify(marker.$date)}`);
  }
  return revived;
}

function reviveExtendedJson(value) {
  if (Array.isArray(value)) return value.map(reviveExtendedJson);
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$oid') {
      const oid = value.$oid;
      if (!ObjectId.isValid(oid)) {
        throw new Error(`Invalid ObjectId: "${oid}" (expected a 24-character hex string)`);
      }
      return new ObjectId(oid);
    }
    if (keys.length === 1 && TYPE_MARKERS.has(keys[0])) return reviveMarker(value);
    const out = {};
    for (const key of keys) out[key] = reviveExtendedJson(value[key]);
    return out;
  }
  return value;
}

async function listDatabases(side) {
  const client = getClient(side);
  try {
    const result = await client.db('admin').admin().listDatabases();
    const systemDbs = ['admin', 'config', 'local'];
    return result.databases
      .map(db => db.name)
      .filter(name => !systemDbs.includes(name))
      .sort();
  } catch (error) {
    console.error(`Error listing databases for ${side}:`, error.message);
    throw error;
  }
}

async function listCollections(side, dbName) {
  const client = getClient(side);
  try {
    const collections = await client.db(dbName).listCollections().toArray();
    return collections.map(c => c.name).sort();
  } catch (error) {
    console.error(`Error listing collections for ${side} (DB: ${dbName}):`, error.message);
    throw error;
  }
}

/** Count documents matching a filter. */
async function countMatching(coll, filter, opts) {
  if (Object.keys(filter).length === 0) {
    try {
      return await coll.estimatedDocumentCount({ maxTimeMS: opts.maxTimeMS });
    } catch (_) { /* fall through */ }
  }
  return coll.countDocuments(filter, opts);
}

async function executeQuery(side, dbName, collName, options = {}) {
  const { filter = {}, sort = {}, projection = {}, limit = DEFAULT_QUERY_LIMIT, skip = 0 } = options;
  const normalizedFilter = reviveExtendedJson(filter);
  const client = getClient(side);
  const coll = client.db(dbName).collection(collName);
  const maxTimeMS = resolveTimeout(options.maxTimeMS);
  const op = beginOp(options.opId, client);
  const opOpts = { maxTimeMS, signal: op.signal, comment: op.comment };

  let items, total;
  try {
    [items, total] = await Promise.all([
      coll.find(normalizedFilter, { projection, ...opOpts }).sort(sort).skip(skip).limit(limit).toArray(),
      countMatching(coll, normalizedFilter, opOpts),
    ]);
  } finally {
    op.end();
  }

  return {
    items: items.map(serializeDoc),
    // Extended JSON form (ObjectId -> {"$oid":...}, Date -> {"$date":...}) for
    // the JSON view / "Copy JSON" so copied documents re-import faithfully.
    itemsEJSON: items.map(serializeDocEJSON),
    total,
    page: Math.floor(skip / limit) + 1,
    limit
  };
}

module.exports = {
  listDatabases,
  listCollections,
  executeQuery,
  reviveExtendedJson,
};
