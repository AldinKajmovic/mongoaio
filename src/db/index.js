const connection = require('./connection');
const operations = require('./operations');
const comparison = require('./comparison');
const query = require('./query');
const shellHost = require('./shell-host');
const metrics = require('./metrics');
const constants = require('./constants');
const indexes = require('./indexes');
const explain = require('./explain');
const schema = require('./schema');
const aggregate = require('./aggregate');
const fieldOps = require('./field-ops');
const opRegistry = require('./op-registry');
const { invalidateCompareCache } = require('./compare-cache');

/** Connections changed: the shell workers hold their own clients, so restart them. */
function resettingShell(fn) {
  return async (...args) => {
    await shellHost.resetShell();
    return fn(...args);
  };
}

/** Cancel a query/aggregation, or a shell script (which runs in its own worker). */
async function cancelOp(opId) {
  const shell = await shellHost.cancelShell(opId);
  return shell.cancelled ? shell : opRegistry.cancelOp(opId);
}

/** Drop the comparison cache after any call that may write (even a failed bulk op). */
function invalidating(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } finally {
      invalidateCompareCache();
    }
  };
}

module.exports = {
  ...constants,
  invalidateCompareCache,

  // cancellable queries
  cancelOp,

  // shell
  evaluateShell: invalidating(shellHost.evaluateShell),
  shellCursorNext: shellHost.shellCursorNext,
  closeShellCursor: shellHost.closeShellCursor,

  // metrics
  getServerMetrics: metrics.getServerMetrics,

  // connection
  connectBoth: invalidating(resettingShell(connection.connectBoth)),
  connectSingle: invalidating(resettingShell(connection.connectSingle)),
  disconnectBoth: invalidating(resettingShell(connection.disconnectBoth)),

  // query
  listDatabases: query.listDatabases,
  listCollections: query.listCollections,
  executeQuery: query.executeQuery,

  // indexes
  listIndexes: indexes.listIndexes,
  createIndex: invalidating(indexes.createIndex),
  dropIndex: invalidating(indexes.dropIndex),

  // explain
  explainQuery: explain.explainQuery,

  // schema analysis
  analyzeSchema: schema.analyzeSchema,

  // aggregation
  runAggregate: invalidating(aggregate.runAggregate),

  // document field ops
  unsetField: invalidating(fieldOps.unsetField),
  setField: invalidating(fieldOps.setField),
  applyFieldChanges: invalidating(fieldOps.applyFieldChanges),

  // comparison
  compareDatabases: comparison.compareDatabases,
  compareCollections: comparison.compareCollections,
  compareCollectionsCross: comparison.compareCollectionsCross,
  compareDocuments: comparison.compareDocuments,

  // operations
  getDocument: operations.getDocument,
  insertDocument: invalidating(operations.insertDocument),
  updateDocument: invalidating(operations.updateDocument),
  deleteDocument: invalidating(operations.deleteDocument),
  patchDocument: invalidating(operations.patchDocument),
  copyDocument: invalidating(operations.copyDocument),
  syncFields: invalidating(operations.syncFields),
  copyCollectionAcross: invalidating(operations.copyCollectionAcross),
  createDatabase: invalidating(operations.createDatabase),
  dropDatabase: invalidating(operations.dropDatabase),
  dropCollection: invalidating(operations.dropCollection),
  createCollection: invalidating(operations.createCollection),
  renameField: invalidating(operations.renameField),
  deleteDocuments: invalidating(operations.deleteDocuments),
};
