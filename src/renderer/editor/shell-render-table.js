import { escapeHtml } from '../utils/dom.js';

/** Documents shown per page in the shell table view. */
export const PAGE_SIZE = 10;
/** Max characters shown in a table cell before truncation. */
const CELL_MAX = 120;

/** Build the body (table / JSON / text) for a result. */
export function renderBody(r, rows) {
  if (r.type === 'error') {
    return textBody(String(r.content), true);
  }

  if (Array.isArray(r.content)) {
    if (rows.length === 0) return textBody('[]  (0 documents)', false);
    if (r.view === 'json') return textBody(safeStringify(r.content), false);
    return tableBody(r, rows);
  }

  // Non-array values (objects, write results, numbers, strings).
  const display = typeof r.content === 'object' && r.content !== null
    ? safeStringify(r.content)
    : String(r.content);
  return textBody(display, false);
}

function textBody(text, isError) {
  const el = document.createElement('div');
  el.className = 'shell-result-content' + (isError ? ' u-text-error' : '');
  el.textContent = text;
  return el;
}

/** Build the paginated table body + pagination footer for an array result. */
function tableBody(r, rows) {
  const wrap = document.createElement('div');
  wrap.className = 'shell-result-content shell-result-table';

  const columns = collectColumns(rows);

  // Two paging modes:
  //  - server: `rows` already holds just the current page; navigation re-queries.
  //  - client: `rows` holds the whole (bounded) set and we slice it locally.
  const paginated = !!r.meta?.paginated;
  const pageSize = paginated ? (r.meta.pageSize || PAGE_SIZE) : PAGE_SIZE;

  let start, pageRows, totalRows, totalPages, hasPrev, hasNext;
  if (paginated) {
    start = (r.page - 1) * pageSize;
    pageRows = rows;
    totalRows = r.meta.total; // may be undefined when count is unavailable
    totalPages = totalRows !== undefined ? Math.max(1, Math.ceil(totalRows / pageSize)) : undefined;
    hasPrev = r.page > 1;
    hasNext = !!r.meta.hasMore;
  } else {
    totalRows = rows.length;
    totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (r.page > totalPages) r.page = totalPages;
    if (r.page < 1) r.page = 1;
    start = (r.page - 1) * pageSize;
    pageRows = rows.slice(start, start + pageSize);
    hasPrev = r.page > 1;
    hasNext = r.page < totalPages;
  }

  const head = columns.map(c => `<th class="shell-th">${escapeHtml(c)}</th>`).join('');
  const body = pageRows.map((doc, i) => {
    const cells = columns.map(col => {
      const raw = doc[col];
      const full = cellDisplay(raw);
      const truncated = full.length > CELL_MAX ? full.slice(0, CELL_MAX) + '…' : full;
      return `<td class="shell-td" title="${escapeHtml(full)}">${escapeHtml(truncated)}</td>`;
    }).join('');
    return `<tr><td class="shell-td shell-td-num">${start + i + 1}</td>${cells}</tr>`;
  }).join('');

  const tableWrap = document.createElement('div');
  tableWrap.className = 'shell-table-scroll';
  tableWrap.innerHTML = `
    <table class="shell-table">
      <thead><tr><th class="shell-th shell-th-num">#</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  wrap.appendChild(tableWrap);

  const showPager = paginated ? (hasPrev || hasNext) : rows.length > pageSize;
  if (showPager) {
    const from = pageRows.length ? start + 1 : 0;
    const to = start + pageRows.length;
    const totalLabel = totalRows !== undefined ? ` of ${totalRows}` : '';
    const pageLabel = totalPages !== undefined ? `page ${r.page}/${totalPages}` : `page ${r.page}`;
    // "Last" needs a known total to jump to; omit it when the count is unknown.
    const lastBtn = totalPages !== undefined
      ? `<button class="shell-page-btn" data-act="last" ${!hasNext ? 'disabled' : ''}>Last »</button>`
      : '';
    const pager = document.createElement('div');
    pager.className = 'shell-pagination';
    pager.innerHTML = `
      <button class="shell-page-btn" data-act="first" ${!hasPrev ? 'disabled' : ''}>« First</button>
      <button class="shell-page-btn" data-act="prev" ${!hasPrev ? 'disabled' : ''}>‹ Prev</button>
      <span class="shell-page-info">${from}–${to}${totalLabel} &nbsp;·&nbsp; ${pageLabel}</span>
      <button class="shell-page-btn" data-act="next" ${!hasNext ? 'disabled' : ''}>Next ›</button>
      ${lastBtn}`;
    wrap.appendChild(pager);
  }

  return wrap;
}

// --- Helpers ---------------------------------------------------------------

/** Normalize array content into table rows (objects stay; primitives become {value}). */
export function toRows(content) {
  if (!Array.isArray(content)) return [];
  if (content.length === 0) return [];
  const allObjects = content.every(x => x && typeof x === 'object' && !Array.isArray(x));
  return allObjects ? content : content.map(v => ({ value: v }));
}

/** Ordered union of keys across rows, with _id first. */
function collectColumns(rows) {
  const keys = new Set();
  rows.forEach(d => Object.keys(d).forEach(k => keys.add(k)));
  const cols = [...keys];
  if (keys.has('_id')) return ['_id', ...cols.filter(k => k !== '_id')];
  return cols;
}

function cellDisplay(v) {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'object') return safeStringify(v);
  return String(v);
}

function safeStringify(v) {
  try { return JSON.stringify(v, null, 2); }
  catch (_) { return String(v); }
}

export function countChip(r, rows) {
  if (Array.isArray(r.content)) {
    if (r.meta?.paginated) {
      if (r.meta.total !== undefined) return `<span class="u-text-muted">(${r.meta.total} docs)</span>`;
      return `<span class="u-text-muted">(page ${r.page})</span>`;
    }
    const suffix = r.meta?.truncated ? '+' : '';
    return `<span class="u-text-muted">(${rows.length}${suffix} docs)</span>`;
  }
  if (r.meta?.total !== undefined) {
    return `<span class="u-text-muted">(${r.meta.total} docs)</span>`;
  }
  return '';
}
