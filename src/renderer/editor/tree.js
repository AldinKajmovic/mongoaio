import { state, elements } from '../utils/state.js';
import { debounce } from '../utils/dom.js';
import { savedConnections, loadConnections } from '../utils/connections.js';
import { runEditorQuery } from './query.js';
import { renderEditorTree } from './tree-renderer.js';
import { updateShellContext } from './shell.js';
import { editorConnectAlias, editorConnectedAliases } from './tree-data.js';
import { setupTreeHandlers } from './tree-handlers.js';
import { toast } from '../utils/ui.js';

export { renderEditorTree, editorConnectedAliases };

function toggleTreeNode(node) {
  node.classList.toggle('expanded');
}

// Select a collection in the sidebar tree
function selectCollection(headerEl, alias, dbName, collName) {
  document.querySelectorAll('.editor-tree .tree-node.selected').forEach(n => n.classList.remove('selected'));
  const collNode = headerEl.closest('.tree-node');
  if (collNode) collNode.classList.add('selected');

  const collLabel = collName || headerEl.querySelector('.tree-node-label').textContent;
  const dbNode = collNode ? collNode.closest('.tree-database') : null;
  const dbLabel = dbName || (dbNode ? dbNode.querySelector('.tree-node-header .tree-node-label').textContent : 'root');
  const connNode = collNode ? collNode.closest('.tree-connection') : null;
  const connLabel = connNode ? connNode.querySelector('.tree-node-header .tree-node-label').textContent : (alias || 'Connection');

  state.editor.alias = alias || (connNode ? connNode.dataset.alias : null);
  state.editor.db = dbLabel === 'root' ? null : dbLabel;
  state.editor.coll = collLabel;

  if (elements.editorBreadcrumb) {
    elements.editorBreadcrumb.innerHTML = `
      <span class="editor-crumb">${connLabel}</span>
      <span class="editor-crumb-sep">&#8250;</span>
      <span class="editor-crumb">${dbLabel}</span>
      <span class="editor-crumb-sep">&#8250;</span>
      <span class="editor-crumb active">${collLabel}</span>
    `;
  }

  elements.editorQuerySkip.value = 0;
  runEditorQuery();
  updateShellContext();
}

// Initialize tree search
const editorTreeSearchDebounced = debounce((query) => renderEditorTree(query), 300);
const treeSearchInput = document.getElementById('editor-tree-search');
if (treeSearchInput) {
  treeSearchInput.addEventListener('input', e => editorTreeSearchDebounced(e.target.value));
}

// Result tab switching
document.querySelectorAll('.editor-result-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.editorTab;
    document.querySelectorAll('.editor-result-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const resultCont = document.getElementById('editor-result-container');
    const explainPanel = document.getElementById('editor-data-explain');
    if (resultCont) resultCont.style.display = targetTab === 'result' ? 'block' : 'none';
    if (explainPanel) explainPanel.style.display = targetTab === 'explain' ? 'block' : 'none';
  });
});

// Setup specialized handlers
setupTreeHandlers(selectCollection, toggleTreeNode);

/**
 * Load the editor tree, ensuring the correct connection is selected if available
 */
export function loadEditorTree() {
  renderEditorTree();
  if (state.connected && state.sourceUrl) {
    const alias = Object.keys(savedConnections).find(key => savedConnections[key] === state.sourceUrl);
    if (alias) {
      const connNode = document.querySelector(`.tree-connection[data-alias="${alias}"]`);
      if (connNode) {
        connNode.classList.add('expanded');
        editorConnectAlias(alias);
      }
    }
  }
}

// Import connections event listener
if (elements.btnImportConnections) {
  elements.btnImportConnections.addEventListener('click', async () => {
    const result = await window.api.importConnections();
    if (result.success) {
      toast('Connections imported successfully', 'success');
      await loadConnections();
      renderEditorTree();
    } else if (result.message && result.message !== 'Canceled') {
      toast(`Import failed: ${result.error || result.message}`, 'error');
    }
  });
}
