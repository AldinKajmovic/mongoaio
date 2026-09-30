/* =============================================
   Editor — Query Builder Block Markup
   ============================================= */

import { escapeHtml } from '../utils/dom.js';
import { valueText } from './qb-state.js';
import { icon } from '../utils/icons.js';

const QB_OPS = [
  ['equals', 'equals'], ['not_equals', "doesn't equal"],
  ['contains', 'contains'], ['not_contains', "doesn't contain"],
  ['starts_with', 'starts with'], ['not_starts_with', "doesn't start with"],
  ['ends_with', 'ends with'], ['not_ends_with', "doesn't end with"],
  ['is_null', 'is null'], ['is_not_null', "isn't null"],
  ['exists', 'exists'], ['not_exists', "doesn't exist"],
  ['in', 'in'], ['not_in', 'not in'], ['all', 'array contains all']
];

const QB_TYPE_OPTIONS = [
  'Binary', 'Boolean', 'Date', 'Decimal128', 'Double', 'Int32', 'Int64',
  'ObjectId', 'Reference', 'Regex', 'String', 'Symbol', 'Timestamp'
];

/** Build `<option>` markup, marking `selected` as chosen. */
const options = (pairs, selected) => pairs
  .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`)
  .join('');

/**
 * Inner markup for one query-builder block.
 * @param {import('./qb-state.js').QbItem} item
 * @returns {string}
 */
export function qbBlockHtml(item) {
  const anyElementBtn = /\.\d+(\.|$)/.test(item.field)
    ? `<button class="editor-qb-btn-any" title="Match any array element (drop the [n] indexes)">[*]</button>`
    : '';
  const field = escapeHtml(item.field);

  return `
      <div class="editor-qb-block-content">
        <div class="editor-qb-block-field">
          <div class="editor-qb-drag-handle">${icon('drag', 14)}</div>
          <input type="text" class="editor-qb-field-input" value="${field}"
                 title="${field}" placeholder="field.path" spellcheck="false">
          ${anyElementBtn}
          <div class="editor-qb-actions-row">
            <button class="editor-qb-btn-path" title="Show full field path">${icon('info', 12, 2)}</button>
            <button class="editor-qb-btn-duplicate" title="Duplicate">${icon('copy')}</button>
            <button class="editor-qb-btn-remove" title="Remove this filter">${icon('trash')}</button>
          </div>
        </div>
        <div class="editor-qb-block-top">
          <div class="editor-qb-where-label">Where</div>
          <select class="editor-qb-op-select">${options(QB_OPS, item.op)}</select>
          <input type="checkbox" class="editor-qb-enabled-toggle" title="Include this filter" ${item.enabled ? 'checked' : ''}>
        </div>
        <div class="editor-qb-block-bottom">
          <div class="editor-qb-type-selector-wrap">
            <select class="editor-qb-type-select">${options(QB_TYPE_OPTIONS.map(t => [t, t]), item.type)}</select>
          </div>
          <input type="text" class="editor-qb-value-input" value="${escapeHtml(valueText(item.value))}" placeholder="Value">
          <button class="editor-qb-btn-more" title="Edit value in a larger box">...</button>
        </div>
      </div>
    `;
}
