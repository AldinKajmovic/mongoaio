import { savedConnections } from '../utils/connections.js';
import { escapeHtml } from '../utils/dom.js';
import { editorConnectedAliases } from './tree-data.js';

export function renderEditorTree(searchQuery) {
  const tree = document.getElementById('editor-tree');
  if (!tree) return;

  const aliases = Object.keys(savedConnections);
  const q = (searchQuery || '').toLowerCase().trim();
  const filtered = q ? aliases.filter(a => a.toLowerCase().includes(q)) : aliases;

  if (filtered.length === 0) {
    // SECURITY: escapeHtml on search query prevents XSS
    tree.innerHTML = '<div class="editor-tree-empty">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">' +
      '<path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
      (q ? 'No connections matching "' + escapeHtml(q) + '"' : 'No saved connections.<br>Save a connection URL first.') +
      '</div>';
    return;
  }

  // SECURITY: escapeHtml on alias/label prevents XSS from crafted connection names
  tree.innerHTML = filtered.map(function (alias) {
    const url = savedConnections[alias];
    const isConn = editorConnectedAliases.has(alias);
    const statusCls = isConn ? 'connected' : 'disconnected';
    const statusTtl = isConn ? 'Connected' : 'Disconnected';
    const safeAlias = escapeHtml(alias);
    let label = alias;
    try { const u = new URL(url); label = alias + ' (' + u.hostname + ':' + (u.port || '27017') + ')'; } catch (e) { }
    const safeLabel = escapeHtml(label);

    return '<div class="tree-node tree-connection" data-type="connection" data-alias="' + safeAlias + '">' +
      '<div class="tree-node-header">' +
      '<span class="tree-arrow">\u25B6</span>' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2"><path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
      '<span class="tree-node-label">' + safeLabel + '</span>' +
      '<span class="tree-conn-status ' + statusCls + '" title="' + statusTtl + '"></span>' +
      '</div>' +
      '<div class="tree-children">' +
      '<div class="tree-node" data-type="placeholder" data-alias="' + safeAlias + '" data-action="connect">' +
      '<div class="tree-node-header tree-leaf">' +
      '<span class="tree-node-label u-text-muted u-italic u-font-sans">Click to connect &amp; load databases...</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}
