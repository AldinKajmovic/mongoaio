import { elements } from '../utils/state.js';
import { escapeHtml } from '../utils/dom.js';
import { formatDocJson } from './query-renderer.js';
import { OPERATORS, parseStageBody, stageSignature } from './aggregation-operators.js';

// View layer for the aggregation builder: DOM helpers, the panel scaffold, the
// per-stage card and the inline preview surface. Stateless — callers pass the
// stage model plus a handlers object; nothing here reaches back into the
// coordinator's `stages`/`limit` state directly.

// --- Small DOM helpers ------------------------------------------------------

export function el(tag, className, props) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (props) Object.assign(node, props);
  return node;
}

function icon(paths) {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export const ICONS = {
  up: icon('<polyline points="18 15 12 9 6 15"></polyline>'),
  down: icon('<polyline points="6 9 12 15 18 9"></polyline>'),
  dup: icon('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
  del: icon('<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>'),
  play: icon('<polygon points="5 3 19 12 5 21 5 3"></polygon>'),
  close: icon('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="12"></line>'),
};

// --- Panel scaffold ---------------------------------------------------------

// Build the aggregation panel shell and wire toolbar handlers. `h` supplies
// { onAdd, onRun, onCopy, onLimitChange } plus the initial `limit`. Returns
// true when the DOM was built, false when the host element is missing.
export function buildDom(h) {
  const root = elements.editorViewAggregationContent;
  if (!root) return false;
  root.innerHTML = `
    <div class="agg-builder">
      <div class="agg-toolbar">
        <button class="btn btn-primary btn-sm" id="agg-run" title="Run the full pipeline (Ctrl+Enter)">
          ${ICONS.play}<span>Run pipeline</span>
        </button>
        <button class="btn btn-ghost btn-sm" id="agg-add">+ Add stage</button>
        <button class="btn btn-ghost btn-sm" id="agg-copy" title="Copy the assembled pipeline as JSON">Copy pipeline</button>
        <span class="agg-toolbar-spacer"></span>
        <span class="agg-context" id="agg-context"></span>
        <label class="agg-limit-label">Limit
          <select class="agg-limit-select" id="agg-limit">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </div>
      <div class="agg-body" id="agg-body">
        <div class="agg-stages" id="agg-stages"></div>
      </div>
    </div>
  `;

  root.querySelector('#agg-add').addEventListener('click', h.onAdd);
  root.querySelector('#agg-run').addEventListener('click', h.onRun);
  root.querySelector('#agg-copy').addEventListener('click', h.onCopy);

  const limitSel = root.querySelector('#agg-limit');
  limitSel.value = String(h.limit);
  limitSel.addEventListener('change', () => h.onLimitChange(parseInt(limitSel.value, 10) || 25));

  return true;
}

// --- One stage card ---------------------------------------------------------

// Build a stage card. `count` is the current stage count (for move-button
// gating). `h` supplies the callbacks: onOperatorChange(stage, op), onToggle,
// onMoveUp, onMoveDown, onDuplicate, onDelete, onPreview — each receiving the
// stage.
export function buildStageCard(stage, index, count, h) {
  const card = el('div', 'agg-stage' + (stage.enabled ? '' : ' agg-stage-disabled'));
  card.dataset.id = String(stage.id);

  // Header row: number, operator select, controls.
  const header = el('div', 'agg-stage-header');

  const num = el('span', 'agg-stage-num', { textContent: String(index + 1) });

  const select = el('select', 'agg-stage-op');
  OPERATORS.forEach((o) => {
    const opt = el('option', null, { value: o.op, textContent: o.op });
    if (o.op === stage.operator) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => h.onOperatorChange(stage, select.value));

  const controls = el('div', 'agg-stage-controls');

  const toggle = el('button', 'agg-ctl' + (stage.enabled ? ' agg-ctl-on' : ''), {
    type: 'button',
    title: stage.enabled ? 'Disable stage' : 'Enable stage',
    innerHTML: `<span class="agg-toggle-dot"></span>`,
  });
  toggle.addEventListener('click', () => h.onToggle(stage));

  const upBtn = el('button', 'agg-ctl', { type: 'button', title: 'Move up', innerHTML: ICONS.up });
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => h.onMoveUp(stage));

  const downBtn = el('button', 'agg-ctl', { type: 'button', title: 'Move down', innerHTML: ICONS.down });
  downBtn.disabled = index === count - 1;
  downBtn.addEventListener('click', () => h.onMoveDown(stage));

  const dupBtn = el('button', 'agg-ctl', { type: 'button', title: 'Duplicate', innerHTML: ICONS.dup });
  dupBtn.addEventListener('click', () => h.onDuplicate(stage));

  const delBtn = el('button', 'agg-ctl agg-ctl-danger', { type: 'button', title: 'Delete', innerHTML: ICONS.del });
  delBtn.addEventListener('click', () => h.onDelete(stage));

  controls.append(toggle, upBtn, downBtn, dupBtn, delBtn);
  header.append(num, select, controls);

  // Body: textarea + parse-error line.
  const bodyWrap = el('div', 'agg-stage-body');
  const textarea = el('textarea', 'agg-stage-textarea', {
    spellcheck: false,
    value: stage.body,
    rows: 4,
  });
  textarea.addEventListener('input', () => {
    stage.body = textarea.value;
    validateStageInline(stage);
    markStale(stage);
  });
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      h.onPreview(stage);
    }
  });

  const errorLine = el('div', 'agg-stage-error u-hidden');

  const previewBtn = el('button', 'btn btn-ghost btn-xs agg-preview-btn', {
    type: 'button',
    innerHTML: `${ICONS.play}<span>Preview</span>`,
    title: 'Run the pipeline up to and including this stage',
  });
  previewBtn.addEventListener('click', () => {
    const panel = stage.els && stage.els.preview;
    // If we already have a fresh (non-stale) preview rendered, just toggle its
    // visibility instead of re-querying — so "hide" is reversible without a run.
    if (panel && panel.childElementCount > 0 && !isStale(stage)) {
      const hidden = panel.classList.toggle('u-hidden');
      stage.open = !hidden;
      return;
    }
    h.onPreview(stage);
  });

  const actions = el('div', 'agg-stage-actions');
  actions.appendChild(previewBtn);

  bodyWrap.append(textarea, errorLine, actions);

  // Preview panel (inline results for this stage's slice of the pipeline).
  // Cards are rebuilt on structural edits, which discards any rendered preview
  // content, so start collapsed rather than showing an empty open panel.
  stage.open = false;
  stage.lastBody = null;
  const preview = el('div', 'agg-preview u-hidden');

  card.append(header, bodyWrap, preview);

  stage.els = { card, select, textarea, errorLine, preview, toggle, previewBtn };
  validateStageInline(stage);
  return card;
}

// --- Inline validation + staleness -----------------------------------------

export function validateStageInline(stage) {
  if (!stage.els) return;
  const { errorLine, textarea } = stage.els;
  try {
    parseStageBody(stage);
    errorLine.classList.add('u-hidden');
    errorLine.textContent = '';
    textarea.classList.remove('agg-textarea-error');
  } catch (e) {
    errorLine.textContent = e.message;
    errorLine.classList.remove('u-hidden');
    textarea.classList.add('agg-textarea-error');
  }
}

// True when the stage has never been previewed or its body/operator changed
// since the last successful preview (so cached results can't be re-shown as-is).
export function isStale(stage) {
  return stage.lastBody === null || stage.lastBody !== stageSignature(stage);
}

// Flag an already-open preview as out of date after an edit.
export function markStale(stage) {
  if (!stage.els || !stage.open) return;
  if (stage.lastBody !== null && stage.lastBody !== stageSignature(stage)) {
    const note = stage.els.preview.querySelector('.agg-preview-note');
    if (note && !note.querySelector('.agg-stale')) {
      const s = el('span', 'agg-stale', { textContent: ' · edited — click Preview to refresh' });
      note.appendChild(s);
    }
  }
}

// --- Preview rendering ------------------------------------------------------

export function renderPreviewError(panel, message, onClose) {
  panel.innerHTML = `
    <div class="agg-preview-head">
      <span class="agg-preview-title agg-preview-title-error">Error</span>
      <button class="agg-preview-close" type="button" title="Hide preview">${ICONS.close}</button>
    </div>
    <div class="agg-preview-errbox">${escapeHtml(message)}</div>`;
  wirePreviewClose(panel, onClose);
}

export function renderPreviewResult(panel, res, limit, onClose) {
  const items = Array.isArray(res.items) ? res.items : [];

  let note;
  if (res.written) {
    note = 'Pipeline executed — documents written by $out/$merge';
  } else if (items.length === 0) {
    note = 'No documents';
  } else {
    note = `Showing ${items.length} document${items.length === 1 ? '' : 's'}`;
    if (res.truncated) note += ` (truncated — more than ${limit} matched)`;
  }

  let docsHtml;
  if (res.written) {
    docsHtml = `<div class="agg-preview-written">✓ Documents written to the target collection.</div>`;
  } else if (items.length === 0) {
    docsHtml = `<div class="agg-preview-empty">The pipeline returned no documents.</div>`;
  } else {
    docsHtml = items.map((doc, i) => `
      <div class="agg-doc">
        <span class="agg-doc-idx">${i + 1}</span>
        <pre class="agg-doc-pre">${formatDocJson(doc)}</pre>
      </div>`).join('');
  }

  panel.innerHTML = `
    <div class="agg-preview-head">
      <span class="agg-preview-title">Preview</span>
      <span class="agg-preview-note">${escapeHtml(note)}</span>
      <button class="agg-preview-close" type="button" title="Hide preview">${ICONS.close}</button>
    </div>
    <div class="agg-preview-docs">${docsHtml}</div>`;
  wirePreviewClose(panel, onClose);
}

function wirePreviewClose(panel, onClose) {
  const btn = panel.querySelector('.agg-preview-close');
  if (btn) btn.addEventListener('click', () => onClose(panel));
}
