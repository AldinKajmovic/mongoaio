const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConnections: () => ipcRenderer.invoke('get-connections'),
  saveConnection: (alias, url) => ipcRenderer.invoke('save-connection', alias, url),
  deleteConnection: (alias) => ipcRenderer.invoke('delete-connection', alias),
  connect: (url1, url2) => ipcRenderer.invoke('connect', url1, url2),
  connectSingle: (url) => ipcRenderer.invoke('connect-single', url),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  listDatabases: (side) => ipcRenderer.invoke('list-databases', side),
  compareDatabases: () => ipcRenderer.invoke('compare-databases'),
  listCollections: (side, dbName) => ipcRenderer.invoke('list-collections', side, dbName),
  compareCollections: (sourceDbName, targetDbName) => ipcRenderer.invoke('compare-collections', sourceDbName, targetDbName),
  compareDocuments: (sourceDbName, targetDbName, collName, options) => ipcRenderer.invoke('compare-documents', sourceDbName, targetDbName, collName, options),
  getDocument: (side, dbName, collName, docId) => ipcRenderer.invoke('get-document', side, dbName, collName, docId),
  insertDocument: (side, dbName, collName, doc) => ipcRenderer.invoke('insert-document', side, dbName, collName, doc),
  updateDocument: (side, dbName, collName, docId, doc) => ipcRenderer.invoke('update-document', side, dbName, collName, docId, doc),
  deleteDocument: (side, dbName, collName, docId) => ipcRenderer.invoke('delete-document', side, dbName, collName, docId),
  patchDocument: (side, dbName, collName, docId, doc) => ipcRenderer.invoke('patch-document', side, dbName, collName, docId, doc),
  copyDocument: (fromSide, toSide, dbName, collName, docId) => ipcRenderer.invoke('copy-document', fromSide, toSide, dbName, collName, docId),
  copyCollection: (fromSide, toSide, dbName, collName) => ipcRenderer.invoke('copy-collection', fromSide, toSide, dbName, collName),
  copyCollectionAcross: (fromSide, fromDb, fromColl, toSide, toDb, toColl) => ipcRenderer.invoke('copy-collection-across', fromSide, fromDb, fromColl, toSide, toDb, toColl),
  createDatabase: (side, dbName, collName) => ipcRenderer.invoke('create-database', side, dbName, collName),
  dropCollection: (side, dbName, collName) => ipcRenderer.invoke('drop-collection', side, dbName, collName),
  dropDatabase: (side, dbName) => ipcRenderer.invoke('drop-database', side, dbName),
  createCollection: (side, dbName, collName, options) => ipcRenderer.invoke('create-collection', side, dbName, collName, options),
  renameField: (side, dbName, collName, oldName, newName) => ipcRenderer.invoke('rename-field', side, dbName, collName, oldName, newName),
  deleteDocuments: (side, dbName, collName, query) => ipcRenderer.invoke('delete-documents', side, dbName, collName, query),
  shellEval: (side, dbName, code, options) => ipcRenderer.invoke('shell-eval', side, dbName, code, options),
  shellCursorNext: (cursorId) => ipcRenderer.invoke('shell-cursor-next', cursorId),
  shellCursorClose: (cursorId) => ipcRenderer.invoke('shell-cursor-close', cursorId),
  serverMetrics: (side) => ipcRenderer.invoke('server-metrics', side),
  executeQuery: (side, dbName, collName, options) => ipcRenderer.invoke('execute-query', side, dbName, collName, options),

  // Index management
  listIndexes: (side, dbName, collName) => ipcRenderer.invoke('list-indexes', side, dbName, collName),
  createIndex: (side, dbName, collName, keys, options) => ipcRenderer.invoke('create-index', side, dbName, collName, keys, options),
  dropIndex: (side, dbName, collName, indexName) => ipcRenderer.invoke('drop-index', side, dbName, collName, indexName),

  // Explain plan
  explainQuery: (side, dbName, collName, options, verbosity) => ipcRenderer.invoke('explain-query', side, dbName, collName, options, verbosity),

  // Schema analysis
  analyzeSchema: (side, dbName, collName, sampleSize) => ipcRenderer.invoke('analyze-schema', side, dbName, collName, sampleSize),

  // Aggregation pipeline
  runAggregate: (side, dbName, collName, pipeline, options) => ipcRenderer.invoke('run-aggregate', side, dbName, collName, pipeline, options),

  // Document field ops (tree add/remove field)
  unsetField: (side, dbName, collName, docId, fieldPath) => ipcRenderer.invoke('unset-field', side, dbName, collName, docId, fieldPath),
  setField: (side, dbName, collName, docId, fieldPath, value) => ipcRenderer.invoke('set-field', side, dbName, collName, docId, fieldPath, value),

  // Import / Export
  exportData: (params) => ipcRenderer.invoke('export-data', params),
  importData: (params) => ipcRenderer.invoke('import-data', params),

  // Auto-updater
  getVersion: () => ipcRenderer.invoke('get-version'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_e, data) => callback(data)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_e, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_e, data) => callback(data)),
});
