import { escapeHtml } from '../utils/dom.js';

// ---------------------------------------------------------------------------
// Metrics dashboard — "hottest collections" and "slowest operations" lists.
// ---------------------------------------------------------------------------

/**
 * Render the hottest-collections list from the current/previous `top` totals.
 * Activity is the delta in cumulative per-namespace time between snapshots.
 */
export function renderHottest(curTop, prevTop) {
  const el = document.getElementById('metrics-hottest');
  if (!el) return;

  if (!curTop) {
    el.innerHTML = `<div class="metrics-list-empty">Not available on this server</div>`;
    return;
  }

  const rows = [];
  let totalDelta = 0;
  for (const [ns, cur] of Object.entries(curTop)) {
    const before = prevTop && prevTop[ns];
    if (!before) continue;
    const delta = Math.max(0, cur.total - before.total);
    const wDelta = Math.max(0, cur.writeLock - before.writeLock);
    const rDelta = Math.max(0, cur.readLock - before.readLock);
    totalDelta += delta;
    rows.push({ ns, delta, write: wDelta >= rDelta });
  }

  rows.sort((a, b) => b.delta - a.delta);
  const top = rows.slice(0, 10);

  if (top.length === 0) {
    el.innerHTML = `<div class="metrics-list-empty">No activity</div>`;
    return;
  }

  el.innerHTML = top.map((r) => {
    const pct = totalDelta > 0 ? Math.round((r.delta / totalDelta) * 100) : 0;
    return `
      <div class="metrics-list-row metrics-hot-row">
        <span class="metrics-hot-ns" title="${escapeHtml(String(r.ns))}">${escapeHtml(String(r.ns))}</span>
        <span class="metrics-hot-pct">${pct}%</span>
        <span class="metrics-hot-tag">${r.write ? 'w' : 'r'}</span>
      </div>`;
  }).join('');
}

/** Render the slowest currently-running operations (top 5, min 4 rows shown). */
export function renderSlowest(curOp) {
  const el = document.getElementById('metrics-slowest');
  if (!el) return;

  if (!curOp) {
    el.innerHTML = `<div class="metrics-list-empty">Not available on this server</div>`;
    return;
  }

  const ops = [...curOp].sort((a, b) => b.microsecs_running - a.microsecs_running).slice(0, 5);
  const rows = [];
  for (let i = 0; i < Math.max(4, ops.length); i++) {
    const op = ops[i];
    if (op) {
      const ms = Math.round(op.microsecs_running / 1000);
      const label = op.command || op.op || 'op';
      const ns = op.ns ? ` ${op.ns}` : '';
      rows.push(`
        <div class="metrics-list-row metrics-slow-row">
          <span class="metrics-slow-op">${escapeHtml(String(label).toUpperCase())}<span class="metrics-slow-ns">${escapeHtml(ns)}</span></span>
          <span class="metrics-slow-ms">${ms} ms</span>
        </div>`);
    } else {
      rows.push(`
        <div class="metrics-list-row metrics-slow-row metrics-slow-none">
          <span class="metrics-slow-op">NONE</span>
          <span class="metrics-slow-ms">0 ms</span>
        </div>`);
    }
  }
  el.innerHTML = rows.join('');
}
