import { state, elements } from '../utils/state.js';
import { toast, showLoading, hideLoading } from '../utils/ui.js';
import { openAddDatabaseModal } from '../modals/add-database.js';
import { openAddCollectionModal } from '../modals/add-collection.js';
import { updateShellContext } from './shell.js';
import { renderEditorTree } from './tree-renderer.js';
import { savedConnections } from '../utils/connections.js';
import { editorConnectAlias, editorConnectedAliases } from './tree-data.js';

// Re-export clipboard actions so tree-handlers can import from one place
export {
  copyAllCollections, exportCollections,
  pasteCollections, pasteIntoNewDatabase,
} from './tree-clipboard.js';

/**
 * Open shell for the given target
 */
export function openShell(alias, db, coll) {
  if (alias) ensureActive(alias);
  if (alias) state.editor.alias = alias;
  if (db) state.editor.db = db;
  if (coll) state.editor.coll = coll;
  updateShellContext();
  if (elements.btnEditorViewShell) elements.btnEditorViewShell.click();
}

/**
 * Ensure the given alias is the active backend connection
 */
export async function ensureActive(alias) {
  if (state.editor.alias !== alias || !state.connected) {
    await editorConnectAlias(alias);
  }
}

export async function addDatabase(alias) {
  openAddDatabaseModal(alias);
}

export function copyText(text) {
  navigator.clipboard.writeText(text);
  toast('Copied to clipboard', 'info');
}

export function exportUri(alias) {
  const url = savedConnections[alias];
  if (url) {
    copyText(url);
  } else {
    toast('Connection URI not found', 'error');
  }
}

/**
 * Disconnect from server
 */
export async function disconnectServer(alias) {
  showLoading(alias ? `Disconnecting from ${alias}...` : 'Disconnecting all...');
  try {
    if (alias) {
      editorConnectedAliases.delete(alias);
      if (state.editor.alias === alias) {
        await window.api.disconnect();
        state.connected = false;
        state.editor.alias = null;
        state.editor.db = null;
        state.editor.coll = null;
        updateShellContext();
      }
      toast(`Disconnected from ${alias}`, 'info');
    } else {
      await window.api.disconnect();
      editorConnectedAliases.clear();
      state.connected = false;
      state.editor.alias = null;
      state.editor.db = null;
      state.editor.coll = null;
      updateShellContext();
      toast('All connections closed', 'info');
    }
    renderEditorTree();
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

export async function disconnectAll() {
  await disconnectServer();
}

/**
 * Drop a database
 */
export async function dropDatabase(alias, dbName) {
  await ensureActive(alias);
  const msg = `Are you sure you want to drop database "${dbName}"?\n\n` +
    'This will PERMANENTLY DELETE all collections and data in this database.';
  if (!confirm(msg)) return;

  showLoading(`Dropping database ${dbName}...`);
  try {
    const result = await window.api.dropDatabase('source', dbName);
    if (result.error) {
      toast(`Failed to drop database: ${result.error}`, 'error');
    } else {
      toast(`Database ${dbName} dropped`, 'success');
      renderEditorTree();
    }
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

export async function addCollection(alias, dbName) {
  openAddCollectionModal(alias, dbName);
}

/**
 * Copy an entire database to a new database name.
 */
export async function copyDatabase(alias, dbName) {
  await ensureActive(alias);
  const targetDb = prompt(`Copy database "${dbName}" to new database name:`);
  if (!targetDb) return;
  if (targetDb === dbName) {
    toast('Target database must have a different name', 'warning');
    return;
  }

  showLoading(`Copying database ${dbName} to ${targetDb}...`);
  try {
    const listRes = await window.api.listCollections('source', dbName);
    if (listRes.error) {
      toast(`Error listing collections: ${listRes.error}`, 'error');
      return;
    }

    const colls = listRes.collections || [];
    if (colls.length === 0) {
      toast('Source database has no collections to copy', 'warning');
      return;
    }

    let ok = 0;
    let fail = 0;
    for (const coll of colls) {
      try {
        const r = await window.api.copyCollectionAcross(
          'source', dbName, coll, 'source', targetDb, coll
        );
        if (r.error) { fail++; } else { ok++; }
      } catch { fail++; }
    }

    if (ok > 0) toast(`Copied ${ok} collection(s) to ${targetDb}`, 'success');
    if (fail > 0) toast(`${fail} collection(s) failed to copy`, 'error');
    renderEditorTree();
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}
