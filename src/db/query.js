const { getClient } = require('./connection');
const { serializeDoc } = require('./serialize');
const { DEFAULT_QUERY_LIMIT } = require('./constants');

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
  const client = getClient(side);
  const coll = client.db(dbName).collection(collName);

  const [items, total] = await Promise.all([
    coll.find(filter, { projection }).sort(sort).skip(skip).limit(limit).toArray(),
    coll.countDocuments(filter)
  ]);

  return {
    items: items.map(serializeDoc),
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
