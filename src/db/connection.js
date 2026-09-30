const { MongoClient } = require('mongodb');
const { CONNECTION_TIMEOUT_MS, SOCKET_TIMEOUT_MS, MAX_IDLE_TIME_MS } = require('./constants');

const clients = { source: null, target: null };
const urls = { source: null, target: null };

/** directConnection only for a single host without replicaSet/loadBalanced/explicit choice. */
function wantsDirectConnection(url) {
  const rest = url.slice(url.indexOf('://') + 3);
  const query = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1) : '';
  if (/(^|&)(directConnection|replicaSet|loadBalanced)=/i.test(query)) return false;
  const authority = rest.split(/[/?]/)[0];
  const hosts = authority.slice(authority.lastIndexOf('@') + 1);
  return !hosts.includes(',');
}

/** Accept a bare host[:port] as a mongodb:// URL. */
function normalizeUrl(url) {
  const trimmed = url.trim();
  return trimmed.includes('://') ? trimmed : `mongodb://${trimmed}`;
}

/** Open and ping a client with the app's connection options. */
async function connect(url) {
  const connectionUrl = normalizeUrl(url);

  const isSrv = connectionUrl.toLowerCase().startsWith('mongodb+srv://');
  const client = new MongoClient(connectionUrl, {
    connectTimeoutMS: CONNECTION_TIMEOUT_MS,
    serverSelectionTimeoutMS: CONNECTION_TIMEOUT_MS,
    // Bound in-flight ops so an idle-dropped socket rejects instead of hanging forever.
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
    // Retire idle pooled connections before the network kills them.
    maxIdleTimeMS: MAX_IDLE_TIME_MS,
    // Auto-retry once on a transient network error.
    retryReads: true,
    retryWrites: true,
    ...(!isSrv && wantsDirectConnection(connectionUrl) ? { directConnection: true } : {}),
  });
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
  } catch (err) {
    await client.close().catch(() => { });
    throw err;
  }
  return client;
}
// URL1 is source, URL2 is target
async function connectBoth(url1, url2) {
  await disconnectBoth();
  // Never leave the app half-connected: a failed target drops the source too.
  try {
    clients.source = await connect(url1);
    urls.source = normalizeUrl(url1);
    clients.target = await connect(url2);
    urls.target = normalizeUrl(url2);
  } catch (err) {
    await disconnectBoth();
    throw err;
  }
  return { success: true };
}

/**
 * Connect a single URL (used by DB Editor). Sets both source and target to the same client.
 */
async function connectSingle(url) {
  await disconnectBoth();
  clients.source = await connect(url);
  clients.target = clients.source;
  urls.source = normalizeUrl(url);
  urls.target = urls.source;
  return { success: true };
}

async function disconnectBoth() {
  if (clients.source) {
    try { await clients.source.close(); } catch (_) { /* already closed */ }
  }
  if (clients.target && clients.target !== clients.source) {
    try { await clients.target.close(); } catch (_) { /* already closed */ }
  }
  clients.source = null;
  clients.target = null;
  urls.source = null;
  urls.target = null;
}

function getClient(side) {
  const client = clients[side];
  if (!client) throw new Error(`Not connected to ${side}`);
  return client;
}

/** The URL a side is connected with (for the shell worker's own client). */
function connectionUrl(side) {
  const url = urls[side];
  if (!url) throw new Error(`Not connected to ${side}`);
  return url;
}

module.exports = {
  wantsDirectConnection,
  connect,
  connectionUrl,
  connectBoth,
  connectSingle,
  disconnectBoth,
  getClient,
};
