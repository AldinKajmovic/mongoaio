import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast, confirmToast } from '../utils/ui.js';
import { parseRelaxedJSON } from '../utils/dom.js';
import { openModal } from '../modals/base.js';
import { setEditorLocalResults } from './search.js';
import { renderJsonView, renderTreeView, renderTableView } from './query-renderer.js';
import { initQueryHandlers } from './query-handlers.js';
import { clearValueStore } from './value-store.js';
import { hideValueViewer } from './value-viewer.js';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../utils/constants.js';
import { hasPending, pendingCount } from './pending-edits.js';
import { runCancellable, describeQueryError } from '../utils/query-timeout.js';

/**
 * Ask pending-commit.js to drop every staged edit. Sent as an event rather than
 * imported, so query.js stays free of a query → commit → query import cycle.
 * @param {boolean} silent - skip the "discarded" toast
 */
function discardPendingEdits(silent) {
  document.dispatchEvent(new CustomEvent('editor-discard-pending', { detail: { silent } }));
}

/**
 * A re-render rebuilds the tree from scratch, which would silently throw away
 * staged edits. Confirm first, and re-enter once the store is clear.
 * @param {() => void} retry
 * @returns {boolean} true when the caller must stop and wait for the answer
 */
function blockedByPendingEdits(retry) {
  if (!hasPending()) return false;
  const count = pendingCount();
  confirmToast(
    `${count} unsaved change${count === 1 ? '' : 's'} will be lost. Continue?`,
    () => { discardPendingEdits(true); retry(); }
  );
  return true;
}

/**
 * Snap a typed page size to the nearest allowed one. An unbounded limit makes
 * every search keystroke re-render that many documents.
 * @param {number} value
 * @returns {number}
 */
function clampPageSize(value) {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PAGE_SIZE;
  return PAGE_SIZES.reduce((best, size) =>
    Math.abs(size - value) < Math.abs(best - value) ? size : best, PAGE_SIZES[0]);
}

export let currentRenderedItems = [];
export let currentEJSONItems = [];
export const expandedDocs = new Set();

/** The _id to send with a write for a rendered document. */
export function writeIdFor(index) {
  const ejson = currentEJSONItems[index];
  return ejson && ejson._id !== undefined ? ejson._id : currentRenderedItems[index]?._id;
}

/**
 * Run the current editor query
 */
export async function runEditorQuery() {
  if (blockedByPendingEdits(runEditorQuery)) return;
  if (!state.editor.db || !state.editor.coll) {
    toast('Please select a collection from the tree first', 'warning');
    return;
  }

  const filterStr = elements.editorQueryFilter.value.trim() || '{}';
  const sortStr = elements.editorQuerySort.value.trim() || '{}';
  const projStr = elements.editorQueryProjection.value.trim() || '{}';
  const limit = clampPageSize(parseInt(elements.editorQueryLimit.value, 10));
  if (String(limit) !== elements.editorQueryLimit.value.trim()) {
    elements.editorQueryLimit.value = String(limit);
  }
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

  const startTime = Date.now();
  try {
    const result = await runCancellable('Running query...', (opOpts) => window.api.executeQuery(
      state.editor.side, state.editor.db, state.editor.coll,
      { filter, sort, projection, limit, skip, ...opOpts }
    ));
    const duration = (Date.now() - startTime) / 1000;
    const timeEl = document.querySelector('.editor-status-time');
    if (timeEl) timeEl.textContent = duration.toFixed(3) + 's';
    if (result.error) {
      const message = describeQueryError(result.error);
      toast(message ? `Query error: ${message}` : 'Query cancelled', message ? 'error' : 'info');
      return;
    }
    renderEditorResults(result);
    document.dispatchEvent(new CustomEvent('editor-query-ran'));
  } catch (err) {
    toast(`System error: ${err.message}`, 'error');
  }
}

/**
 * Render query results into the UI
 */
/**
 * Forget expansion state for documents that are no longer on the page, so the
 * set doesn't grow for the whole session as the user pages through results.
 * @param {object[]} items
 */
function pruneExpandedDocs(items) {
  if (expandedDocs.size === 0) return;
  const present = new Set(items.map(doc => String(doc._id)));
  for (const id of expandedDocs) {
    if (!present.has(id)) expandedDocs.delete(id);
  }
}

export function renderEditorResults(result, skipSync = false) {
  currentRenderedItems = result.items;
  hideValueViewer();
  clearValueStore();
  if (result.itemsEJSON) currentEJSONItems = result.itemsEJSON;

  if (!skipSync) {
    pruneExpandedDocs(result.items);
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

  staleViews = new Set(['tree', 'json', 'table']);
  renderDataView(state.editor.dataView);
}

let staleViews = new Set();

/**
 * Flag result panels that no longer match the in-memory documents, so they
 * re-render the next time the user switches to them.
 * @param {string[]} views
 */
export function markViewsStale(views) {
  views.forEach(view => staleViews.add(view));
}

/** Render one results panel, whatever its current staleness. */
function renderDataView(view) {
  const sq = (/** @type {HTMLInputElement | null} */ (document.getElementById('editor-search-input')))?.value.toLowerCase() || '';
  staleViews.delete(view);

  if (view === 'json') {
    renderJsonView(currentEJSONItems.length ? currentEJSONItems : currentRenderedItems, sq);
  } else if (view === 'table') {
    renderTableView(currentRenderedItems, sq, state.editor.skip);
  } else {
    renderTreeView(currentRenderedItems, sq, expandedDocs);
    // Staged edits live in a store, not in the documents — let the pending
    // modules put their marks back on the freshly rendered rows.
    document.dispatchEvent(new CustomEvent('editor-tree-rendered'));
  }
}

/**
 * Bring the visible panel up to date when the user switches views (the switch
 * is announced by editor-layout.js). A no-op when that panel is already current.
 */
function renderActiveDataView() {
  const view = state.editor.dataView;
  if (!staleViews.has(view)) return;
  renderDataView(view);
}

document.addEventListener('editor-data-view-changed', renderActiveDataView);

/**
 * Open a document for full editing in a modal
 */
export function openEditorEditModal(index) {
  // Edit the Extended JSON form so types stay visible and round-trip exactly.
  const doc = currentEJSONItems[index] || currentRenderedItems[index];
  if (!doc) return;
  openModal('Edit Document', JSON.stringify(doc, null, 2), async (json) => {
    let updatedDoc;
    try { updatedDoc = JSON.parse(json); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
    if (JSON.stringify(updatedDoc._id) !== JSON.stringify(doc._id)) throw new Error('Changing _id is not allowed.');
    showLoading('Updating document...');
    const result = await window.api.updateDocument(state.editor.side, state.editor.db, state.editor.coll, writeIdFor(index), updatedDoc);
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
  // The rows these edits belong to are about to disappear; say so rather than
  // dropping them silently.
  if (hasPending()) {
    toast(`${pendingCount()} unsaved change(s) discarded`, 'warning');
    discardPendingEdits(true);
  }
  currentRenderedItems = [];
  currentEJSONItems = [];
  expandedDocs.clear();
  hideValueViewer();
  clearValueStore();
  staleViews = new Set();

  if (elements.editorQueryFilter) elements.editorQueryFilter.value = '{}';
  if (elements.editorQuerySort) elements.editorQuerySort.value = '{}';
  if (elements.editorQueryProjection) elements.editorQueryProjection.value = '{}';
  if (elements.editorQueryLimit) elements.editorQueryLimit.value = '10';
  if (elements.editorQuerySkip) elements.editorQuerySkip.value = '0';
  if (elements.editorPageSizeSelect) elements.editorPageSizeSelect.value = '10';

  const treeRows = document.getElementById('editor-tree-rows');
  if (treeRows) treeRows.innerHTML = '';
  const jsonPanel = document.getElementById('editor-data-json');
  if (jsonPanel) { const pre = jsonPanel.querySelector('pre'); if (pre) pre.textContent = '[]'; }
  const tableHead = document.getElementById('editor-table-head');
  if (tableHead) tableHead.innerHTML = '<th class="editor-table-th">#</th>';
  const tableBody = document.getElementById('editor-table-body');
  if (tableBody) tableBody.innerHTML = '';

  if (elements.editorPaginationInfo) elements.editorPaginationInfo.textContent = 'Documents 0 to 0';
  if (elements.btnEditorPrev) elements.btnEditorPrev.disabled = true;
  if (elements.btnEditorFirst) elements.btnEditorFirst.disabled = true;
  if (elements.btnEditorNext) elements.btnEditorNext.disabled = true;
  if (elements.btnEditorLast) elements.btnEditorLast.disabled = true;

  const statusInfo = document.querySelector('.editor-status-info');
  if (statusInfo) statusInfo.textContent = '0 items selected';
  const timeEl = document.querySelector('.editor-status-time');
  if (timeEl) timeEl.textContent = '0.000s';

  state.editor.total = undefined;
}

initQueryHandlers();
