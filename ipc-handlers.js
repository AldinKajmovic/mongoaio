const { app, ipcMain, safeStorage } = require('electron');
const db = require('./src/db');
const io = require('./src/main/io');
const fs = require('fs');
const path = require('path');
const {
  validateSide,
  validateString,
  validateObject,
  validateOptions,
  validateConnectionUrl,
  validateDocId,
  sanitizeErrorMessage,
} = require('./src/main/validate');

function getConfigPath() {
  return path.join(app.getPath('userData'), 'connections.json');
}

function encAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; }
}

function encodeUrl(url) {
  if (encAvailable()) {
    try { return { enc: safeStorage.encryptString(url).toString('base64') }; }
    catch (_) { /* fall through to plaintext */ }
  }
  return url;
}

function decodeUrl(entry) {
  if (entry && typeof entry === 'object' && typeof entry.enc === 'string') {
    try { return safeStorage.decryptString(Buffer.from(entry.enc, 'base64')); }
    catch (_) { return null; }
  }
  return typeof entry === 'string' ? entry : null;
}

// Read the raw on-disk map (values may be encrypted or plaintext).
function readRaw() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_) { }
  return {};
}

function writeRaw(raw) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(raw, null, 2));
}

function getConnections() {
  const raw = readRaw();
  const out = {};
  let needsMigration = false;
  for (const [alias, entry] of Object.entries(raw)) {
    const url = decodeUrl(entry);
    if (url === null) {
      console.warn(`Could not decrypt saved connection "${alias}" — was connections.json created on another machine or user account?`);
      out[alias] = '';
    } else {
      out[alias] = url;
    }
    if (encAvailable() && typeof entry === 'string') needsMigration = true;
  }
  if (needsMigration) {
    const migrated = {};
    for (const [alias, entry] of Object.entries(raw)) {
      migrated[alias] = (typeof entry === 'string') ? encodeUrl(entry) : entry;
    }
    try { writeRaw(migrated); } catch (_) { /* non-fatal */ }
  }
  return out;
}

function saveConnection(alias, url) {
  const raw = readRaw();
  raw[alias] = encodeUrl(url);
  writeRaw(raw);
  return getConnections();
}

function deleteConnection(alias) {
  const raw = readRaw();
  delete raw[alias];
  writeRaw(raw);
  return getConnections();
}

function safeHandler(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return { error: sanitizeErrorMessage(err.message) };
    }
  };
}

function registerIpcHandlers(mainWindow) {
  ipcMain.handle('get-connections', () => getConnections());

  ipcMain.handle('save-connection', safeHandler(async (_event, alias, url) => {
    validateString(alias, 'alias');
    validateString(url, 'url');
    return saveConnection(alias, url);
  }));

  ipcMain.handle('delete-connection', safeHandler(async (_event, alias) => {
    validateString(alias, 'alias');
    return deleteConnection(alias);
  }));

  ipcMain.handle('connect', safeHandler(async (_event, url1, url2) => {
    validateConnectionUrl(url1);
    validateConnectionUrl(url2);
    return await db.connectBoth(url1, url2);
  }));

  ipcMain.handle('connect-single', safeHandler(async (_event, url) => {
    validateConnectionUrl(url);
    return await db.connectSingle(url);
  }));

  ipcMain.handle('disconnect', safeHandler(async () => {
    await db.disconnectBoth();
    return { success: true };
  }));

  ipcMain.handle('list-databases', safeHandler(async (_event, side) => {
    validateSide(side);
    return { databases: await db.listDatabases(side) };
  }));

  ipcMain.handle('compare-databases', safeHandler(async () => {
    return await db.compareDatabases();
  }));

  ipcMain.handle('list-collections', safeHandler(async (_event, side, dbName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    return { collections: await db.listCollections(side, dbName) };
  }));

  ipcMain.handle('compare-collections', safeHandler(async (_event, sourceDbName, targetDbName) => {
    validateString(sourceDbName, 'sourceDbName');
    validateString(targetDbName, 'targetDbName');
    return await db.compareCollectionsCross(sourceDbName, targetDbName);
  }));

  ipcMain.handle('compare-documents', safeHandler(async (_event, sourceDbName, targetDbName, collName, options) => {
    validateString(sourceDbName, 'sourceDbName');
    validateString(targetDbName, 'targetDbName');
    validateString(collName, 'collName');
    const opts = validateOptions(options, 'options');
    return await db.compareDocuments(sourceDbName, targetDbName, collName, opts);
  }));

  ipcMain.handle('get-document', safeHandler(async (_event, side, dbName, collName, docId) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    return { document: await db.getDocument(side, dbName, collName, docId) };
  }));

  ipcMain.handle('insert-document', safeHandler(async (_event, side, dbName, collName, doc) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateObject(doc, 'document');
    return await db.insertDocument(side, dbName, collName, doc);
  }));

  ipcMain.handle('update-document', safeHandler(async (_event, side, dbName, collName, docId, doc) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateObject(doc, 'document');
    return await db.updateDocument(side, dbName, collName, docId, doc);
  }));

  ipcMain.handle('delete-document', safeHandler(async (_event, side, dbName, collName, docId) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    return await db.deleteDocument(side, dbName, collName, docId);
  }));

  ipcMain.handle('delete-documents', safeHandler(async (_event, side, dbName, collName, query) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateObject(query, 'query');
    return await db.deleteDocuments(side, dbName, collName, query);
  }));

  ipcMain.handle('patch-document', safeHandler(async (_event, side, dbName, collName, docId, doc) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateObject(doc, 'document');
    return await db.patchDocument(side, dbName, collName, docId, doc);
  }));

  ipcMain.handle('copy-document', safeHandler(async (_event, fromSide, toSide, dbName, collName, docId) => {
    validateSide(fromSide);
    validateSide(toSide);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    return await db.copyDocument(fromSide, toSide, dbName, collName, docId);
  }));

  ipcMain.handle('copy-collection', safeHandler(async (_event, fromSide, toSide, dbName, collName) => {
    validateSide(fromSide);
    validateSide(toSide);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.copyCollectionAcross(fromSide, dbName, collName, toSide, dbName, collName);
  }));

  ipcMain.handle('copy-collection-across', safeHandler(async (_event, fromSide, fromDb, fromColl, toSide, toDb, toColl) => {
    validateSide(fromSide);
    validateSide(toSide);
    validateString(fromDb, 'fromDb');
    validateString(toDb, 'toDb');
    validateString(fromColl, 'fromColl');
    validateString(toColl, 'toColl');
    return await db.copyCollectionAcross(fromSide, fromDb, fromColl, toSide, toDb, toColl);
  }));

  ipcMain.handle('create-database', safeHandler(async (_event, side, dbName, collName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    return await db.createDatabase(side, dbName, collName);
  }));

  ipcMain.handle('drop-database', safeHandler(async (_event, side, dbName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    return await db.dropDatabase(side, dbName);
  }));

  ipcMain.handle('drop-collection', safeHandler(async (_event, side, dbName, collName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.dropCollection(side, dbName, collName);
  }));

  ipcMain.handle('create-collection', safeHandler(async (_event, side, dbName, collName, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    // Options is optional — plain object with collection config
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return await db.createCollection(side, dbName, collName, opts);
  }));

  ipcMain.handle('rename-field', safeHandler(async (_event, side, dbName, collName, oldName, newName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateString(oldName, 'oldName');
    validateString(newName, 'newName');
    return await db.renameField(side, dbName, collName, oldName, newName);
  }));

  // Evaluate an arbitrary mongosh-style command/script against the live driver.
  // Supports the full driver surface (find/aggregate/bulkWrite/indexes/...),
  // mongosh helpers (ObjectId, ISODate, NumberLong, ...) and legacy aliases.
  ipcMain.handle('shell-eval', safeHandler(async (_event, side, dbName, code, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(code, 'code');
    return await db.evaluateShell(side, dbName, code, options || {});
  }));

  // Stream the next batch from a live shell cursor (mongosh `it` semantics).
  ipcMain.handle('shell-cursor-next', safeHandler(async (_event, cursorId) => {
    validateString(cursorId, 'cursorId');
    return await db.shellCursorNext(cursorId);
  }));

  // Release a live shell cursor (result removed / tab closed / shell exited).
  ipcMain.handle('shell-cursor-close', safeHandler(async (_event, cursorId) => {
    validateString(cursorId, 'cursorId');
    await db.closeShellCursor(cursorId);
    return { ok: true };
  }));

  // Live server performance metrics (serverStatus + top + currentOp).
  ipcMain.handle('server-metrics', safeHandler(async (_event, side) => {
    validateSide(side);
    return await db.getServerMetrics(side);
  }));

  ipcMain.handle('execute-query', safeHandler(async (_event, side, dbName, collName, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    const opts = validateOptions(options, 'options');
    return await db.executeQuery(side, dbName, collName, opts);
  }));

  // --- Index management -----------------------------------------------------
  ipcMain.handle('list-indexes', safeHandler(async (_event, side, dbName, collName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.listIndexes(side, dbName, collName);
  }));

  ipcMain.handle('create-index', safeHandler(async (_event, side, dbName, collName, keys, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateObject(keys, 'keys');
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return await db.createIndex(side, dbName, collName, keys, opts);
  }));

  ipcMain.handle('drop-index', safeHandler(async (_event, side, dbName, collName, indexName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateString(indexName, 'indexName');
    return await db.dropIndex(side, dbName, collName, indexName);
  }));

  // --- Explain plan ---------------------------------------------------------
  ipcMain.handle('explain-query', safeHandler(async (_event, side, dbName, collName, options, verbosity) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    const opts = validateOptions(options, 'options');
    return await db.explainQuery(side, dbName, collName, opts, verbosity);
  }));

  // --- Schema analysis ------------------------------------------------------
  ipcMain.handle('analyze-schema', safeHandler(async (_event, side, dbName, collName, sampleSize) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.analyzeSchema(side, dbName, collName, Number(sampleSize) || 1000);
  }));

  // --- Aggregation pipeline -------------------------------------------------
  ipcMain.handle('run-aggregate', safeHandler(async (_event, side, dbName, collName, pipeline, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    if (!Array.isArray(pipeline)) throw new Error('pipeline must be an array');
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return await db.runAggregate(side, dbName, collName, pipeline, opts);
  }));

  // --- Document field ops (tree add/remove field) ---------------------------
  ipcMain.handle('unset-field', safeHandler(async (_event, side, dbName, collName, docId, fieldPath) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateString(fieldPath, 'fieldPath');
    return await db.unsetField(side, dbName, collName, docId, fieldPath);
  }));

  ipcMain.handle('set-field', safeHandler(async (_event, side, dbName, collName, docId, fieldPath, value) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateString(fieldPath, 'fieldPath');
    return await db.setField(side, dbName, collName, docId, fieldPath, value);
  }));

  // --- Import / Export (file dialogs live in the main process) --------------
  ipcMain.handle('export-data', safeHandler(async (_event, params) => {
    return await io.exportData(mainWindow, db, params || {});
  }));

  ipcMain.handle('import-data', safeHandler(async (_event, params) => {
    return await io.importData(mainWindow, db, params || {});
  }));
}

module.exports = { registerIpcHandlers };
