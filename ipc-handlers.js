const { ipcMain } = require('electron');
const db = require('./src/db');
const {
  validateSide,
  validateString,
  validateObject,
  validateOptions,
  validateConnectionUrl,
  validateDocId,
} = require('./src/main/validate');
const { safeHandler } = require('./src/main/ipc-safe');
const { registerToolHandlers } = require('./src/main/ipc-tools');
const {
  getConnections, saveConnection, updateConnection, deleteConnection, getStorageInfo
} = require('./src/main/connections-store');


/** Register every IPC handler. */
function registerIpcHandlers(getWindow) {
  ipcMain.handle('get-connections', safeHandler('get-connections', async () => getConnections()));

  ipcMain.handle('connection-storage-info', safeHandler('connection-storage-info', async () => getStorageInfo()));

  ipcMain.handle('save-connection', safeHandler('save-connection', async (_event, alias, url) => {
    validateString(alias, 'alias');
    validateString(url, 'url');
    return saveConnection(alias, url);
  }));

  ipcMain.handle('update-connection', safeHandler('update-connection', async (_event, oldAlias, newAlias, url) => {
    return updateConnection(validateString(oldAlias, 'oldAlias'), validateString(newAlias, 'alias'), validateString(url, 'url'));
  }));

  ipcMain.handle('delete-connection', safeHandler('delete-connection', async (_event, alias) => {
    validateString(alias, 'alias');
    return deleteConnection(alias);
  }));

  ipcMain.handle('connect', safeHandler('connect', async (_event, url1, url2) => {
    validateConnectionUrl(url1);
    validateConnectionUrl(url2);
    return await db.connectBoth(url1, url2);
  }));

  ipcMain.handle('connect-single', safeHandler('connect-single', async (_event, url) => {
    validateConnectionUrl(url);
    return await db.connectSingle(url);
  }));

  ipcMain.handle('disconnect', safeHandler('disconnect', async () => {
    await db.disconnectBoth();
    return { success: true };
  }));

  ipcMain.handle('compare-databases', safeHandler('compare-databases', async () => {
    return await db.compareDatabases();
  }));

  ipcMain.handle('list-collections', safeHandler('list-collections', async (_event, side, dbName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    return { collections: await db.listCollections(side, dbName) };
  }));

  ipcMain.handle('compare-collections', safeHandler('compare-collections', async (_event, sourceDbName, targetDbName) => {
    validateString(sourceDbName, 'sourceDbName');
    validateString(targetDbName, 'targetDbName');
    return await db.compareCollectionsCross(sourceDbName, targetDbName);
  }));

  ipcMain.handle('compare-documents', safeHandler('compare-documents', async (_event, sourceDbName, targetDbName, collName, options) => {
    validateString(sourceDbName, 'sourceDbName');
    validateString(targetDbName, 'targetDbName');
    validateString(collName, 'collName');
    const opts = validateOptions(options, 'options');
    return await db.compareDocuments(sourceDbName, targetDbName, collName, opts);
  }));

  ipcMain.handle('get-document', safeHandler('get-document', async (_event, side, dbName, collName, docId) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    return { document: await db.getDocument(side, dbName, collName, docId) };
  }));

  ipcMain.handle('insert-document', safeHandler('insert-document', async (_event, side, dbName, collName, doc) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateObject(doc, 'document');
    return await db.insertDocument(side, dbName, collName, doc);
  }));

  ipcMain.handle('update-document', safeHandler('update-document', async (_event, side, dbName, collName, docId, doc) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateObject(doc, 'document');
    return await db.updateDocument(side, dbName, collName, docId, doc);
  }));

  ipcMain.handle('delete-document', safeHandler('delete-document', async (_event, side, dbName, collName, docId) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    return await db.deleteDocument(side, dbName, collName, docId);
  }));

  ipcMain.handle('delete-documents', safeHandler('delete-documents', async (_event, side, dbName, collName, query) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateObject(query, 'query');
    return await db.deleteDocuments(side, dbName, collName, query);
  }));

  ipcMain.handle('patch-document', safeHandler('patch-document', async (_event, side, dbName, collName, docId, doc) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateObject(doc, 'document');
    return await db.patchDocument(side, dbName, collName, docId, doc);
  }));

  // toDb is optional (defaults to dbName) — the compare view may pair two
  // differently named databases.
  ipcMain.handle('copy-document', safeHandler('copy-document', async (_event, fromSide, toSide, dbName, collName, docId, toDb) => {
    validateSide(fromSide);
    validateSide(toSide);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    const targetDb = toDb === undefined ? dbName : validateString(toDb, 'toDb');
    return await db.copyDocument(fromSide, toSide, dbName, collName, docId, targetDb);
  }));

  ipcMain.handle('sync-fields', safeHandler('sync-fields', async (_event, fromSide, toSide, fromDb, toDb, collName, docId, paths) => {
    validateSide(fromSide);
    validateSide(toSide);
    validateString(fromDb, 'fromDb');
    validateString(toDb, 'toDb');
    validateString(collName, 'collName');
    validateDocId(docId);
    if (!Array.isArray(paths) || paths.length === 0 || paths.some(p => typeof p !== 'string' || !p)) {
      throw new Error('Invalid paths: must be a non-empty array of field paths.');
    }
    return await db.syncFields(fromSide, toSide, fromDb, toDb, collName, docId, paths);
  }));

  ipcMain.handle('copy-collection', safeHandler('copy-collection', async (_event, fromSide, toSide, dbName, collName) => {
    validateSide(fromSide);
    validateSide(toSide);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.copyCollectionAcross(fromSide, dbName, collName, toSide, dbName, collName);
  }));

  ipcMain.handle('copy-collection-across', safeHandler('copy-collection-across', async (_event, fromSide, fromDb, fromColl, toSide, toDb, toColl) => {
    validateSide(fromSide);
    validateSide(toSide);
    validateString(fromDb, 'fromDb');
    validateString(toDb, 'toDb');
    validateString(fromColl, 'fromColl');
    validateString(toColl, 'toColl');
    return await db.copyCollectionAcross(fromSide, fromDb, fromColl, toSide, toDb, toColl);
  }));

  ipcMain.handle('create-database', safeHandler('create-database', async (_event, side, dbName, collName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    return await db.createDatabase(side, dbName, collName);
  }));

  ipcMain.handle('drop-database', safeHandler('drop-database', async (_event, side, dbName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    return await db.dropDatabase(side, dbName);
  }));

  ipcMain.handle('drop-collection', safeHandler('drop-collection', async (_event, side, dbName, collName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.dropCollection(side, dbName, collName);
  }));

  ipcMain.handle('create-collection', safeHandler('create-collection', async (_event, side, dbName, collName, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    // Options is optional — plain object with collection config
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return await db.createCollection(side, dbName, collName, opts);
  }));

  ipcMain.handle('rename-field', safeHandler('rename-field', async (_event, side, dbName, collName, oldName, newName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateString(oldName, 'oldName');
    validateString(newName, 'newName');
    return await db.renameField(side, dbName, collName, oldName, newName);
  }));

  registerToolHandlers(getWindow);
}

module.exports = { registerIpcHandlers };
