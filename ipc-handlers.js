const { ipcMain, dialog } = require('electron');
const db = require('./src/db');
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

function getConnections() {
  const configPath = path.join(__dirname, 'connections.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) { }
  return {};
}

function saveConnection(alias, url) {
  const configPath = path.join(__dirname, 'connections.json');
  const conns = getConnections();
  conns[alias] = url;
  fs.writeFileSync(configPath, JSON.stringify(conns, null, 2));
  return conns;
}

function deleteConnection(alias) {
  const configPath = path.join(__dirname, 'connections.json');
  const conns = getConnections();
  delete conns[alias];
  fs.writeFileSync(configPath, JSON.stringify(conns, null, 2));
  return conns;
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

function registerIpcHandlers() {
  ipcMain.handle('get-connections', () => getConnections());

  ipcMain.handle('save-connection', (_event, alias, url) => {
    validateString(alias, 'alias');
    validateString(url, 'url');
    return saveConnection(alias, url);
  });

  ipcMain.handle('delete-connection', (_event, alias) => {
    validateString(alias, 'alias');
    return deleteConnection(alias);
  });

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
    return await db.copyCollection(fromSide, toSide, dbName, collName);
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

  ipcMain.handle('execute-query', safeHandler(async (_event, side, dbName, collName, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    const opts = validateOptions(options, 'options');
    return await db.executeQuery(side, dbName, collName, opts);
  }));

  ipcMain.handle('import-connections', safeHandler(async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Canceled' };
    }

    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath, 'utf8');
    const imported = JSON.parse(data);

    if (typeof imported !== 'object' || imported === null) {
      throw new Error('Invalid JSON format: expected an object of connections.');
    }

    // Merge with existing
    const current = getConnections();
    const merged = { ...current, ...imported };
    
    // Simple validation: ensure all values are strings
    for (const [alias, url] of Object.entries(merged)) {
      if (typeof alias !== 'string' || typeof url !== 'string') {
        throw new Error('Invalid connection format: alias and URL must be strings.');
      }
    }

    const configPath = path.join(__dirname, 'connections.json');
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
    
    return { success: true, connections: merged };
  }));
}

module.exports = { registerIpcHandlers };
