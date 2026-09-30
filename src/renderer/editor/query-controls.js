/* =============================================
   Editor — Query Toolbar, Sorting & Pagination
   ============================================= */

import { state, elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import { parseRelaxedJSON } from '../utils/dom.js';
import { openInsertDocModal } from '../modals/insert-doc.js';
import { runEditorQuery } from './query.js';
import { bindTimeoutSelect } from '../utils/query-timeout.js';

bindTimeoutSelect(document.getElementById('editor-query-timeout-select'));

[elements.editorQueryFilter, elements.editorQuerySort, elements.editorQueryProjection, elements.editorQueryLimit, elements.editorQuerySkip].forEach(el => {
  if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') runEditorQuery(); });
});

if (elements.btnEditorRunQuery) {
  elements.btnEditorRunQuery.addEventListener('click', () => { elements.editorQuerySkip.value = 0; runEditorQuery(); });
}

if (elements.btnEditorFirst) elements.btnEditorFirst.onclick = () => changePage('first');
if (elements.btnEditorPrev) elements.btnEditorPrev.onclick = () => changePage('prev');
if (elements.btnEditorNext) elements.btnEditorNext.onclick = () => changePage('next');
if (elements.btnEditorLast) elements.btnEditorLast.onclick = () => changePage('last');
if (elements.btnEditorRefresh) elements.btnEditorRefresh.onclick = () => runEditorQuery();
if (elements.btnEditorAddDoc) elements.btnEditorAddDoc.onclick = () => {
  if (!state.editor.db || !state.editor.coll) {
    toast('Please select a collection from the tree first', 'warning');
    return;
  }
  openInsertDocModal();
};

/**
 * Point the sort field(s) in the desired direction and re-run the query.
 * Uses the field(s) already in the sort box, else the selected field, else _id.
 * @param {1|-1} direction
 */
const applySortDirection = (direction) => {
  let sort = {};
  try { sort = parseRelaxedJSON(elements.editorQuerySort.value.trim() || '{}'); } catch (_) { sort = {}; }

  const keys = Object.keys(sort);
  if (keys.length > 0) {
    for (const k of keys) sort[k] = direction;
  } else if (state.editor.selectedField?.key) {
    sort = { [state.editor.selectedField.key]: direction };
  } else {
    sort = { _id: direction };
  }

  elements.editorQuerySort.value = JSON.stringify(sort);
  elements.editorQuerySkip.value = 0;
  runEditorQuery();
};

if (elements.btnEditorSortAsc) elements.btnEditorSortAsc.onclick = () => applySortDirection(1);
if (elements.btnEditorSortDesc) elements.btnEditorSortDesc.onclick = () => applySortDirection(-1);

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

const btnCountDocs = /** @type {HTMLButtonElement | null} */ (document.querySelector('.editor-status-bar .btn'));
if (btnCountDocs) {
  btnCountDocs.onclick = () => {
    if (state.editor.total !== undefined) toast(`Total documents: ${state.editor.total}`, 'info');
    else toast('Run a query first', 'warning');
  };
}

