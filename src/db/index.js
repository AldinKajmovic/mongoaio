const connection = require('./connection');
const operations = require('./operations');
const comparison = require('./comparison');
const query = require('./query');
const constants = require('./constants');

module.exports = {
  ...constants,

  // connection
  connectBoth: connection.connectBoth,
  connectSingle: connection.connectSingle,
  disconnectBoth: connection.disconnectBoth,

  // query
  listDatabases: query.listDatabases,
  listCollections: query.listCollections,
  executeQuery: query.executeQuery,

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
