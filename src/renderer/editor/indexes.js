import { state, elements } from '../utils/state.js';
import { toast, showLoading, hideLoading } from '../utils/ui.js';
import { escapeHtml, parseRelaxedJSON } from '../utils/dom.js';
import { showAuxPanel } from './editor-views.js';

// ---------------------------------------------------------------------------
// Index management panel. Lazily builds its DOM into #editor-view-indexes-content
// the first time the "Indexes" nav button is clicked, then lists/creates/drops
// indexes for the current collection (state.editor.{side,db,coll}).
// ---------------------------------------------------------------------------

let built = false;
let rowSeq = 0;

/** One field row in the "create index" form: a field-name input + direction select. */
function fieldRowHtml(id) {
  return `
    <div class="idx-field-row" data-row-id="${id}">
      <input type="text" class="idx-field-name" placeholder="field name" spellcheck="false">
      <select class="idx-field-dir">
        <option value="1">Ascending (1)</option>
        <option value="-1">Descending (-1)</option>
      </select>
      <button type="button" class="btn btn-ghost btn-icon btn-sm idx-field-remove" title="Remove field">&times;</button>
    </div>`;
}

function buildDom() {
  const root = elements.editorViewIndexesContent;
  if (!root) return false;

  root.innerHTML = `
    <div class="idx-panel">
      <div class="idx-toolbar">
        <div class="idx-toolbar-title">
          <span id="idx-coll-label" class="idx-coll-label">–</span>
        </div>
        <button id="btn-idx-refresh" class="btn btn-ghost btn-sm" title="Refresh index list">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Refresh
        </button>
      </div>

      <div class="idx-body">
        <section class="idx-card">
          <h3 class="idx-card-title">Indexes</h3>
          <div class="idx-table-wrap">
            <table class="idx-table">
              <thead>
                <tr>
                  <th>Keys</th>
                  <th>Properties</th>
                  <th>Usage (ops)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="idx-table-body">
                <tr><td colspan="4" class="idx-empty">Select a collection in the sidebar first.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="idx-card">
          <h3 class="idx-card-title">Create index</h3>
          <form id="idx-create-form" class="idx-create-form">
            <div id="idx-field-rows" class="idx-field-rows">
              ${fieldRowHtml(rowSeq++)}
            </div>
            <button type="button" id="btn-idx-add-field" class="btn btn-ghost btn-sm idx-add-field">+ Add field</button>
            <div class="idx-hint">Add more than one field to build a <strong>compound index</strong> — e.g. <code>{ status: 1, polNum: 1 }</code>. Fields apply in the order listed.</div>

            <div class="idx-options-row">
              <label class="idx-option-checkbox"><input type="checkbox" id="idx-opt-unique"> Unique</label>
              <label class="idx-option-checkbox"><input type="checkbox" id="idx-opt-sparse"> Sparse</label>
              <label class="idx-option-inline">TTL (seconds)
                <input type="text" id="idx-opt-ttl" class="idx-option-input" placeholder="e.g. 3600">
              </label>
              <label class="idx-option-inline">Name
                <input type="text" id="idx-opt-name" class="idx-option-input" placeholder="optional">
              </label>
            </div>
            <div class="idx-options-row">
              <label class="idx-option-inline idx-option-inline-grow">Partial filter expression (JSON)
                <input type="text" id="idx-opt-partial" class="idx-option-input" placeholder='e.g. {"age": {"$gt": 18}}'>
              </label>
            </div>

            <div class="idx-form-actions">
              <button type="submit" class="btn btn-primary btn-sm">Create index</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  `;

  const addFieldBtn = document.getElementById('btn-idx-add-field');
  if (addFieldBtn) addFieldBtn.addEventListener('click', () => addFieldRow());

  const fieldRows = document.getElementById('idx-field-rows');
  if (fieldRows) {
    fieldRows.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.idx-field-remove');
      if (!removeBtn) return;
      const rows = fieldRows.querySelectorAll('.idx-field-row');
      if (rows.length <= 1) return; // keep at least one row
      removeBtn.closest('.idx-field-row').remove();
    });
  }

  const refreshBtn = document.getElementById('btn-idx-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadIndexes());

  const tableBody = document.getElementById('idx-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.idx-drop-btn');
      if (!btn || btn.disabled) return;
      const name = btn.dataset.indexName;
      dropIndexByName(name);
    });
  }

  const form = document.getElementById('idx-create-form');
  if (form) form.addEventListener('submit', onCreateSubmit);

  return true;
}

function addFieldRow() {
  const container = document.getElementById('idx-field-rows');
  if (!container) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = fieldRowHtml(rowSeq++);
  container.appendChild(wrap.firstElementChild);
}

function formatKeySpec(key) {
  return Object.entries(key || {})
    .map(([field, dir]) => {
      let dirHtml;
      if (dir === -1 || dir === '-1') dirHtml = '<span class="idx-key-dir" title="descending">↓ -1</span>';
      else if (dir === 1 || dir === '1') dirHtml = '<span class="idx-key-dir" title="ascending">↑ 1</span>';
      else dirHtml = `<span class="idx-key-dir">${escapeHtml(String(dir))}</span>`;
      return `<span class="idx-key"><span class="idx-key-field">${escapeHtml(field)}</span>${dirHtml}</span>`;
    })
    .join('');
}

function propertyBadges(idx) {
  const badges = [];
  if (idx.unique) badges.push('<span class="idx-badge idx-badge-unique">unique</span>');
  if (idx.sparse) badges.push('<span class="idx-badge idx-badge-sparse">sparse</span>');
  if (typeof idx.ttl === 'number') badges.push(`<span class="idx-badge idx-badge-ttl">TTL:${idx.ttl}s</span>`);
  if (idx.partialFilterExpression) badges.push('<span class="idx-badge idx-badge-partial">partial</span>');
  if (idx.isIdIndex) badges.push('<span class="idx-badge idx-badge-id">_id</span>');
  return badges.join(' ') || '<span class="u-text-muted">—</span>';
}

function renderIndexRows(indexes) {
  const tbody = document.getElementById('idx-table-body');
  if (!tbody) return;

  if (!indexes || indexes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="idx-empty">No indexes found.</td></tr>';
    return;
  }

  tbody.innerHTML = indexes.map((idx) => {
    const ops = idx.accesses && typeof idx.accesses.ops === 'number' ? idx.accesses.ops : '—';
    const dropDisabled = idx.isIdIndex ? 'disabled title="The default _id index cannot be dropped"' : '';
    // Index name is kept only as a tooltip on the keys cell (used internally for
    // Drop); the keys themselves identify the index, so no dedicated column.
    return `
      <tr>
        <td class="idx-cell-keys" title="${escapeHtml(idx.name)}">${formatKeySpec(idx.key)}</td>
        <td class="idx-cell-props">${propertyBadges(idx)}</td>
        <td class="idx-cell-usage">${escapeHtml(String(ops))}</td>
        <td class="idx-cell-actions">
          <button class="btn btn-ghost btn-sm idx-drop-btn" data-index-name="${escapeHtml(idx.name)}" ${dropDisabled}>Drop</button>
        </td>
      </tr>`;
  }).join('');
}

async function loadIndexes() {
  const side = state.editor.side || 'source';
  const db = state.editor.db;
  const coll = state.editor.coll;

  const label = document.getElementById('idx-coll-label');
  if (label) label.textContent = (db && coll) ? `${db}.${coll}` : 'No collection selected';

  const tbody = document.getElementById('idx-table-body');
  if (!db || !coll) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="idx-empty">Select a collection in the sidebar first.</td></tr>';
    return;
  }

  if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="idx-empty">Loading indexes…</td></tr>';

  try {
    const res = await window.api.listIndexes(side, db, coll);
    if (res && res.error) {
      toast(res.error, 'error');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="idx-empty">Error: ${escapeHtml(res.error)}</td></tr>`;
      return;
    }
    renderIndexRows(res.indexes || []);
  } catch (err) {
    toast(err.message, 'error');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="idx-empty">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function dropIndexByName(name) {
  const side = state.editor.side || 'source';
  const db = state.editor.db;
  const coll = state.editor.coll;
  if (!db || !coll) return;

  if (!window.confirm(`Drop index "${name}" on ${db}.${coll}? This cannot be undone.`)) return;

  showLoading(`Dropping index ${name}...`);
  try {
    const res = await window.api.dropIndex(side, db, coll, name);
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    toast(`Index "${name}" dropped`, 'success');
    await loadIndexes();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

function readCreateForm() {
  const rows = document.querySelectorAll('#idx-field-rows .idx-field-row');
  const keys = {};
  for (const row of rows) {
    const nameInput = row.querySelector('.idx-field-name');
    const dirSelect = row.querySelector('.idx-field-dir');
    const field = nameInput ? nameInput.value.trim() : '';
    if (!field) continue;
    // A compound index can't list the same field twice; an object key would
    // silently overwrite, so reject it explicitly instead.
    if (Object.prototype.hasOwnProperty.call(keys, field)) {
      throw new Error(`Duplicate field "${field}" — a compound index cannot use the same field twice.`);
    }
    const dir = parseInt(dirSelect.value, 10) === -1 ? -1 : 1;
    keys[field] = dir;
  }

  const options = {};
  const uniqueEl = document.getElementById('idx-opt-unique');
  const sparseEl = document.getElementById('idx-opt-sparse');
  const ttlEl = document.getElementById('idx-opt-ttl');
  const nameEl = document.getElementById('idx-opt-name');
  const partialEl = document.getElementById('idx-opt-partial');

  if (uniqueEl && uniqueEl.checked) options.unique = true;
  if (sparseEl && sparseEl.checked) options.sparse = true;
  if (ttlEl && ttlEl.value.trim() !== '') {
    const n = parseInt(ttlEl.value.trim(), 10);
    if (!Number.isNaN(n)) options.expireAfterSeconds = n;
  }
  if (nameEl && nameEl.value.trim() !== '') options.name = nameEl.value.trim();
  if (partialEl && partialEl.value.trim() !== '') {
    try {
      options.partialFilterExpression = parseRelaxedJSON(partialEl.value.trim());
    } catch (err) {
      throw new Error(`Invalid partial filter expression JSON: ${err.message}`);
    }
  }

  return { keys, options };
}

async function onCreateSubmit(e) {
  e.preventDefault();

  const side = state.editor.side || 'source';
  const db = state.editor.db;
  const coll = state.editor.coll;
  if (!db || !coll) {
    toast('Select a collection in the sidebar first', 'error');
    return;
  }

  let keys, options;
  try {
    ({ keys, options } = readCreateForm());
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  if (Object.keys(keys).length === 0) {
    toast('Add at least one field for the index', 'error');
    return;
  }

  showLoading('Creating index...');
  try {
    const res = await window.api.createIndex(side, db, coll, keys, options);
    if (res && res.error) {
      toast(res.error, 'error');
      return;
    }
    toast(`Index "${res.name}" created`, 'success');
    await loadIndexes();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

export function initIndexesView() {
  if (elements.btnEditorViewIndexes) {
    elements.btnEditorViewIndexes.addEventListener('click', () => {
      if (!built) built = buildDom();
      showAuxPanel('indexes');
      loadIndexes();
    });
  }
}
