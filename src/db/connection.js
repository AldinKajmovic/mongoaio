const { MongoClient } = require('mongodb');
const { CONNECTION_TIMEOUT_MS } = require('./constants');

let clients = { source: null, target: null };

async function connect(url) {
  let connectionUrl = url.trim();
  if (!connectionUrl.includes('://')) {
    connectionUrl = `mongodb://${connectionUrl}`;
  }

  const isSrv = connectionUrl.toLowerCase().startsWith('mongodb+srv://');
  const client = new MongoClient(connectionUrl, {
    connectTimeoutMS: CONNECTION_TIMEOUT_MS,
    serverSelectionTimeoutMS: CONNECTION_TIMEOUT_MS,
    ...(isSrv ? {} : { directConnection: true }),
  });
  await client.connect();
  // Ping to verify 
  await client.db().command({ ping: 1 });
  return client;
}
// URL1 is source, URL2 is target
async function connectBoth(url1, url2) {
  await disconnectBoth();
  clients.source = await connect(url1);
  clients.target = await connect(url2);
  return { success: true };
}

/**
 * Connect a single URL (used by DB Editor). Sets both source and target to the same client.
 */
async function connectSingle(url) {
  await disconnectBoth();
  clients.source = await connect(url);
  clients.target = clients.source;
  return { success: true };
}

async function disconnectBoth() {
  if (clients.source) {
    try { await clients.source.close(); } catch (_) { }
  }
  if (clients.target && clients.target !== clients.source) {
    try { await clients.target.close(); } catch (_) { }
  }
  clients.source = null;
  clients.target = null;
}

function getClient(side) {
  const client = clients[side];
  if (!client) throw new Error(`Not connected to ${side}`);
  return client;
}

module.exports = {
  connectBoth,
  connectSingle,
  disconnectBoth,
  getClient,
};
