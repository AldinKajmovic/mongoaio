import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { parseRelaxedJSON } from '../utils/dom.js';
import { openModal } from '../modals/base.js';
import { setEditorLocalResults } from './search.js';
import { renderJsonView, renderTreeView, renderTableView } from './query-renderer.js';
import { initQueryHandlers } from './query-handlers.js';

export let currentRenderedItems = [];
export const expandedDocs = new Set();

/**
 * Run the current editor query
 */
export async function runEditorQuery() {
  if (!state.editor.db || !state.editor.coll) {
    toast('Please select a collection from the tree first', 'warning');
    return;
  }

  const filterStr = elements.editorQueryFilter.value.trim() || '{}';
  const sortStr = elements.editorQuerySort.value.trim() || '{}';
  const projStr = elements.editorQueryProjection.value.trim() || '{}';
  const limit = parseInt(elements.editorQueryLimit.value) || 10;
  const skip = parseInt(elements.editorQuerySkip.value) || 0;

  let filter, sort, projection;
  try {
    filter = parseRelaxedJSON(filterStr);
    sort = parseRelaxedJSON(sortStr);
    projection = parseRelaxedJSON(projStr);
  } catch (e) {
    toast(`Invalid query: ${e.message}`, 'error');
    return;
  }

  showLoading('Running query...');
  const startTime = Date.now();
  try {
    const result = await window.api.executeQuery(state.editor.side, state.editor.db, state.editor.coll, { filter, sort, projection, limit, skip });
    hideLoading();
    const duration = (Date.now() - startTime) / 1000;
    const timeEl = document.querySelector('.editor-status-time');
    if (timeEl) timeEl.textContent = duration.toFixed(3) + 's';
    if (result.error) { toast(`Query error: ${result.error}`, 'error'); return; }
    renderEditorResults(result);
  } catch (err) {
    hideLoading();
    toast(`System error: ${err.message}`, 'error');
  }
}

/**
 * Render query results into the UI
 */
export function renderEditorResults(result, skipSync = false) {
  currentRenderedItems = result.items;

  if (!skipSync) {
    state.editor.total = result.total;
    state.editor.limit = result.limit;
    state.editor.skip = (result.page - 1) * result.limit;
    setEditorLocalResults(result.items);
    elements.editorQueryLimit.value = result.limit;
    elements.editorQuerySkip.value = state.editor.skip;
    if (elements.editorPageSizeSelect) elements.editorPageSizeSelect.value = result.limit;
  }

  if (elements.btnEditorPrev) elements.btnEditorPrev.disabled = result.page === 1;
  if (elements.btnEditorFirst) elements.btnEditorFirst.disabled = result.page === 1;

  const totalPages = Math.ceil(result.total / result.limit);
  if (elements.btnEditorNext) elements.btnEditorNext.disabled = result.page >= totalPages || totalPages === 0;
  if (elements.btnEditorLast) elements.btnEditorLast.disabled = result.page >= totalPages || totalPages === 0;

  if (elements.editorPaginationInfo) {
    const start = result.items.length > 0 ? (result.page - 1) * result.limit + 1 : 0;
    const end = (result.page - 1) * result.limit + result.items.length;
    elements.editorPaginationInfo.textContent = `Documents ${start} to ${end} of ${result.total}`;
  }

  const statusInfo = document.querySelector('.editor-status-info');
  if (statusInfo) statusInfo.textContent = `${result.items.length} items on page`;

  const sq = document.getElementById('editor-search-input')?.value.toLowerCase() || '';

  renderJsonView(result.items, sq);
  renderTreeView(result.items, sq, expandedDocs);
  renderTableView(result.items, sq, state.editor.skip);
}

/**
 * Open a document for full editing in a modal
 */
export function openEditorEditModal(index) {
  const doc = currentRenderedItems[index];
  if (!doc) return;
  openModal('Edit Document', JSON.stringify(doc, null, 2), async (json) => {
    let updatedDoc;
    try { updatedDoc = JSON.parse(json); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    if (String(updatedDoc._id || '') !== String(doc._id)) throw new Error('Changing _id is not allowed.');
    showLoading('Updating document...');
    const result = await window.api.updateDocument(state.editor.side, state.editor.db, state.editor.coll, doc._id, updatedDoc);
    hideLoading();
    if (result.error) throw new Error(result.error);
    toast('Document updated successfully', 'success');
    runEditorQuery();
    return true;
  });
}

/**
 * Clear all editor results and reset query inputs
 */
export function clearEditorResults() {
  currentRenderedItems = [];
  expandedDocs.clear();

  // Clear query inputs
  if (elements.editorQueryFilter) elements.editorQueryFilter.value = '{}';
  if (elements.editorQuerySort) elements.editorQuerySort.value = '{}';
  if (elements.editorQueryProjection) elements.editorQueryProjection.value = '{}';
  if (elements.editorQueryLimit) elements.editorQueryLimit.value = '10';
  if (elements.editorQuerySkip) elements.editorQuerySkip.value = '0';
  if (elements.editorPageSizeSelect) elements.editorPageSizeSelect.value = '10';

  // Clear data panels
  const treeRows = document.getElementById('editor-tree-rows');
  if (treeRows) treeRows.innerHTML = '';
  const jsonPanel = document.getElementById('editor-data-json');
  if (jsonPanel) { const pre = jsonPanel.querySelector('pre'); if (pre) pre.textContent = '[]'; }
  const tableHead = document.getElementById('editor-table-head');
  if (tableHead) tableHead.innerHTML = '<th class="editor-table-th">#</th>';
  const tableBody = document.getElementById('editor-table-body');
  if (tableBody) tableBody.innerHTML = '';

  // Reset pagination
  if (elements.editorPaginationInfo) elements.editorPaginationInfo.textContent = 'Documents 0 to 0';
  if (elements.btnEditorPrev) elements.btnEditorPrev.disabled = true;
  if (elements.btnEditorFirst) elements.btnEditorFirst.disabled = true;
  if (elements.btnEditorNext) elements.btnEditorNext.disabled = true;
  if (elements.btnEditorLast) elements.btnEditorLast.disabled = true;

  // Reset status bar
  const statusInfo = document.querySelector('.editor-status-info');
  if (statusInfo) statusInfo.textContent = '0 items selected';
  const timeEl = document.querySelector('.editor-status-time');
  if (timeEl) timeEl.textContent = '0.000s';

  // Reset editor state
  state.editor.total = undefined;
}

// Initial event binding
[elements.editorQueryFilter, elements.editorQuerySort, elements.editorQueryProjection, elements.editorQueryLimit, elements.editorQuerySkip].forEach(el => {
  if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') runEditorQuery(); });
});

if (elements.btnEditorRunQuery) {
  elements.btnEditorRunQuery.addEventListener('click', () => { elements.editorQuerySkip.value = 0; runEditorQuery(); });
}

// Pagination and Toolbar Buttons
if (elements.btnEditorFirst) elements.btnEditorFirst.onclick = () => changePage('first');
if (elements.btnEditorPrev) elements.btnEditorPrev.onclick = () => changePage('prev');
if (elements.btnEditorNext) elements.btnEditorNext.onclick = () => changePage('next');
if (elements.btnEditorLast) elements.btnEditorLast.onclick = () => changePage('last');
if (elements.btnEditorRefresh) elements.btnEditorRefresh.onclick = () => runEditorQuery();

if (elements.editorPageSizeSelect) {
  elements.editorPageSizeSelect.onchange = (e) => {
    elements.editorQueryLimit.value = e.target.value;
    elements.editorQuerySkip.value = 0;
    runEditorQuery();
  };
}

const changePage = (action) => {
  const limit = parseInt(elements.editorQueryLimit.value) || 10;
  let skip = parseInt(elements.editorQuerySkip.value) || 0;
  if (action === 'first') skip = 0;
  else if (action === 'prev') skip = Math.max(0, skip - limit);
  else if (action === 'next') skip += limit;
  else if (action === 'last' && state.editor.total !== undefined) {
    skip = Math.max(0, Math.floor((state.editor.total - 1) / limit) * limit);
  }
  elements.editorQuerySkip.value = skip;
  runEditorQuery();
};

const btnCountDocs = document.querySelector('.editor-status-bar .btn');
if (btnCountDocs) {
  btnCountDocs.onclick = () => {
    if (state.editor.total !== undefined) toast(`Total documents: ${state.editor.total}`, 'info');
    else toast('Run a query first', 'warning');
  };
}

// Initialize delegation handlers
initQueryHandlers();
