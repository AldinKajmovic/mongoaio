import { state } from '../utils/state.js';
import { emptyState, lazyPrettyJson, escapeHtml } from '../utils/dom.js';
import { formatFieldValue } from '../utils/json-tree.js';
import { compareIdLabel } from './compare-ids.js';

// Documents are keyed by their page index (see compare-ids.js). Field names
// and _id labels are document data, so every one is escaped.

export function renderDocTabDifferent(items, q) {
  if (items.length === 0) return emptyState('No documents to compare in this range');

  return items.map((item, index) => {
    if (item.diffs === undefined) return '';
    const key = String(index);
    const idLabel = escapeHtml(compareIdLabel(key));

    const filteredDiffs = item.diffs.filter(d => {
      const search = q.toLowerCase();
      return d.field.toLowerCase().includes(search) ||
        String(d.sourceValue || '').toLowerCase().includes(search) ||
        String(d.targetValue || '').toLowerCase().includes(search);
    });
    if (q && filteredDiffs.length === 0) return '';

    const diffsHtml = filteredDiffs.map(d => {
      const isSame = d.type === 'same';
      const isHidden = (state.fieldFilter === 'diffs' && isSame) || (state.fieldFilter === 'same' && !isSame);

      const field = escapeHtml(d.field);
      const valueCell = (side, value, other) => `
          <div class="diff-field-value ${escapeHtml(side)}-val" id="${escapeHtml(`field-${side}-${key}-${d.field}`)}" data-side="${escapeHtml(side)}" data-doc-id="${key}" data-field="${field}">
            <span class="val-text ${isSame ? 'same' : 'different'}">${formatFieldValue(value, other, !isSame, { lazyId: `fv-${side}-${key}-${d.field}`, path: d.field, docId: key })}</span>
            <div class="diff-field-actions">
              <span class="action-icon edit-field" title="Edit ${side === 'source' ? 'Source' : 'Target'}">✎</span>
            </div>
          </div>`;

      return `
        <div class="diff-field ${isSame ? 'same' : 'different'} ${isHidden ? 'hidden' : ''}">
          <div class="diff-field-sync-col">
            <span class="field-toggle-icon">›</span>
            ${!isSame ? `<input type="checkbox" class="field-sync-checkbox" data-doc-id="${key}" data-field="${field}">` : '<span class="diff-field-sync-spacer"></span>'}
          </div>
          <span class="diff-field-name">${isSame ? '<span class="tag-same">SAME</span>' : ''}${field}</span>
          ${valueCell('source', d.sourceValue, d.targetValue)}
          ${valueCell('target', d.targetValue, d.sourceValue)}
        </div>
      `;
    }).join('');

    const countsHtml = (() => {
      const diffs = item.diffs.filter(d => d.type !== 'same');
      const sames = item.diffs.filter(d => d.type === 'same');
      let pills = '';
      if (diffs.length > 0) {
        pills += `<span class="stat-pill different clickable sm ${state.fieldFilter === 'diffs' ? 'active' : ''}" data-filter="diffs">${diffs.length} diff${diffs.length !== 1 ? 's' : ''}</span>`;
      } else if (state.activeDocTab === 'different') {
        pills += `<span class="stat-pill identical sm">Fully Synced</span>`;
      }
      if (sames.length > 0) {
        pills += `<span class="stat-pill common clickable sm ${state.fieldFilter === 'same' ? 'active' : ''}" data-filter="same">${sames.length} same</span>`;
      }
      return pills;
    })();

    return `
      <div class="doc-item expanded" data-id="${key}">
        <div class="doc-item-header">
          <span class="doc-id">_id: ${idLabel}</span>
          <div class="item-actions">
            ${countsHtml}
            <button class="btn btn-sm btn-source" data-action="sync-target-to-source" data-id="${key}" title="Sync from target">&lt;- Sync Selected</button>
            <button class="btn btn-sm btn-target" data-action="sync-source-to-target" data-id="${key}" title="Sync to target">Sync Selected -&gt;</button>
          </div>
        </div>
        <div class="doc-item-body">
          <div class="diff-fields">
            <div class="diff-field header">
              <span class="diff-field-spacer"></span>
              <span class="diff-field-name">Field</span>
              <span class="diff-field-value diff-field-value-source-header">Source</span>
              <span class="diff-field-value diff-field-value-target-header">Target</span>
            </div>
            ${diffsHtml}
          </div>
          <div class="diff-view u-mt-16">
            <div class="diff-side">
              <div class="diff-side-label source">Source Document</div>
              ${lazyPrettyJson(item.source, `json-source-${key}`)}
            </div>
            <div class="diff-side">
              <div class="diff-side-label target">Target Document</div>
              ${lazyPrettyJson(item.target, `json-target-${key}`)}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderDocTabUnique(items, side, q) {
  if (items.length === 0) return emptyState(`No documents unique to ${side} matching your search`);

  return items.map((doc, index) => {
    const key = String(index);
    const fields = Object.keys(doc).sort();
    const filteredFields = q ? fields.filter(f => f.toLowerCase().includes(q) || String(doc[f]).toLowerCase().includes(q)) : fields;

    const fieldsHtml = filteredFields.map(f => `
      <div class="diff-field unique">
        <span class="diff-field-name">${escapeHtml(f)}</span>
        <div class="diff-field-value ${escapeHtml(side)}-val" id="${escapeHtml(`field-${side}-${key}-${f}`)}" data-side="${escapeHtml(side)}" data-doc-id="${key}" data-field="${escapeHtml(f)}">
          <span class="val-text">${formatFieldValue(doc[f], undefined, false, { lazyId: `fv-${side}-${key}-${f}`, path: f, docId: key })}</span>
          <div class="diff-field-actions">
            <span class="action-icon edit-field" title="Edit">✎</span>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <div class="doc-item" data-id="${key}">
        <div class="doc-item-header">
          <span class="doc-id">_id: ${escapeHtml(compareIdLabel(key))}</span>
          <div class="item-actions">
            ${side === 'source' ?
        `<button class="btn btn-sm btn-target" data-action="copy-source-to-target" data-id="${key}" title="Copy to target">-&gt; Copy to Target</button>` :
        `<button class="btn btn-sm btn-source" data-action="copy-target-to-source" data-id="${key}" title="Copy to source">&lt;- Copy to Source</button>`
      }
            <button class="btn btn-sm btn-danger delete-doc-btn" data-side="${escapeHtml(side)}" data-id="${key}" title="Delete from ${escapeHtml(side)}">✕ Delete</button>
          </div>
        </div>
        <div class="doc-item-body">
          <div class="diff-fields">
            ${fieldsHtml}
          </div>
          <div class="u-mt-16">
             ${lazyPrettyJson(doc, `json-${side}-${key}`)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}
