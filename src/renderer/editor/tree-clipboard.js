import { state } from '../utils/state.js';
import { toast, showLoading, hideLoading } from '../utils/ui.js';
import { renderEditorTree } from './tree-renderer.js';
import { savedConnections } from '../utils/connections.js';
import { setClipboard, getClipboard } from './tree-selection.js';
import { editorLoadCollections, editorConnectAlias } from './tree-data.js';
import { ensureActive } from './tree-actions.js';

/**
 * Copy all collections of a database into the internal clipboard.
 */
export async function copyAllCollections(alias, dbName) {
  await ensureActive(alias);
  showLoading(`Listing collections in ${dbName}...`);
  try {
    const listRes = await window.api.listCollections('source', dbName);
    if (listRes.error) {
      toast(`Error listing collections: ${listRes.error}`, 'error');
      return;
    }
    const colls = listRes.collections || [];
    if (colls.length === 0) {
      toast('No collections to copy', 'warning');
      return;
    }
    const items = colls.map(coll => ({ alias, db: dbName, coll }));
    setClipboard(items);
    toast(`Copied ${colls.length} collection(s) to clipboard — use Paste to move them`, 'success');
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Export collection names as a text list to the system clipboard.
 */
export async function exportCollections(alias, dbName) {
  await ensureActive(alias);
  showLoading(`Listing collections in ${dbName}...`);
  try {
    const listRes = await window.api.listCollections('source', dbName);
    if (listRes.error) {
      toast(`Error listing collections: ${listRes.error}`, 'error');
      return;
    }
    const colls = listRes.collections || [];
    if (colls.length === 0) {
      toast('No collections to export', 'warning');
      return;
    }
    const text = colls.join('\n');
    navigator.clipboard.writeText(text);
    toast(`Exported ${colls.length} collection name(s) to clipboard`, 'success');
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Paste collections from clipboard into a target database.
 */
export async function pasteCollections(targetAlias, targetDb) {
  const items = getClipboard();
  if (items.length === 0) {
    toast('Nothing to paste — copy collections first', 'warning');
    return;
  }
  showLoading(`Pasting ${items.length} collection(s)...`);
  let success = 0;
  let fail = 0;
  try {
    for (const item of items) {
      const srcUrl = savedConnections[item.alias];
      const tgtUrl = savedConnections[targetAlias];
      if (!srcUrl || !tgtUrl) { fail++; continue; }
      if (item.alias !== targetAlias) {
        await window.api.connect(srcUrl, tgtUrl);
        const res = await window.api.copyCollectionAcross('source', item.db, item.coll, 'target', targetDb, item.coll);
        if (res.error) fail++; else success++;
      } else {
        await ensureActive(targetAlias);
        const res = await window.api.copyCollectionAcross('source', item.db, item.coll, 'source', targetDb, item.coll);
        if (res.error) fail++; else success++;
      }
    }
    if (success > 0) toast(`Pasted ${success} collection(s) into ${targetDb}`, 'success');
    if (fail > 0) toast(`${fail} collection(s) failed`, 'error');
    await editorConnectAlias(targetAlias);
    refreshDatabaseNode(targetDb);
  } catch (err) {
    toast(`Paste error: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Prompt for a new database name and paste clipboard contents into it.
 */
export async function pasteIntoNewDatabase(alias) {
  const items = getClipboard();
  if (items.length === 0) {
    toast('Nothing to paste — copy collections first', 'warning');
    return;
  }
  const dbName = prompt(`Enter new database name for ${alias}:`);
  if (!dbName) return;
  await pasteCollections(alias, dbName);
  renderEditorTree();
}

/**
 * Refresh a single database node's collection list in the tree.
 */
export function refreshDatabaseNode(dbName) {
  const alias = state.editor.alias;
  const dbNode = document.querySelector(
    `.tree-database[data-db="${dbName}"][data-alias="${alias}"]`
  );
  if (dbNode) {
    const ch = dbNode.querySelector('.tree-children');
    if (ch) {
      ch.innerHTML = '<div class="tree-node" data-type="placeholder"' +
        ` data-alias="${alias}" data-db="${dbName}" data-action="load-collections">` +
        '<div class="tree-node-header tree-leaf">' +
        '<span class="tree-node-label u-text-muted u-italic u-font-sans">Click to load collections...</span>' +
        '</div></div>';
    }
    editorLoadCollections(alias, dbName, dbNode);
  } else {
    renderEditorTree();
  }
}
