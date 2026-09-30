const { before, after } = require('node:test');
const { startMongo } = require('./mongo');

/** Connect the app's db layer to a throwaway server for one test file. */
function useDatabase() {
  const ctx = { db: null, client: null, uri: null, skip: false };
  let server;

  before(async () => {
    server = await startMongo();
    if (!server) { ctx.skip = 'mongod not found (set MONGOAIO_TEST_URI to use a running server)'; return; }
    ctx.uri = server.uri;
    ctx.db = require('../../src/db');
    await ctx.db.connectBoth(server.uri, server.uri);
    ctx.client = require('../../src/db/connection').getClient('source');
  });

  after(async () => {
    if (ctx.db) await ctx.db.disconnectBoth();
    if (server) await server.stop();
  });

  return ctx;
}

/** Fresh, uniquely named database for one test. */
async function freshDb(ctx, label) {
  const name = `mongoaio_test_${label}_${Date.now().toString(36)}`;
  const handle = ctx.client.db(name);
  await handle.dropDatabase();
  return { name, handle };
}

module.exports = { useDatabase, freshDb };
