const connection = require('./connection');
const operations = require('./operations');
const comparison = require('./comparison');
const query = require('./query');
const shell = require('./shell');
const metrics = require('./metrics');
const constants = require('./constants');
const indexes = require('./indexes');
const explain = require('./explain');
const schema = require('./schema');
const aggregate = require('./aggregate');
const fieldOps = require('./field-ops');

module.exports = {
  ...constants,

  // shell
  evaluateShell: shell.evaluateShell,
  shellCursorNext: shell.shellCursorNext,
  closeShellCursor: shell.closeShellCursor,

  // metrics
  getServerMetrics: metrics.getServerMetrics,

  // connection
  connectBoth: connection.connectBoth,
  connectSingle: connection.connectSingle,
  disconnectBoth: connection.disconnectBoth,

  // query
  listDatabases: query.listDatabases,
  listCollections: query.listCollections,
  executeQuery: query.executeQuery,

  // indexes
  listIndexes: indexes.listIndexes,
  createIndex: indexes.createIndex,
  dropIndex: indexes.dropIndex,

  // explain
  explainQuery: explain.explainQuery,

  // schema analysis
  analyzeSchema: schema.analyzeSchema,

  // aggregation
  runAggregate: aggregate.runAggregate,

  // document field ops
  unsetField: fieldOps.unsetField,
  setField: fieldOps.setField,

  // comparison
  compareDatabases: comparison.compareDatabases,
  compareCollections: comparison.compareCollections,
  compareCollectionsCross: comparison.compareCollectionsCross,
  compareDocuments: comparison.compareDocuments,

  // operations
  getDocument: operations.getDocument,
  insertDocument: operations.insertDocument,
  updateDocument: operations.updateDocument,
  deleteDocument: operations.deleteDocument,
  patchDocument: operations.patchDocument,
  copyDocument: operations.copyDocument,
  copyCollectionAcross: operations.copyCollectionAcross,
  createDatabase: operations.createDatabase,
  dropDatabase: operations.dropDatabase,
  dropCollection: operations.dropCollection,
  createCollection: operations.createCollection,
  renameField: operations.renameField,
  deleteDocuments: operations.deleteDocuments,
  deleteOneByFilter: operations.deleteOneByFilter,
  insertManyDocs: operations.insertManyDocs,
  updateOneByFilter: operations.updateOneByFilter,
  updateManyByFilter: operations.updateManyByFilter,
};
