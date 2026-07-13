import { state, elements } from '../utils/state.js';
import { toast, showLoading, hideLoading } from '../utils/ui.js';
import { parseRelaxedJSON, escapeHtml } from '../utils/dom.js';

// ---------------------------------------------------------------------------
// Explain-plan overlay. Reads the current query bar (#editor-query-*), runs
// window.api.explainQuery(), and renders a summary card + raw plan into the
// #editor-explain-panel overlay that lives inside the collections view.
// ---------------------------------------------------------------------------

const HIGH_EXAMINE_RATIO = 10;

let lastVerbosity = 'executionStats';

function readQueryBar() {
  const filterRaw = elements.editorQueryFilter ? elements.editorQueryFilter.value.trim() : '{}';
  const sortRaw = elements.editorQuerySort ? elements.editorQuerySort.value.trim() : '{}';
  const projectionRaw = elements.editorQueryProjection ? elements.editorQueryProjection.value.trim() : '{}';
  const limitRaw = elements.editorQueryLimit ? elements.editorQueryLimit.value.trim() : '10';
  const skipRaw = elements.editorQuerySkip ? elements.editorQuerySkip.value.trim() : '0';

  const filter = parseRelaxedJSON(filterRaw || '{}');
  const sort = parseRelaxedJSON(sortRaw || '{}');
  const projection = parseRelaxedJSON(projectionRaw || '{}');
  const limit = parseInt(limitRaw, 10) || 10;
  const skip = parseInt(skipRaw, 10) || 0;

  return { filter, sort, projection, limit, skip };
}

function stagesHtml(stages) {
  if (!stages || stages.length === 0) return '<span class="u-text-muted">—</span>';
  return stages.map((s) => `<span class="explain-stage">${escapeHtml(s)}</span>`).join('<span class="explain-stage-arrow">&rarr;</span>');
}

function statTile(label, value) {
  return `
    <div class="explain-stat-tile">
      <span class="explain-stat-label">${escapeHtml(label)}</span>
      <span class="explain-stat-value">${value === undefined || value === null ? '—' : escapeHtml(String(value))}</span>
    </div>`;
}

function renderSummary(summary) {
  const usedIndex = !!summary.usedIndex && !summary.isCollScan;

  const indexBanner = usedIndex
    ? `<div class="explain-banner explain-banner-good">
         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
         <span>Index used: <strong>${escapeHtml(summary.indexName || 'unknown')}</strong></span>
       </div>`
    : `<div class="explain-banner explain-banner-bad">
         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
         <span>Collection scan &mdash; no index used</span>
       </div>`;

  const ratio = summary.examineRatio;
  const ratioHigh = typeof ratio === 'number' && ratio > HIGH_EXAMINE_RATIO;
  const ratioTileClass = ratioHigh ? 'explain-stat-tile explain-stat-warn' : 'explain-stat-tile';
  const ratioTile = `
    <div class="${ratioTileClass}">
      <span class="explain-stat-label">Docs examined / returned</span>
      <span class="explain-stat-value">${ratio === null || ratio === undefined ? '—' : escapeHtml(String(ratio))}</span>
    </div>`;

  return `
    ${indexBanner}
    <div class="explain-namespace">${escapeHtml(summary.namespace || '')}</div>
    <div class="explain-stage-chain">
      <span class="explain-stage-chain-label">Stages:</span>
      ${stagesHtml(summary.stages)}
    </div>
    <div class="explain-stats-grid">
      ${statTile('Returned', summary.nReturned)}
      ${statTile('Docs examined', summary.docsExamined)}
      ${statTile('Keys examined', summary.keysExamined)}
      ${statTile('Execution time (ms)', summary.executionTimeMillis)}
      ${ratioTile}
    </div>
  `;
}

function panelHtml() {
  return `
    <div class="explain-overlay-inner">
      <div class="explain-header">
        <h3 class="explain-title">Explain Plan</h3>
        <div class="explain-header-actions">
          <select id="explain-verbosity" class="explain-verbosity-select">
            <option value="queryPlanner">queryPlanner</option>
            <option value="executionStats" selected>executionStats</option>
            <option value="allPlansExecution">allPlansExecution</option>
          </select>
          <button id="btn-explain-rerun" class="btn btn-ghost btn-sm">Re-run</button>
          <button id="btn-explain-close" class="btn btn-ghost btn-icon btn-sm" title="Close">&times;</button>
        </div>
      </div>
      <div id="explain-body" class="explain-body">
        <div class="explain-empty u-text-muted">Running explain…</div>
      </div>
    </div>
  `;
}

function renderBody(result) {
  const body = document.getElementById('explain-body');
  if (!body) return;

  if (!result) {
    body.innerHTML = '<div class="explain-empty u-text-muted">No result.</div>';
    return;
  }

  const { summary, raw } = result;
  body.innerHTML = `
    <div class="explain-summary">${renderSummary(summary)}</div>
    <details class="explain-raw-details">
      <summary class="explain-raw-summary">Raw plan</summary>
      <pre id="explain-raw-pre" class="explain-raw-pre"></pre>
    </details>
  `;

  const pre = document.getElementById('explain-raw-pre');
  if (pre) pre.textContent = JSON.stringify(raw, null, 2);
}

async function runExplain(verbosity) {
  const side = state.editor.side || 'source';
  const db = state.editor.db;
  const coll = state.editor.coll;

  const panel = elements.editorExplainPanel;
  if (!panel) return;

  panel.innerHTML = panelHtml();
  wirePanelControls();

  const select = document.getElementById('explain-verbosity');
  if (select) select.value = verbosity;

  if (!db || !coll) {
    const body = document.getElementById('explain-body');
    if (body) body.innerHTML = '<div class="explain-empty u-text-muted">Select a collection in the sidebar first.</div>';
    return;
  }

  let queryOpts;
  try {
    queryOpts = readQueryBar();
  } catch (err) {
    toast(`Invalid query: ${err.message}`, 'error');
    const body = document.getElementById('explain-body');
    if (body) body.innerHTML = `<div class="explain-empty u-text-muted">Invalid query: ${escapeHtml(err.message)}</div>`;
    return;
  }

  showLoading('Running explain...');
  try {
    const res = await window.api.explainQuery(side, db, coll, queryOpts, verbosity);
    if (res && res.error) {
      toast(res.error, 'error');
      const body = document.getElementById('explain-body');
      if (body) body.innerHTML = `<div class="explain-empty u-text-muted">Error: ${escapeHtml(res.error)}</div>`;
      return;
    }
    renderBody(res);
  } catch (err) {
    toast(err.message, 'error');
    const body = document.getElementById('explain-body');
    if (body) body.innerHTML = `<div class="explain-empty u-text-muted">Error: ${escapeHtml(err.message)}</div>`;
  } finally {
    hideLoading();
  }
}

function closePanel() {
  const panel = elements.editorExplainPanel;
  if (panel) panel.classList.add('u-hidden');
}

function wirePanelControls() {
  const closeBtn = document.getElementById('btn-explain-close');
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  const rerunBtn = document.getElementById('btn-explain-rerun');
  if (rerunBtn) rerunBtn.addEventListener('click', () => {
    const select = document.getElementById('explain-verbosity');
    lastVerbosity = select ? select.value : lastVerbosity;
    runExplain(lastVerbosity);
  });

  const select = document.getElementById('explain-verbosity');
  if (select) select.addEventListener('change', () => {
    lastVerbosity = select.value;
    runExplain(lastVerbosity);
  });
}

export function initExplain() {
  if (elements.btnEditorExplain) {
    elements.btnEditorExplain.addEventListener('click', () => {
      const panel = elements.editorExplainPanel;
      if (panel) panel.classList.remove('u-hidden');
      runExplain(lastVerbosity);
    });
  }
}
