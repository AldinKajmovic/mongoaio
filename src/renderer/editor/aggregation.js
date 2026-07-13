import { state, elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import { prettyJson } from '../utils/dom.js';
import { showAuxPanel } from './editor-views.js';
import { TEMPLATES, TEMPLATE_SET, stageSignature, assemble } from './aggregation-operators.js';
import {
  buildDom,
  buildStageCard,
  validateStageInline,
  markStale,
  renderPreviewError,
  renderPreviewResult,
} from './aggregation-dom.js';

// Coordinator for the aggregation builder. Owns the mutable stage list and
// runtime state, drives structural (re)renders, and orchestrates preview/run
// against the backend. Pure data lives in ./aggregation-operators.js and the
// view in ./aggregation-dom.js.

let built = false;
let stages = [];      // [{ id, operator, body, enabled, els, open, loading, lastBody }]
let limit = 25;
let nextId = 1;

// --- Stage model ------------------------------------------------------------

function makeStage(operator, body) {
  const op = operator || '$match';
  return {
    id: nextId++,
    operator: op,
    body: body !== undefined ? body : TEMPLATES[op],
    enabled: true,
    open: false,
    loading: false,
    lastBody: null,   // body+operator signature last previewed (staleness check)
    els: null,
  };
}

// Callbacks handed to each stage card. They take the stage explicitly, so one
// shared object serves every card.
const cardHandlers = {
  onOperatorChange,
  onToggle: toggleStage,
  onMoveUp: (s) => moveStage(s, -1),
  onMoveDown: (s) => moveStage(s, 1),
  onDuplicate: duplicateStage,
  onDelete: deleteStage,
  onPreview: previewStage,
};

// --- Rendering: whole panel -------------------------------------------------

// Refresh the context line (db.coll) and gate the builder on a selection.
function refreshContext() {
  const db = state.editor.db;
  const coll = state.editor.coll;
  const ctx = document.getElementById('agg-context');
  const body = document.getElementById('agg-body');
  if (!ctx || !body) return;

  if (!db || !coll) {
    ctx.textContent = '';
    body.innerHTML = `
      <div class="agg-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>Select a collection in the sidebar first</span>
      </div>`;
    disableToolbar(true);
    return;
  }

  const side = state.editor.side || 'source';
  ctx.textContent = `${side} · ${db}.${coll}`;
  disableToolbar(false);

  // Rebuild the stages host if the empty-state replaced it.
  if (!document.getElementById('agg-stages')) {
    body.innerHTML = '<div class="agg-stages" id="agg-stages"></div>';
  }
  if (stages.length === 0) {
    stages.push(makeStage('$match'));
  }
  renderStages();
}

function disableToolbar(disabled) {
  ['agg-run', 'agg-add', 'agg-copy'].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.disabled = disabled;
  });
}

// Full (re)build of the stage list from the model. Called on structural
// changes (add/delete/move/duplicate). Editing a body does NOT re-render.
function renderStages() {
  const host = document.getElementById('agg-stages');
  if (!host) return;
  host.innerHTML = '';
  stages.forEach((stage, i) => host.appendChild(buildStageCard(stage, i, stages.length, cardHandlers)));
}

// --- Stage mutations --------------------------------------------------------

function addStage(after) {
  const stage = makeStage('$match');
  if (after === undefined) stages.push(stage);
  else stages.splice(after + 1, 0, stage);
  renderStages();
}

function deleteStage(stage) {
  const i = stages.indexOf(stage);
  if (i === -1) return;
  stages.splice(i, 1);
  renderStages();
}

function duplicateStage(stage) {
  const i = stages.indexOf(stage);
  const copy = makeStage(stage.operator, stage.body);
  copy.enabled = stage.enabled;
  stages.splice(i + 1, 0, copy);
  renderStages();
}

function moveStage(stage, dir) {
  const i = stages.indexOf(stage);
  const j = i + dir;
  if (j < 0 || j >= stages.length) return;
  [stages[i], stages[j]] = [stages[j], stages[i]];
  renderStages();
}

function toggleStage(stage) {
  stage.enabled = !stage.enabled;
  stage.els.card.classList.toggle('agg-stage-disabled', !stage.enabled);
  stage.els.toggle.classList.toggle('agg-ctl-on', stage.enabled);
  stage.els.toggle.title = stage.enabled ? 'Disable stage' : 'Enable stage';
}

function onOperatorChange(stage, newOp) {
  const oldTemplate = TEMPLATES[stage.operator];
  const current = (stage.body || '').trim();
  // Only overwrite the body when it is empty or still an untouched template,
  // so we never clobber a hand-written stage body.
  if (current === '' || current === oldTemplate.trim() || TEMPLATE_SET.has(stage.body)) {
    stage.body = TEMPLATES[newOp];
    if (stage.els) stage.els.textarea.value = stage.body;
  }
  stage.operator = newOp;
  validateStageInline(stage);
  markStale(stage);
}

// --- Preview / Run ----------------------------------------------------------

// Hide a preview panel and mark its stage closed (wired into rendered previews
// via the close button). Content is kept so "Preview" can re-show it later.
function onPreviewClose(panel) {
  const card = panel.closest('.agg-stage');
  const id = card && parseInt(card.dataset.id, 10);
  const stage = stages.find((s) => s.id === id);
  if (stage) stage.open = false;
  panel.classList.add('u-hidden');
}

async function previewStage(stage) {
  const db = state.editor.db;
  const coll = state.editor.coll;
  if (!db || !coll) { toast('Select a collection first', 'error'); return; }
  if (stage.loading) return;

  const index = stages.indexOf(stage);
  stage.open = true;
  const panel = stage.els.preview;
  panel.classList.remove('u-hidden');

  // Assemble the slice up to and including this stage.
  let pipeline;
  try {
    pipeline = assemble(stages, index, index);
  } catch (e) {
    const where = e.stageNum && e.stageId !== stage.id ? ` (stage ${e.stageNum})` : '';
    renderPreviewError(panel, `${e.message}${where}`, onPreviewClose);
    return;
  }

  stage.loading = true;
  stage.els.previewBtn.disabled = true;
  panel.innerHTML = `<div class="agg-preview-loading">Running…</div>`;

  const side = state.editor.side || 'source';
  try {
    const res = await window.api.runAggregate(side, db, coll, pipeline, { limit });
    stage.loading = false;
    stage.els.previewBtn.disabled = false;
    if (!res || res.error) {
      renderPreviewError(panel, (res && res.error) ? res.error : 'Aggregation failed', onPreviewClose);
      return;
    }
    stage.lastBody = stageSignature(stage);
    renderPreviewResult(panel, res, limit, onPreviewClose);
  } catch (err) {
    stage.loading = false;
    stage.els.previewBtn.disabled = false;
    renderPreviewError(panel, err.message || String(err), onPreviewClose);
  }
}

// "Run pipeline" — validate all enabled stages then preview the last enabled
// one (i.e. the full pipeline output). Reuses the per-stage preview surface.
async function runPipeline() {
  const db = state.editor.db;
  const coll = state.editor.coll;
  if (!db || !coll) { toast('Select a collection first', 'error'); return; }

  const enabled = stages.filter((s) => s.enabled);
  if (enabled.length === 0) { toast('No enabled stages to run', 'error'); return; }

  // Validate the whole pipeline up front so a bad stage aborts with a toast.
  try {
    assemble(stages);
  } catch (e) {
    const bad = stages.find((s) => s.id === e.stageId);
    if (bad) validateStageInline(bad);
    toast(`Stage ${e.stageNum} (${bad ? bad.operator : '?'}): ${e.message}`, 'error');
    return;
  }

  const last = enabled[enabled.length - 1];
  const card = last.els && last.els.card;
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  await previewStage(last);
}

async function copyPipeline() {
  const enabled = stages.filter((s) => s.enabled);
  if (enabled.length === 0) { toast('No enabled stages to copy', 'error'); return; }
  let pipeline;
  try {
    pipeline = assemble(stages);
  } catch (e) {
    toast(`Stage ${e.stageNum}: ${e.message}`, 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(prettyJson(pipeline));
    toast('Pipeline copied to clipboard', 'success');
  } catch (err) {
    toast('Failed to copy pipeline', 'error');
  }
}

// --- Public API -------------------------------------------------------------

export function initAggregationView() {
  const btn = elements.btnEditorViewAggregation;
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!built) {
      built = buildDom({
        onAdd: () => addStage(),
        onRun: runPipeline,
        onCopy: copyPipeline,
        onLimitChange: (v) => { limit = v; },
        limit,
      });
    }
    showAuxPanel('aggregation');
    refreshContext();
  });
}
