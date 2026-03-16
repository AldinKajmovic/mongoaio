import { state } from '../utils/state.js';
import { formatValue, emptyState, lazyPrettyJson } from '../utils/dom.js';

export function renderDocTabDifferent(items, q) {
  if (items.length === 0) return emptyState('No documents to compare in this range');

  return items.map(item => {
    if (item.diffs === undefined) return '';

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

      return `
        <div class="diff-field ${isSame ? 'same' : 'different'} ${isHidden ? 'hidden' : ''}">
          <div class="diff-field-sync-col">
            <span class="field-toggle-icon">›</span>
            ${!isSame ? `<input type="checkbox" class="field-sync-checkbox" data-doc-id="${item._id}" data-field="${d.field}">` : '<span class="diff-field-sync-spacer"></span>'}
          </div>
          <span class="diff-field-name">${isSame ? '<span class="tag-same">SAME</span>' : ''}${d.field}</span>
          <div class="diff-field-value source-val" id="field-source-${item._id}-${d.field}" data-side="source" data-doc-id="${item._id}" data-field="${d.field}">
            <span class="val-text ${isSame ? 'same' : 'different'}">${formatValue(d.sourceValue)}</span>
            <div class="diff-field-actions">
              <span class="action-icon edit-field" title="Edit Source">✎</span>
            </div>
          </div>
          <div class="diff-field-value target-val" id="field-target-${item._id}-${d.field}" data-side="target" data-doc-id="${item._id}" data-field="${d.field}">
            <span class="val-text ${isSame ? 'same' : 'different'}">${formatValue(d.targetValue)}</span>
            <div class="diff-field-actions">
              <span class="action-icon edit-field" title="Edit Target">✎</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const counts = (() => {
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
      <div class="doc-item expanded" data-id="${item._id}">
        <div class="doc-item-header">
          <span class="doc-id">_id: ${item._id}</span>
          <div class="item-actions">
            ${counts}
            <button class="btn btn-sm btn-source" data-action="sync-target-to-source" data-id="${item._id}" title="Sync from target"><- Sync Selected</button>
            <button class="btn btn-sm btn-target" data-action="sync-source-to-target" data-id="${item._id}" title="Sync to target">Sync Selected -></button>
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
              ${lazyPrettyJson(item.source, `json-source-${item._id}`)}
            </div>
            <div class="diff-side">
              <div class="diff-side-label target">Target Document</div>
              ${lazyPrettyJson(item.target, `json-target-${item._id}`)}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderDocTabUnique(items, side, q) {
  if (items.length === 0) return emptyState(`No documents unique to ${side} matching your search`);

  return items.map(doc => {
    const fields = Object.keys(doc).sort();
    const filteredFields = q ? fields.filter(f => f.toLowerCase().includes(q) || String(doc[f]).toLowerCase().includes(q)) : fields;

    const fieldsHtml = filteredFields.map(f => `
      <div class="diff-field unique">
        <span class="diff-field-name">${f}</span>
        <div class="diff-field-value ${side}-val" id="field-${side}-${doc._id}-${f}" data-side="${side}" data-doc-id="${doc._id}" data-field="${f}">
          <span class="val-text">${formatValue(doc[f])}</span>
          <div class="diff-field-actions">
            <span class="action-icon edit-field" title="Edit">✎</span>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <div class="doc-item" data-id="${doc._id}">
        <div class="doc-item-header">
          <span class="doc-id">_id: ${doc._id}</span>
          <div class="item-actions">
            ${side === 'source' ?
        `<button class="btn btn-sm btn-target" data-action="copy-source-to-target" data-id="${doc._id}" title="Copy to target">-> Copy to Target</button>` :
        `<button class="btn btn-sm btn-source" data-action="copy-target-to-source" data-id="${doc._id}" title="Copy to source"><- Copy to Source</button>`
      }
            <button class="btn btn-sm btn-danger delete-doc-btn" data-side="${side}" data-id="${doc._id}" title="Delete from ${side}">✕ Delete</button>
          </div>
        </div>
        <div class="doc-item-body">
          <div class="diff-fields">
            ${fieldsHtml}
          </div>
          <div class="u-mt-16">
             ${lazyPrettyJson(doc, `json-${side}-${doc._id}`)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}
