import { elements } from '../utils/state.js';
import { escapeHtml } from '../utils/dom.js';
import { pushResult, findResult, removeResult } from './shell-tabs.js';
import { PAGE_SIZE, renderBody, toRows, countChip } from './shell-render-table.js';

/**
 * Append a result item to the shell results area and persist it in the active tab.
 */
export function appendShellResult(query, content, type = 'success', meta = {}) {
  const container = elements.editorShellResults;
  if (!container) return;

  const result = pushResult(query, content, type, meta);
  if (!result) return;

  // Clear the "No results yet." placeholder if present (static markup or rendered).
  if (container.querySelector('.shell-empty, .u-italic')) container.innerHTML = '';

  // Prepend so the latest result is on top.
  container.insertBefore(renderResultItem(result), container.firstChild);
}

/** Render the empty-state placeholder into a results container. */
export function renderEmptyResults(container) {
  container.innerHTML = '<div class="shell-empty u-p-16 u-text-muted u-italic">No results yet.</div>';
}

// --- Result item rendering -------------------------------------------------

/** Build the DOM element for a single persisted result. */
export function renderResultItem(r) {
  const item = document.createElement('div');
  item.className = 'shell-result-item';
  item.dataset.resultId = r.id;

  const isArray = Array.isArray(r.content);
  const rows = toRows(r.content);
  const countLabel = countChip(r, rows);
  const canToggle = isArray && rows.length > 0;
  const toggleLabel = r.view === 'json' ? 'Table' : 'JSON';

  const header = document.createElement('div');
  header.className = 'shell-result-header';
  header.innerHTML = `
    <div class="shell-result-query">${escapeHtml(r.query)} ${countLabel}</div>
    <div class="shell-result-actions">
      ${canToggle ? `<button class="shell-view-toggle" title="Toggle table/JSON view">${toggleLabel}</button>` : ''}
      <span class="shell-result-time">${escapeHtml(r.time || '')}</span>
      <button class="shell-result-remove" title="Remove this result" aria-label="Remove result">&times;</button>
    </div>`;
  item.appendChild(header);

  const printed = Array.isArray(r.meta?.printed) ? r.meta.printed : [];
  if (printed.length) {
    const pre = document.createElement('div');
    pre.className = 'shell-print';
    pre.textContent = printed.join('\n');
    item.appendChild(pre);
  }

  item.appendChild(renderBody(r, rows));
  return item;
}

// --- Delegated interactions (remove / paginate / toggle) -------------------

function rerender(item, r) {
  const fresh = renderResultItem(r);
  item.replaceWith(fresh);
  return fresh;
}

/** Navigate a server-paginated result, then re-render.
 *  Visited pages come from cache; sequential Next streams from the live cursor
 *  (mongosh `it`); jumps and cache misses fall back to a skip/limit re-query. */
async function serverPage(item, r, act) {
  const m = r.meta;
  const pageSize = m.pageSize || PAGE_SIZE;
  const totalPages = m.total !== undefined ? Math.max(1, Math.ceil(m.total / pageSize)) : undefined;

  let target = r.page;
  if (act === 'first') target = 1;
  else if (act === 'prev') target = Math.max(1, r.page - 1);
  else if (act === 'next') target = r.page + 1;
  else if (act === 'last' && totalPages) target = totalPages;
  if (target === r.page) return;

  // Already fetched — show instantly, no round trip.
  if (m.cache && m.cache[target]) {
    r.content = m.cache[target];
    r.page = target;
    rerender(item, r);
    return;
  }

  item.querySelectorAll('.shell-page-btn').forEach(b => { b.disabled = true; });
  try {
    let res = null;
    // Sequential next: stream the next batch from the live cursor.
    if (act === 'next' && m.cursorId && target === m.cursorPage + 1) {
      res = await window.api.shellCursorNext(m.cursorId);
      if (res && res.expired) { m.cursorId = null; res = null; }
      else if (res && !res.error) m.cursorPage = target;
    }
    // Jump, cache miss, or expired cursor: re-query that page directly.
    if (!res) {
      res = await window.api.shellEval(m.side, m.db, m.code, { page: target, pageSize });
    }
    if (res && !res.error) {
      r.content = res.result;
      r.page = target;
      m.hasMore = !!res.hasMore;
      if (res.total !== undefined) m.total = res.total;
      if (!m.cache) m.cache = {};
      m.cache[target] = res.result;
    }
  } catch (_) { /* leave the current page in place on failure */ }
  rerender(item, r);
}

document.addEventListener('click', (e) => {
  const item = e.target.closest('.shell-result-item');
  if (!item || !item.dataset.resultId) return;
  if (!item.closest('#editor-shell-results')) return;
  const id = item.dataset.resultId;

  if (e.target.closest('.shell-result-remove')) {
    e.stopPropagation();
    const container = item.parentElement;
    const r = findResult(id);
    if (r?.meta?.cursorId) window.api.shellCursorClose(r.meta.cursorId);
    const remaining = removeResult(id);
    item.remove();
    if (remaining === 0 && container) renderEmptyResults(container);
    return;
  }

  const pageBtn = e.target.closest('.shell-page-btn');
  if (pageBtn) {
    const r = findResult(id);
    if (!r) return;
    if (r.meta?.paginated) {
      serverPage(item, r, pageBtn.dataset.act);
    } else {
      const rows = toRows(r.content);
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      const act = pageBtn.dataset.act;
      if (act === 'first') r.page = 1;
      else if (act === 'prev') r.page = Math.max(1, r.page - 1);
      else if (act === 'next') r.page = Math.min(totalPages, r.page + 1);
      else if (act === 'last') r.page = totalPages;
      rerender(item, r);
    }
    return;
  }

  if (e.target.closest('.shell-view-toggle')) {
    const r = findResult(id);
    if (!r) return;
    r.view = r.view === 'table' ? 'json' : 'table';
    rerender(item, r);
  }
});
