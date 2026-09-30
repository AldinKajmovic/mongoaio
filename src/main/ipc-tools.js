/* =============================================
   Main Process — Shell, Query, Index & IO IPC
   ============================================= */

const { ipcMain } = require('electron');
const db = require('../db');
const io = require('./io');
const {
  validateSide,
  validateString,
  validateObject,
  validateOptions,
  validateDocId,
} = require('./validate');
const { safeHandler } = require('./ipc-safe');

/**
 * Register the handlers behind the shell, query, index, schema and import/export
 * features. Split out of ipc-handlers.js to keep both files under 300 lines.
 * @param {() => (import('electron').BrowserWindow|null)} getWindow - owner of the file dialogs
 */
function registerToolHandlers(getWindow) {

  // Evaluate an arbitrary mongosh-style command/script against the live driver.
  // Supports the full driver surface (find/aggregate/bulkWrite/indexes/...),
  // mongosh helpers (ObjectId, ISODate, NumberLong, ...) and legacy aliases.
  ipcMain.handle('shell-eval', safeHandler('shell-eval', async (_event, side, dbName, code, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(code, 'code');
    return await db.evaluateShell(side, dbName, code, options || {});
  }));

  // Stream the next batch from a live shell cursor (mongosh `it` semantics).
  ipcMain.handle('shell-cursor-next', safeHandler('shell-cursor-next', async (_event, cursorId) => {
    validateString(cursorId, 'cursorId');
    return await db.shellCursorNext(cursorId);
  }));

  // Release a live shell cursor (result removed / tab closed / shell exited).
  ipcMain.handle('shell-cursor-close', safeHandler('shell-cursor-close', async (_event, cursorId) => {
    validateString(cursorId, 'cursorId');
    await db.closeShellCursor(cursorId);
    return { ok: true };
  }));

  // Live server performance metrics (serverStatus + top + currentOp).
  ipcMain.handle('server-metrics', safeHandler('server-metrics', async (_event, side) => {
    validateSide(side);
    return await db.getServerMetrics(side);
  }));

  ipcMain.handle('execute-query', safeHandler('execute-query', async (_event, side, dbName, collName, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    const opts = validateOptions(options, 'options');
    return await db.executeQuery(side, dbName, collName, opts);
  }));

  // --- Index management -----------------------------------------------------
  ipcMain.handle('list-indexes', safeHandler('list-indexes', async (_event, side, dbName, collName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.listIndexes(side, dbName, collName);
  }));

  ipcMain.handle('create-index', safeHandler('create-index', async (_event, side, dbName, collName, keys, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateObject(keys, 'keys');
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return await db.createIndex(side, dbName, collName, keys, opts);
  }));

  ipcMain.handle('drop-index', safeHandler('drop-index', async (_event, side, dbName, collName, indexName) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateString(indexName, 'indexName');
    return await db.dropIndex(side, dbName, collName, indexName);
  }));

  // --- Explain plan ---------------------------------------------------------
  ipcMain.handle('explain-query', safeHandler('explain-query', async (_event, side, dbName, collName, options, verbosity) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    const opts = validateOptions(options, 'options');
    return await db.explainQuery(side, dbName, collName, opts, verbosity);
  }));

  // --- Schema analysis ------------------------------------------------------
  ipcMain.handle('analyze-schema', safeHandler('analyze-schema', async (_event, side, dbName, collName, sampleSize) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    return await db.analyzeSchema(side, dbName, collName, Number(sampleSize) || 1000);
  }));

  // --- Aggregation pipeline -------------------------------------------------
  ipcMain.handle('run-aggregate', safeHandler('run-aggregate', async (_event, side, dbName, collName, pipeline, options) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    if (!Array.isArray(pipeline)) throw new Error('pipeline must be an array');
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return await db.runAggregate(side, dbName, collName, pipeline, opts);
  }));

  // --- Document field ops (tree add/remove field) ---------------------------
  ipcMain.handle('unset-field', safeHandler('unset-field', async (_event, side, dbName, collName, docId, fieldPath) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateString(fieldPath, 'fieldPath');
    return await db.unsetField(side, dbName, collName, docId, fieldPath);
  }));

  ipcMain.handle('set-field', safeHandler('set-field', async (_event, side, dbName, collName, docId, fieldPath, value) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    validateString(fieldPath, 'fieldPath');
    return await db.setField(side, dbName, collName, docId, fieldPath, value);
  }));

  // One document's staged tree edits, applied atomically with a stale-value check.
  ipcMain.handle('apply-field-changes', safeHandler('apply-field-changes', async (_event, side, dbName, collName, docId, changes) => {
    validateSide(side);
    validateString(dbName, 'dbName');
    validateString(collName, 'collName');
    validateDocId(docId);
    const c = validateObject(changes, 'changes');
    if (c.set !== undefined) validateObject(c.set, 'changes.set');
    if (c.expect !== undefined) validateObject(c.expect, 'changes.expect');
    for (const key of ['unset', 'expectMissing']) {
      const paths = c[key];
      if (paths !== undefined && (!Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !p))) {
        throw new Error(`Invalid changes.${key}: must be an array of field paths.`);
      }
    }
    return await db.applyFieldChanges(side, dbName, collName, docId, c);
  }));

  // --- Import / Export (file dialogs live in the main process) --------------
  ipcMain.handle('export-data', safeHandler('export-data', async (_event, params) => {
    return await io.exportData(getWindow(), db, params || {});
  }));

  ipcMain.handle('import-data', safeHandler('import-data', async (_event, params) => {
    try {
      return await io.importData(getWindow(), db, params || {});
    } finally {
      db.invalidateCompareCache();
    }
  }));

  // --- Cancellable queries --------------------------------------------------
  ipcMain.handle('cancel-op', safeHandler('cancel-op', async (_event, opId) => {
    validateString(opId, 'opId');
    return await db.cancelOp(opId);
  }));
}

module.exports = { registerToolHandlers };
