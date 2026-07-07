const { ObjectId } = require('mongodb');
const { getClient } = require('./connection');
const { serializeDoc, serializeDocEJSON } = require('./serialize');
const { DEFAULT_QUERY_LIMIT, SOCKET_TIMEOUT_MS } = require('./constants');

/**
 * Recursively revive MongoDB Extended JSON markers that can't survive the
 * IPC bridge as native BSON types. Currently handles `{ "$oid": "..." }`,
 * which the renderer emits for `ObjectId("...")` syntax, converting it to a
 * real ObjectId so the query matches by type — never by string.
 *
 * Plain strings are left as-is: a value is only treated as an ObjectId when
 * the user explicitly wraps it in ObjectId(...).
 *
 * @param {*} value
 * @returns {*}
 */
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

async function executeQuery(side, dbName, collName, options = {}) {
  const { filter = {}, sort = {}, projection = {}, limit = DEFAULT_QUERY_LIMIT, skip = 0 } = options;
  const normalizedFilter = reviveExtendedJson(filter);
  const client = getClient(side);
  const coll = client.db(dbName).collection(collName);

  const [items, total] = await Promise.all([
    coll.find(normalizedFilter, { projection }).sort(sort).skip(skip).limit(limit).maxTimeMS(SOCKET_TIMEOUT_MS).toArray(),
    coll.countDocuments(normalizedFilter, { maxTimeMS: SOCKET_TIMEOUT_MS })
  ]);

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
};
