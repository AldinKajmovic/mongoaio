import { state, elements } from '../utils/state.js';
import { toast, showLoading, hideLoading } from '../utils/ui.js';
import { escapeHtml, emptyState } from '../utils/dom.js';
import { showAuxPanel } from './editor-views.js';

// ---------------------------------------------------------------------------
// Schema-analysis panel. Samples documents from the current collection and
// reports, per field, how often it appears (presence) and its type
// distribution — the data behind a MongoDB Compass "Schema" tab.
//
// Backend contract: window.api.analyzeSchema(side, db, coll, sampleSize) ->
//   { sampled, totalCount, fields } | { error }
// where each field is:
//   { path, count, presence /* 0-100 */, types: [{ type, count, percent }], samples: [] }
// ---------------------------------------------------------------------------

const SAMPLE_SIZES = [100, 500, 1000, 5000];
const DEFAULT_SAMPLE_SIZE = 1000;

// Maps a backend type label to the CSS modifier class that colors it. Colors
// live in editor-schema.css (CSP: style-src 'self', no inline <style>/colors).
const TYPE_CLASS = {
  string: 'schema-type--string',
  int: 'schema-type--int',
  double: 'schema-type--double',
  long: 'schema-type--long',
  decimal128: 'schema-type--decimal',
  objectId: 'schema-type--objectid',
  date: 'schema-type--date',
  boolean: 'schema-type--boolean',
  array: 'schema-type--array',
  object: 'schema-type--object',
  null: 'schema-type--null',
  undefined: 'schema-type--undefined',
  binData: 'schema-type--bindata',
};

function typeClass(type) {
  return TYPE_CLASS[type] || 'schema-type--other';
}

const FIELDS_PER_PAGE = 25;

let built = false;
let analyzing = false;
// Retained across re-renders so search + pagination don't need a re-query.
let allFields = [];
let filterText = '';
let page = 1;
let sampledCount = 0;
let totalDocCount = 0;

function root() {
  return elements.editorViewSchemaContent;
}

function buildDom() {
  const el = root();
  if (!el) return false;

  el.innerHTML = `
    <div class="schema-panel">
      <div class="schema-toolbar">
        <div class="schema-toolbar-title">
          <span id="schema-coll-label" class="schema-coll-label">No collection selected</span>
        </div>
        <div class="schema-toolbar-controls">
          <input type="text" id="schema-search" class="schema-search-input" placeholder="Filter fields…" spellcheck="false">
          <label class="schema-sample-label" for="schema-sample-size">Sample size</label>
          <select id="schema-sample-size" class="schema-sample-select">
            ${SAMPLE_SIZES.map((n) => `<option value="${n}"${n === DEFAULT_SAMPLE_SIZE ? ' selected' : ''}>${n}</option>`).join('')}
          </select>
          <button id="btn-schema-analyze" class="btn btn-primary btn-sm">Analyze</button>
        </div>
      </div>
      <div id="schema-summary" class="schema-summary u-text-muted"></div>
      <div id="schema-body" class="schema-body"></div>
      <div id="schema-pagination" class="schema-pagination u-hidden"></div>
    </div>
  `;

  const analyzeBtn = document.getElementById('btn-schema-analyze');
  if (analyzeBtn) analyzeBtn.addEventListener('click', () => runAnalysis());

  const search = document.getElementById('schema-search');
  if (search) {
    search.addEventListener('input', (e) => {
      filterText = e.target.value.trim().toLowerCase();
      page = 1;
      renderFields();
    });
  }

  return true;
}

function setSummary(text) {
  const el = document.getElementById('schema-summary');
  if (el) el.textContent = text;
}

function setBody(html) {
  const el = document.getElementById('schema-body');
  if (el) el.innerHTML = html;
}

function updateHeaderLabel() {
  const label = document.getElementById('schema-coll-label');
  if (!label) return;
  const { db, coll } = state.editor;
  label.textContent = (db && coll) ? `${db}.${coll}` : 'No collection selected';
}

function hintNoSelection() {
  setSummary('');
  setBody(emptyState('Select a collection in the sidebar first.'));
}

function getSampleSize() {
  const sel = document.getElementById('schema-sample-size');
  const v = sel ? parseInt(sel.value, 10) : DEFAULT_SAMPLE_SIZE;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_SAMPLE_SIZE;
}

function schemaLoadingHtml() {
  return `
    <div class="schema-loading">
      <div class="spinner"></div>
      <p>Sampling documents…</p>
    </div>`;
}

async function runAnalysis() {
  if (analyzing) return;
  updateHeaderLabel();

  const side = state.editor.side || 'source';
  const db = state.editor.db;
  const coll = state.editor.coll;

  if (!db || !coll) {
    hintNoSelection();
    return;
  }

  const sampleSize = getSampleSize();
  analyzing = true;
  const analyzeBtn = document.getElementById('btn-schema-analyze');
  if (analyzeBtn) analyzeBtn.disabled = true;
  setSummary('Analyzing…');
  setBody(schemaLoadingHtml());
  showLoading('Analyzing schema…');

  try {
    const res = await window.api.analyzeSchema(side, db, coll, sampleSize);
    if (!res || res.error) {
      toast((res && res.error) || 'Schema analysis failed', 'error');
      setSummary('');
      setBody(emptyState('Schema analysis failed.'));
      return;
    }
    renderResult(res);
  } catch (err) {
    toast(`Schema analysis error: ${err.message}`, 'error');
    setSummary('');
    setBody(emptyState('Schema analysis failed.'));
  } finally {
    analyzing = false;
    if (analyzeBtn) analyzeBtn.disabled = false;
    hideLoading();
  }
}

function renderResult(res) {
  const sampled = res.sampled || 0;
  const totalCount = res.totalCount || 0;
  allFields = res.fields || [];
  page = 1;

  if (!sampled || !totalCount || allFields.length === 0) {
    setSummary(`Analyzed ${sampled} of ${totalCount} document${totalCount === 1 ? '' : 's'}`);
    setBody(emptyState('This collection has no documents to analyze.'));
    setPagination('');
    return;
  }

  // Keep the sampled/total context on the label; the count line moves into the
  // summary so it can reflect the active field filter.
  updateHeaderLabel();
  sampledCount = sampled;
  totalDocCount = totalCount;
  renderFields();
}

/** Case-insensitive filter of the retained fields by path. */
function filteredFields() {
  if (!filterText) return allFields;
  return allFields.filter((f) => (f.path || '').toLowerCase().includes(filterText));
}

/** Render the current page of (optionally filtered) fields + pagination. */
function renderFields() {
  const sampled = sampledCount;
  const total = totalDocCount;
  const fields = filteredFields();
  const totalPages = Math.max(1, Math.ceil(fields.length / FIELDS_PER_PAGE));
  if (page > totalPages) page = totalPages;

  const start = (page - 1) * FIELDS_PER_PAGE;
  const pageFields = fields.slice(start, start + FIELDS_PER_PAGE);

  const filterNote = filterText ? ` matching “${filterText}”` : '';
  setSummary(`Analyzed ${sampled} of ${total} documents · ${fields.length} field${fields.length === 1 ? '' : 's'}${filterNote}`);

  if (fields.length === 0) {
    setBody(emptyState(`No fields match “${filterText}”.`));
    setPagination('');
    return;
  }

  const rowsHtml = pageFields.map(renderFieldRow).join('');
  setBody(`
    <div class="schema-fields-header">
      <span class="schema-fields-header-path">FIELD</span>
      <span class="schema-fields-header-presence">PRESENCE</span>
    </div>
    <div class="schema-fields">${rowsHtml}</div>
  `);

  // Widths/indentation are applied programmatically (not via inline style=""
  // in the HTML string) so nothing here ever depends on 'unsafe-inline' CSS.
  document.querySelectorAll('.schema-field-path[data-depth]').forEach((elx) => {
    const depth = parseInt(elx.dataset.depth, 10) || 0;
    if (depth > 0) elx.style.paddingLeft = `${depth * 16}px`;
  });
  document.querySelectorAll('.schema-presence-fill[data-pct]').forEach((elx) => {
    const pct = Math.max(0, Math.min(100, parseFloat(elx.dataset.pct) || 0));
    elx.style.width = `${pct}%`;
  });
  document.querySelectorAll('.schema-type-seg[data-pct]').forEach((elx) => {
    const pct = Math.max(0, Math.min(100, parseFloat(elx.dataset.pct) || 0));
    elx.style.width = `${pct}%`;
  });

  renderPagination(fields.length, totalPages, start, pageFields.length);
}

function setPagination(html) {
  const el = document.getElementById('schema-pagination');
  if (!el) return;
  el.innerHTML = html;
  el.classList.toggle('u-hidden', !html);
}

function renderPagination(totalFields, totalPages, start, shown) {
  const el = document.getElementById('schema-pagination');
  if (!el) return;
  if (totalPages <= 1) { setPagination(''); return; }

  setPagination(`
    <button class="btn btn-ghost btn-sm" id="schema-page-prev" ${page <= 1 ? 'disabled' : ''}>&#8249; Prev</button>
    <span class="schema-page-info">Fields ${start + 1}–${start + shown} of ${totalFields} · page ${page}/${totalPages}</span>
    <button class="btn btn-ghost btn-sm" id="schema-page-next" ${page >= totalPages ? 'disabled' : ''}>Next &#8250;</button>
  `);

  const prev = document.getElementById('schema-page-prev');
  const next = document.getElementById('schema-page-next');
  if (prev) prev.addEventListener('click', () => { if (page > 1) { page--; renderFields(); } });
  if (next) next.addEventListener('click', () => { if (page < totalPages) { page++; renderFields(); } });
}

function renderFieldRow(field) {
  const path = field.path || '';
  const presence = Math.max(0, Math.min(100, Math.round(field.presence || 0)));
  const types = Array.isArray(field.types) ? field.types : [];
  const samples = Array.isArray(field.samples) ? field.samples : [];
  const optional = presence < 100;

  const segments = path.split('.');
  const depth = segments.length - 1;
  const leaf = segments[segments.length - 1];
  const parentPrefix = depth > 0 ? segments.slice(0, -1).join('.') + '.' : '';

  const typeSegs = types.map((t) =>
    `<span class="schema-type-seg ${typeClass(t.type)}" data-pct="${t.percent}" title="${escapeHtml(String(t.type))} — ${t.percent}%"></span>`
  ).join('');

  const typeChips = types.map((t) =>
    `<span class="schema-type-chip ${typeClass(t.type)}">
       <span class="schema-type-dot"></span>${escapeHtml(String(t.type))}
       <span class="schema-type-pct">${t.percent}%</span>
     </span>`
  ).join('');

  const samplesHtml = samples.length
    ? `<div class="schema-samples">${samples.map((s) => `<code class="schema-sample-val" title="${escapeHtml(String(s))}">${escapeHtml(String(s))}</code>`).join('')}</div>`
    : '';

  return `
    <div class="schema-field-row">
      <div class="schema-field-main">
        <span class="schema-field-path" data-depth="${depth}">${parentPrefix ? `<span class="schema-field-parent">${escapeHtml(parentPrefix)}</span>` : ''}<span class="schema-field-leaf">${escapeHtml(leaf)}</span></span>
        <div class="schema-presence" title="${presence}% of sampled documents contain this field">
          <div class="schema-presence-track">
            <div class="schema-presence-fill${optional ? ' schema-presence-fill--optional' : ''}" data-pct="${presence}"></div>
          </div>
          <span class="schema-presence-label">${presence}%</span>
          ${optional ? '<span class="schema-optional-badge">optional</span>' : ''}
        </div>
      </div>
      <div class="schema-type-bar">${typeSegs}</div>
      <div class="schema-type-chips">${typeChips}</div>
      ${samplesHtml}
    </div>
  `;
}

/** Wire the Schema nav button: lazily build the panel, show it, analyze. */
export function initSchemaView() {
  if (!elements.btnEditorViewSchema) return;

  elements.btnEditorViewSchema.addEventListener('click', () => {
    if (!built) built = buildDom();
    showAuxPanel('schema');
    updateHeaderLabel();

    const { db, coll } = state.editor;
    if (!db || !coll) {
      hintNoSelection();
      return;
    }
    runAnalysis();
  });
}
