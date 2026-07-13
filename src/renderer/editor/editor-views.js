import { stopMetricsPolling } from './metrics.js';


const VIEWS = {
  collections: { content: 'editor-view-collections-content', btn: 'btn-editor-view-collections' },
  aggregation: { content: 'editor-view-aggregation-content', btn: 'btn-editor-view-aggregation' },
  schema: { content: 'editor-view-schema-content', btn: 'btn-editor-view-schema' },
  indexes: { content: 'editor-view-indexes-content', btn: 'btn-editor-view-indexes' },
  shell: { content: 'editor-view-shell-content', btn: 'btn-editor-view-shell' },
  metrics: { content: 'editor-view-metrics-content', btn: 'btn-editor-view-metrics', onHide: () => stopMetricsPolling() },
};

let currentView = 'collections';

const hide = (id) => { const el = document.getElementById(id); if (el) el.classList.add('u-hidden'); };
const show = (id) => { const el = document.getElementById(id); if (el) el.classList.remove('u-hidden'); };
const deactivate = (id) => { const el = document.getElementById(id); if (el) el.classList.remove('active'); };
const activate = (id) => { const el = document.getElementById(id); if (el) el.classList.add('active'); };

/**
 * Show one editor view, hiding all others and running the outgoing view's
 * onHide hook. Unknown names are ignored.
 * @param {'collections'|'aggregation'|'schema'|'indexes'|'shell'|'metrics'} name
 */
export function activateView(name) {
  if (!VIEWS[name]) return;

  if (name !== currentView) {
    const outgoing = VIEWS[currentView];
    if (outgoing && typeof outgoing.onHide === 'function') outgoing.onHide();
  }

  for (const key of Object.keys(VIEWS)) {
    const v = VIEWS[key];
    if (key === name) { show(v.content); activate(v.btn); }
    else { hide(v.content); deactivate(v.btn); }
  }
  currentView = name;
}

export function getCurrentView() {
  return currentView;
}

/** Show one of the aux panels (aggregation/schema/indexes). */
export function showAuxPanel(name) {
  activateView(name);
}

/** Return to the collections view (kept for backwards-compatible call sites). */
export function hideAuxPanels() {
  activateView('collections');
}

/**
 * Nav-button wiring for the original tabs lives in shell.js / metrics.js and
 * the aux-panel modules; nothing to do here now that activateView is the single
 * switch. Retained so renderer.js's init call stays stable.
 */
export function initEditorViews() { }
