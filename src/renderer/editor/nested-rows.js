/* =============================================
   Editor — Nested Field Rows (tree expansion)
   ============================================= */

import { escapeHtml, highlightText } from '../utils/dom.js';
import { stashValue, elementValue } from './value-store.js';
import { icon } from '../utils/icons.js';
import { getFieldType, isExpandable, valueSummary } from './field-types.js';
import {
  subtreeMatchesSearch, claimAutoExpand, allocAutoExpandBudget,
  MAX_AUTO_EXPANDED_ROWS
} from './tree-search.js';

/** Indentation applied per nesting level, in pixels. */
const INDENT_BASE_PX = 28;
const INDENT_STEP_PX = 16;


export function renderNestedChildren(val, docIndex, depth, sq, parentPath = '') {
  if (!isExpandable(val)) return '';

  const isArr = Array.isArray(val);
  const entries = isArr
    ? val.map((item, i) => [String(i), item])
    : Object.entries(val);

  const editable = docIndex >= 0;

  const rowsHtml = entries
    .map(([key, childVal]) => renderRow(key, childVal, { docIndex, depth, sq, parentPath, isArr, editable }))
    .join('');

  const addHtml = (editable && !isArr)
    ? `<div class="editor-field-add-row" data-index="${escapeHtml(docIndex)}" data-path="${escapeHtml(parentPath)}" data-depth="${escapeHtml(depth)}">` +
    `<button class="editor-field-add" data-index="${escapeHtml(docIndex)}" data-path="${escapeHtml(parentPath)}">` +
    `${icon('plus', 11, 2.5)}` +
    `<span>add field</span></button></div>`
    : '';

  return rowsHtml + addHtml;
}

/** Render one field row (plus its children container when expandable). */
function renderRow(key, childVal, ctx) {
  const { docIndex, depth, sq, parentPath, isArr, editable } = ctx;
  const type = getFieldType(key, childVal);
  const expandable = isExpandable(childVal);
  const valStr = expandable
    ? valueSummary(childVal)
    : (childVal === null ? 'null' : String(childVal));

  const path = parentPath ? `${parentPath}.${key}` : key;

  const keyHtml = sq ? highlightText(key, sq) : escapeHtml(key);
  const valHtml = sq ? highlightText(valStr, sq) : escapeHtml(valStr);
  const isEmptyVal = !expandable && valStr === '';

  const branchMatches = expandable && !!sq && subtreeMatchesSearch(childVal, sq);
  const autoExpand = claimAutoExpand(branchMatches);
  const hiddenMatches = branchMatches && !autoExpand;
  const childrenHtml = autoExpand ? renderNestedChildren(childVal, docIndex, depth + 1, sq, path) : '';

  const canDelete = editable && !isArr && path !== '_id';
  const deleteBtnHtml = canDelete
    ? `<button class="editor-field-delete" data-index="${escapeHtml(docIndex)}" data-path="${escapeHtml(path)}" title="Remove field" aria-label="Remove field">${icon('close', 11, 2.5)}</button>`
    : '';

  return `
      <div class="editor-field-row${expandable ? ' nested-expandable' : ''}${autoExpand ? ' nested-expanded' : ''}${hiddenMatches ? ' has-hidden-matches' : ''}"
           draggable="true"${hiddenMatches ? ' title="Contains more matches — click to expand"' : ''}
           data-index="${escapeHtml(docIndex)}" data-key="${escapeHtml(key)}"
           data-field="${escapeHtml(key)}" data-type="${escapeHtml(type)}" data-path="${escapeHtml(path)}"
           data-value-ref="${escapeHtml(stashValue(childVal))}" data-depth="${escapeHtml(depth)}">
        <span class="editor-field-indent">
          ${expandable ? '<span class="tree-arrow nested-arrow">&#9654;</span>' : ''}
        </span>
        <span class="editor-field-key" data-index="${escapeHtml(docIndex)}"
              data-key="${escapeHtml(key)}" data-type="key">${keyHtml}</span>
        <span class="editor-field-value${expandable ? ' nested-summary' : ''}${isEmptyVal ? ' editor-field-value-empty' : ''}"
              data-index="${escapeHtml(docIndex)}" data-key="${escapeHtml(key)}"
              data-type="value">${valHtml}</span>
        <span class="editor-field-type u-text-muted u-font-xs u-ml-8">${escapeHtml(type)}</span>
        ${deleteBtnHtml}
      </div>
      ${expandable ? `<div class="editor-nested-children"${autoExpand ? ' data-rendered="true"' : ''}>${childrenHtml}</div>` : ''}`;
}

/**
 * Toggle expansion of a nested-expandable field row.
 * Lazily renders children on first expand.
 */
export function toggleNestedField(fieldRow, sq) {
  const children = fieldRow.nextElementSibling;
  if (!children?.classList.contains('editor-nested-children')) return;

  const wasExpanded = fieldRow.classList.contains('nested-expanded');
  let rendered = false;

  if (!wasExpanded && !children.dataset.rendered) {
    const val = elementValue(fieldRow);
    if (val === undefined) return;
    const docIndex = parseInt(fieldRow.dataset.index, 10);
    const depth = parseInt(fieldRow.dataset.depth || '0', 10) + 1;
    const parentPath = fieldRow.dataset.path || '';
    allocAutoExpandBudget(MAX_AUTO_EXPANDED_ROWS);
    children.innerHTML = renderNestedChildren(val, docIndex, depth, sq, parentPath);
    children.dataset.rendered = 'true';
    fieldRow.classList.remove('has-hidden-matches');
    applyDepthIndent(children);
    rendered = true;
  }

  fieldRow.classList.toggle('nested-expanded');

  if (rendered) document.dispatchEvent(new CustomEvent('editor-tree-expanded'));
}

/**
 * Apply indentation to nested field rows based on data-depth
 */
export function applyDepthIndent(container) {
  container.querySelectorAll('.editor-field-row, .editor-field-add-row').forEach(row => {
    const d = parseInt(row.dataset.depth, 10) || 0;
    row.style.paddingLeft = `${INDENT_BASE_PX + d * INDENT_STEP_PX}px`;
  });
}
