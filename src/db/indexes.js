const { getClient } = require('./connection');

async function listIndexes(side, dbName, collName) {
  const coll = getClient(side).db(dbName).collection(collName);

  const specs = await coll.indexes();

  // Best-effort usage stats keyed by index name.
  const usage = {};
  try {
    const stats = await coll.aggregate([{ $indexStats: {} }]).toArray();
    for (const s of stats) {
      usage[s.name] = {
        ops: s.accesses ? Number(s.accesses.ops) : 0,
        since: s.accesses && s.accesses.since ? new Date(s.accesses.since).toISOString() : null,
      };
    }
  } catch (_) { /* $indexStats unavailable — omit usage */ }

  const indexes = specs.map((idx) => ({
    name: idx.name,
    key: idx.key,
    unique: !!idx.unique,
    sparse: !!idx.sparse,
    ttl: typeof idx.expireAfterSeconds === 'number' ? idx.expireAfterSeconds : null,
    partialFilterExpression: idx.partialFilterExpression || null,
    // The default _id index cannot be dropped — flag it for the UI.
    isIdIndex: idx.name === '_id_',
    accesses: usage[idx.name] || null,
  }));

  return { indexes };
}

async function createIndex(side, dbName, collName, keys, options = {}) {
  const coll = getClient(side).db(dbName).collection(collName);
  const name = await coll.createIndex(keys, options);
  return { name };
}

async function dropIndex(side, dbName, collName, indexName) {
  if (indexName === '_id_') throw new Error('The default _id index cannot be dropped.');
  const coll = getClient(side).db(dbName).collection(collName);
  await coll.dropIndex(indexName);
  return { success: true, dropped: indexName };
}

module.exports = { listIndexes, createIndex, dropIndex };
