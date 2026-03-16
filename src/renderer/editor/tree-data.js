import { state, elements } from '../utils/state.js';
import { toast, setStatus } from '../utils/ui.js';
import { savedConnections } from '../utils/connections.js';
import { escapeHtml } from '../utils/dom.js';
import { updateShellContext } from './shell.js';

// Track which aliases are currently connected (owned here to avoid circular deps)
export const editorConnectedAliases = new Set();

/**
 * Generate a placeholder HTML node for the tree sidebar.
 */
function treePlaceholder(text, cls = 'u-text-amber u-font-sans') {
  // SECURITY: escapeHtml prevents XSS from error messages or other dynamic text
  return '<div class="tree-node" data-type="placeholder"><div class="tree-node-header tree-leaf">' +
    `<span class="tree-node-label ${cls}">${escapeHtml(text)}</span></div></div>`;
}

/**
 * Generate database node HTML for the tree sidebar.
 */
function renderDatabaseNodes(alias, dbs) {
  // SECURITY: escapeHtml on db/alias names prevents XSS from crafted names
  return dbs.map(db => {
    const safeDb = escapeHtml(db);
    const safeAlias = escapeHtml(alias);
    return `<div class="tree-node tree-database" data-type="database" data-db="${safeDb}" data-alias="${safeAlias}">` +
      '<div class="tree-node-header">' +
      '<span class="tree-arrow">\u25B6</span>' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' +
      `<span class="tree-node-label">${safeDb}</span>` +
      '</div>' +
      '<div class="tree-children">' +
      `<div class="tree-node" data-type="placeholder" data-alias="${safeAlias}" data-db="${safeDb}" data-action="load-collections"><div class="tree-node-header tree-leaf">` +
      '<span class="tree-node-label u-text-muted u-italic u-font-sans">Click to load collections...</span></div></div>' +
      '</div>' +
      '</div>';
  }).join('');
}

/**
 * Connect to an alias and load its databases into the tree.
 */
export async function editorConnectAlias(alias) {
  const url = savedConnections[alias];
  if (!url) return;

  const connNode = document.querySelector(`.tree-connection[data-alias="${alias}"]`);
  if (!connNode) return;

  connNode.classList.add('expanded');

  const ch = connNode.querySelector('.tree-children');
  ch.innerHTML = treePlaceholder('Connecting...');

  toast(`Connecting to ${alias}...`, 'info');

  let result;
  try {
    result = await window.api.connectSingle(url);
  } catch (err) {
    result = { error: err.message };
  }

  if (result.error) {
    editorConnectedAliases.delete(alias);
    ch.innerHTML = treePlaceholder('Failed: ' + result.error, 'u-text-error u-font-sans');
    const d = connNode.querySelector('.tree-conn-status');
    if (d) { d.className = 'tree-conn-status disconnected'; d.title = 'Disconnected'; }
    toast(`Connection failed: ${result.error}`, 'error');
    return;
  }

  editorConnectedAliases.add(alias);
  state.editor.alias = alias;
  updateShellContext();
  state.connected = true;
  state.sourceUrl = url;
  state.targetUrl = url;
  setStatus('connected');
  elements.btnDisconnect.style.display = 'inline-flex';

  const dot = connNode.querySelector('.tree-conn-status');
  if (dot) { dot.className = 'tree-conn-status connected'; dot.title = 'Connected'; }
  toast(`Connected to ${alias}`, 'success');

  ch.innerHTML = treePlaceholder('Loading databases...');

  const dbRes = await window.api.compareDatabases();
  if (dbRes.error) {
    ch.innerHTML = treePlaceholder('Error: ' + dbRes.error, 'u-text-error');
    return;
  }

  const allDbs = [...new Set([
    ...(dbRes.common || []),
    ...(dbRes.onlyInSource || []),
    ...(dbRes.onlyInTarget || []),
  ])].sort();

  if (allDbs.length === 0) {
    ch.innerHTML = treePlaceholder('No databases found', 'u-text-muted u-italic');
    return;
  }

  ch.innerHTML = renderDatabaseNodes(alias, allDbs);
  connNode.classList.add('expanded');
}

/**
 * Load collections for a database node in the editor tree.
 */
export async function editorLoadCollections(alias, dbName, dbNode) {
  const children = dbNode.querySelector('.tree-children');
  if (!children.querySelector('[data-type="placeholder"]')) return;

  state.editor.alias = alias;
  state.editor.db = dbName;
  updateShellContext();
  const result = await window.api.compareCollections(dbName, dbName);
  if (result.error) {
    children.innerHTML = treePlaceholder('Error: ' + result.error, 'u-text-error');
    return;
  }

  const allColls = [...new Set([
    ...(result.common || []),
    ...(result.onlyInSource || []),
    ...(result.onlyInTarget || []),
  ])].sort();

  if (allColls.length === 0) {
    children.innerHTML = treePlaceholder('No collections', 'u-text-muted u-italic');
    return;
  }

  // SECURITY: escapeHtml on collection/db/alias names prevents XSS
  const safeDbName = escapeHtml(dbName);
  const safeAlias = escapeHtml(alias);
  children.innerHTML = allColls.map(coll => {
    const safeColl = escapeHtml(coll);
    return `<div class="tree-node tree-collection" data-type="collection" data-coll="${safeColl}" data-db="${safeDbName}" data-alias="${safeAlias}">` +
      '<div class="tree-node-header tree-leaf">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>' +
      `<span class="tree-node-label">${safeColl}</span>` +
      '</div>' +
      '</div>';
  }).join('');
}
