import { escapeHtml } from '../utils/dom.js';

// ---------------------------------------------------------------------------
// Index panel — renders the list of existing indexes into #idx-table-body
// (key spec, property badges, usage count, Drop button).
// ---------------------------------------------------------------------------

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
  if (typeof idx.ttl === 'number') badges.push(`<span class="idx-badge idx-badge-ttl">TTL:${escapeHtml(idx.ttl)}s</span>`);
  if (idx.partialFilterExpression) badges.push('<span class="idx-badge idx-badge-partial">partial</span>');
  if (idx.isIdIndex) badges.push('<span class="idx-badge idx-badge-id">_id</span>');
  return badges.join(' ') || '<span class="u-text-muted">—</span>';
}

export function renderIndexRows(indexes) {
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
