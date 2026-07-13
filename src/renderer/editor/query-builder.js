import { elements } from '../utils/state.js';
import { escapeHtml } from '../utils/dom.js';
import { runEditorQuery } from './query.js';
import { openModal } from '../modals/base.js';

let qbItems = []; // Array of { id, field, value, type, op, enabled }
let nextId = 1;

/** Wrap a value as MongoDB Extended JSON ObjectId so the backend revives it. */
const toOid = (v) => ({ $oid: String(v) });

/** Parse a value into an array, accepting an existing array or a JSON string. */
const parseMaybeArray = (v) => (Array.isArray(v) ? v : JSON.parse(v));

/**
 * Add a field to the query builder.
 * @param {string} fieldName
 * @param {any} value
 * @param {string} type
 */
export function addQbField(fieldName, value = "", type = "String") {
  const item = {
    id: nextId++,
    field: fieldName,
    value: value,
    type: type,
    op: "equals",
    enabled: true
  };
  qbItems.push(item);
  renderQbFields();
}

/**
 * Duplicate a query block.
 */
function duplicateItem(id) {
  const item = qbItems.find(it => it.id === id);
  if (!item) return;
  const newItem = { ...item, id: nextId++ };
  qbItems.push(newItem);
  renderQbFields();
}

/**
 * Remove a field from the query builder by id.
 */
function removeQbItem(id) {
  qbItems = qbItems.filter(it => it.id !== id);
  renderQbFields();
}

/** Clear all fields from the query builder. */
function clearQbFields() {
  qbItems = [];
  renderQbFields();
}

/** Render the complex query blocks inside the panel. */
function renderQbFields() {
  const container = document.getElementById('editor-qb-fields');
  if (!container) return;
  container.innerHTML = '';

  if (qbItems.length === 0) {
    return;
  }

  for (const item of qbItems) {
    const block = document.createElement('div');
    block.className = 'editor-qb-block';
    if (!item.enabled) block.classList.add('disabled');

    block.innerHTML = `
      <div class="editor-qb-where-label">Where</div>
      <div class="editor-qb-block-content">
        <div class="editor-qb-block-top">
          <div class="editor-qb-drag-handle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>
          </div>
          <select class="editor-qb-op-select">
            <option value="equals" ${item.op === 'equals' ? 'selected' : ''}>equals</option>
            <option value="not_equals" ${item.op === 'not_equals' ? 'selected' : ''}>doesn't equal</option>
            <option value="contains" ${item.op === 'contains' ? 'selected' : ''}>contains</option>
            <option value="not_contains" ${item.op === 'not_contains' ? 'selected' : ''}>doesn't contain</option>
            <option value="starts_with" ${item.op === 'starts_with' ? 'selected' : ''}>starts with</option>
            <option value="not_starts_with" ${item.op === 'not_starts_with' ? 'selected' : ''}>doesn't start with</option>
            <option value="ends_with" ${item.op === 'ends_with' ? 'selected' : ''}>ends with</option>
            <option value="not_ends_with" ${item.op === 'not_ends_with' ? 'selected' : ''}>doesn't end with</option>
            <option value="is_null" ${item.op === 'is_null' ? 'selected' : ''}>is null</option>
            <option value="is_not_null" ${item.op === 'is_not_null' ? 'selected' : ''}>isn't null</option>
            <option value="exists" ${item.op === 'exists' ? 'selected' : ''}>exists</option>
            <option value="not_exists" ${item.op === 'not_exists' ? 'selected' : ''}>doesn't exist</option>
            <option value="in" ${item.op === 'in' ? 'selected' : ''}>in</option>
            <option value="not_in" ${item.op === 'not_in' ? 'selected' : ''}>not in</option>
            <option value="all" ${item.op === 'all' ? 'selected' : ''}>array contains all</option>
          </select>
          <div class="editor-qb-actions-row">
            <button class="editor-qb-btn-duplicate" title="Duplicate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="editor-qb-btn-remove" title="Remove"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
          </div>
        </div>
        <div class="editor-qb-block-bottom">
          <div class="editor-qb-type-selector-wrap">
            <select class="editor-qb-type-select">
              <option value="Binary" ${item.type === 'Binary' ? 'selected' : ''}>Binary</option>
              <option value="Boolean" ${item.type === 'Boolean' ? 'selected' : ''}>Boolean</option>
              <option value="Date" ${item.type === 'Date' ? 'selected' : ''}>Date</option>
              <option value="Decimal128" ${item.type === 'Decimal128' ? 'selected' : ''}>Decimal128</option>
              <option value="Double" ${item.type === 'Double' ? 'selected' : ''}>Double</option>
              <option value="Int32" ${item.type === 'Int32' ? 'selected' : ''}>Int32</option>
              <option value="Int64" ${item.type === 'Int64' ? 'selected' : ''}>Int64</option>
              <option value="ObjectId" ${item.type === 'ObjectId' ? 'selected' : ''}>ObjectId</option>
              <option value="Reference" ${item.type === 'Reference' ? 'selected' : ''}>Reference</option>
              <option value="Regex" ${item.type === 'Regex' ? 'selected' : ''}>Regex</option>
              <option value="String" ${item.type === 'String' ? 'selected' : ''}>String</option>
              <option value="Symbol" ${item.type === 'Symbol' ? 'selected' : ''}>Symbol</option>
              <option value="Timestamp" ${item.type === 'Timestamp' ? 'selected' : ''}>Timestamp</option>
            </select>
          </div>
          <input type="text" class="editor-qb-value-input" value="${escapeHtml(String(item.value))}" placeholder="Value">
          <button class="editor-qb-btn-more">...</button>
          <input type="checkbox" class="editor-qb-enabled-toggle" ${item.enabled ? 'checked' : ''}>
        </div>
      </div>
    `;

    // Event listeners
    block.querySelector('.editor-qb-type-select').addEventListener('change', (e) => {
      item.type = e.target.value;
    });
    block.querySelector('.editor-qb-op-select').addEventListener('change', (e) => {
      item.op = e.target.value;
    });
    block.querySelector('.editor-qb-value-input').addEventListener('input', (e) => {
      item.value = e.target.value;
    });
    block.querySelector('.editor-qb-enabled-toggle').addEventListener('change', (e) => {
      item.enabled = e.target.checked;
      block.classList.toggle('disabled', !item.enabled);
    });
    block.querySelector('.editor-qb-btn-duplicate').addEventListener('click', () => duplicateItem(item.id));
    block.querySelector('.editor-qb-btn-remove').addEventListener('click', () => removeQbItem(item.id));
    block.querySelector('.editor-qb-btn-more').addEventListener('click', () => {
      openModal(`Edit Value: ${item.field}`, String(item.value), (newValue) => {
        item.value = newValue;
        renderQbFields();
      });
    });

    container.appendChild(block);
  }
}

function getTypeIcon(type) {
  if (type === 'String') return '" "';
  if (type === 'Int32' || type === 'Double') return '123';
  if (type === 'Boolean') return 'T/F';
  if (type === 'ObjectId') return 'ID';
  if (type === 'Date') return '🕒';
  return '{}';
}

/**
 * Build a MongoDB filter object from selected fields and mode,
 * then write it into the query filter input.
 */
function buildAndApplyFilter() {
  const modeEl = document.getElementById('editor-qb-mode');
  const mode = modeEl ? modeEl.value : 'all';

  const activeItems = qbItems.filter(it => it.enabled);
  if (activeItems.length === 0) {
    elements.editorQueryFilter.value = '{}';
    return;
  }

  const fieldConditions = activeItems.map(it => {
    let val = it.value;
    // Basic type conversion
    if (it.type === 'Int32') val = parseInt(val, 10);
    else if (it.type === 'Double') val = parseFloat(val);
    else if (it.type === 'Boolean') val = val === 'true';

    // ObjectId values are emitted as Extended JSON ({$oid}) so the backend
    // matches them as real ObjectIds rather than strings.
    const isOid = it.type === 'ObjectId';
    const eq = (v) => (isOid ? toOid(v) : v);
    const eqArray = (v) => {
      const arr = parseMaybeArray(v);
      return isOid ? arr.map(toOid) : arr;
    };

    let cond;
    const key = it.field;

    // Mapping operators to MongoDB query syntax
    switch (it.op) {
      case 'equals': cond = { [key]: eq(val) }; break;
      case 'not_equals': cond = { [key]: { $ne: eq(val) } }; break;
      case 'contains': cond = { [key]: { $regex: val, $options: 'i' } }; break;
      case 'not_contains': cond = { [key]: { $not: { $regex: val, $options: 'i' } } }; break;
      case 'starts_with': cond = { [key]: { $regex: '^' + val, $options: 'i' } }; break;
      case 'not_starts_with': cond = { [key]: { $not: { $regex: '^' + val, $options: 'i' } } }; break;
      case 'ends_with': cond = { [key]: { $regex: val + '$', $options: 'i' } }; break;
      case 'not_ends_with': cond = { [key]: { $not: { $regex: val + '$', $options: 'i' } } }; break;
      case 'is_null': cond = { [key]: null }; break;
      case 'is_not_null': cond = { [key]: { $ne: null } }; break;
      case 'exists': cond = { [key]: { $exists: true } }; break;
      case 'not_exists': cond = { [key]: { $exists: false } }; break;
      case 'in':
        try { cond = { [key]: { $in: eqArray(val) } }; }
        catch { cond = { [key]: { $in: [eq(val)] } }; }
        break;
      case 'not_in':
        try { cond = { [key]: { $nin: eqArray(val) } }; }
        catch { cond = { [key]: { $nin: [eq(val)] } }; }
        break;
      case 'all':
        try { cond = { [key]: { $all: eqArray(val) } }; }
        catch { cond = { [key]: { $all: [eq(val)] } }; }
        break;
      default: cond = { [key]: eq(val) };
    }

    return cond;
  });

  // Wrap a single field condition (`{ field: inner }`) so it matches an array
  // element via $elemMatch. A scalar `inner` (e.g. from "equals") is promoted to
  // `{ $eq: inner }` because $elemMatch requires a query object. ObjectId markers
  // ({$oid}) count as scalar values, not query objects.
  const toElemMatch = (cond, negate) => {
    const key = Object.keys(cond)[0];
    const inner = cond[key];
    const isQueryObj = inner !== null && typeof inner === 'object'
      && !Array.isArray(inner) && !('$oid' in inner);
    const em = { $elemMatch: isQueryObj ? inner : { $eq: inner } };
    return { [key]: negate ? { $not: em } : em };
  };

  let filter;
  if (mode === 'all') {
    filter = fieldConditions.length === 1 ? fieldConditions[0] : { $and: fieldConditions };
  } else if (mode === 'any') {
    filter = { $or: fieldConditions };
  } else if (mode === 'nor') {
    filter = { $nor: fieldConditions };
  } else if (mode === 'elemMatch' || mode === 'notElemMatch') {
    const negate = mode === 'notElemMatch';
    const conds = fieldConditions.map((c) => toElemMatch(c, negate));
    filter = conds.length === 1 ? conds[0] : { $and: conds };
  }

  // Never emit `undefined` for an unrecognised mode — fall back to match-all.
  if (!filter) filter = {};

  elements.editorQueryFilter.value = JSON.stringify(filter);
}

/** Initialise query builder event listeners. */
export function initQueryBuilder() {
  const dropzone = document.getElementById('editor-qb-dropzone');
  const btnClear = document.getElementById('btn-qb-clear');
  const btnRun = document.getElementById('btn-qb-run');

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      
      const json = e.dataTransfer.getData('application/json');
      if (json) {
        const payload = JSON.parse(json);
        addQbField(payload.field, payload.value, payload.type);
      } else {
        const fieldName = e.dataTransfer.getData('text/plain');
        if (fieldName) addQbField(fieldName);
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      clearQbFields();
      elements.editorQueryFilter.value = '{}';
    });
  }

  if (btnRun) {
    btnRun.addEventListener('click', () => {
      buildAndApplyFilter();
      elements.editorQuerySkip.value = 0;
      runEditorQuery();
    });
  }
}
