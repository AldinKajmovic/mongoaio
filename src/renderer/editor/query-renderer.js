import { escapeHtml, highlightText } from '../utils/dom.js';
import { syncTreeRowColumns, setupTableColumnResize } from './resize.js';
import {
  getFieldType, isExpandable, renderNestedChildren, applyDepthIndent,
  subtreeMatchesSearch, resetAutoExpandBudget, allocAutoExpandBudget,
  MAX_AUTO_EXPANDED_ROWS
} from './value-viewer.js';
import { stashValue, previewJson } from './value-store.js';
import { icon } from '../utils/icons.js';

const CELL_PREVIEW_CHARS = 50;
const TITLE_PREVIEW_CHARS = 200;
const MIN_PER_DOC_EXPAND_ROWS = 200;

/**
 * Pretty-print one document as escaped (optionally search-highlighted) HTML for
 * a <pre>. Shared by the JSON results view and the aggregation preview so both
 * format documents identically.
 */
export function formatDocJson(doc, sq) {
  const json = JSON.stringify(doc, null, 2);
  return sq ? highlightText(json, sq) : escapeHtml(json);
}

export function renderJsonView(items, sq) {
  const jsonView = document.getElementById('editor-data-json');
  if (!jsonView) return;

  if (items.length === 0) {
    jsonView.innerHTML = '<pre class="u-m-0 u-p-12 u-font-mono u-font-small u-text-muted">[]</pre>';
  } else {
    const toolbar = `
      <div class="editor-json-toolbar">
        <button class="btn btn-ghost btn-sm btn-copy-json" title="Copy all documents as Extended JSON">
          ${icon('copy')}
          Copy JSON
        </button>
      </div>`;
    jsonView.innerHTML = toolbar + items.map((doc, i) => `
      <div class="editor-json-doc-item" data-index="${i}" title="Double click to edit">
        <div class="doc-actions-overlay">
          <button class="btn-delete-doc btn-icon btn-sm" data-index="${i}" title="Delete document">
            ${icon('trash')}
          </button>
        </div>
        <pre class="u-m-0 u-p-12 u-font-mono u-font-small u-text-muted">${formatDocJson(doc, sq)}</pre>
      </div>
    `).join('');
  }
}

export function renderTreeView(items, sq, expandedDocs) {
  const treeRows = document.querySelector('#editor-tree-rows');
  if (!treeRows) return;

  resetAutoExpandBudget();
  const perDocBudget = Math.max(
    MIN_PER_DOC_EXPAND_ROWS,
    Math.floor(MAX_AUTO_EXPANDED_ROWS / Math.max(1, items.length))
  );

  if (items.length === 0) {
    treeRows.innerHTML = '<div class="u-p-20 u-text-center u-text-muted">No documents found</div>';
  } else {
    treeRows.innerHTML = items.map((doc, i) => {
      allocAutoExpandBudget(perDocBudget);
      const idStr = String(doc._id);
      const docMatchesSearch = !!sq && subtreeMatchesSearch(doc, sq);
      const expanded = docMatchesSearch || expandedDocs.has(idStr);
      return `
      <div class="editor-doc-row${expanded ? ' expanded' : ''}" data-doc-index="${i + 1}">
        <div class="editor-doc-header">
          <div class="editor-doc-key">
            <span class="tree-arrow">▶</span>
            <span>${sq ? highlightText(`(${i + 1}) {_id: ${doc._id}}`, sq) : escapeHtml(`(${i + 1}) {_id: ${doc._id}}`)}</span>
          </div>
          <span class="editor-doc-value">{ ${Object.keys(doc).length} fields }</span>
          <div class="u-flex u-items-center u-gap-8">
            <span class="editor-doc-type">Document</span>
            <button class="btn-delete-doc btn-icon btn-sm" data-index="${i}" title="Delete document">
              ${icon('trash')}
            </button>
          </div>
        </div>
        <div class="editor-doc-children">
          ${renderNestedChildren(doc, i, 0, sq)}
        </div>
      </div>
    `}).join('');
  }
  if (sq) applyDepthIndent(treeRows);
  const header = document.getElementById('editor-tree-header');
  if (header) syncTreeRowColumns(header.style.gridTemplateColumns);
}

export function renderTableView(items, sq, skip) {
  const tableHead = document.getElementById('editor-table-head');
  const tableBody = document.getElementById('editor-table-body');
  if (!tableHead || !tableBody) return;

  if (items.length === 0) {
    tableHead.innerHTML = '<th class="editor-table-th">#</th><th class="editor-table-th">No results</th>';
    tableBody.innerHTML = '';
  } else {
    const allKeys = new Set();
    items.forEach(doc => Object.keys(doc).forEach(k => allKeys.add(k)));
    const columns = ['_id', ...Array.from(allKeys).filter(k => k !== '_id')];

    // SECURITY: column names come from document keys — escape them before they
    tableHead.innerHTML = '<th class="editor-table-th editor-table-th-num">#<span class="col-resize-handle"></span></th>' +
      columns.map(col => {
        const colAttr = escapeHtml(col);
        return `<th class="editor-table-th" data-col="${colAttr}" draggable="true" data-field="${colAttr}">${colAttr}<span class="col-resize-handle"></span></th>`;
      }).join('');

    tableBody.innerHTML = items.map((doc, i) => `
      <tr class="editor-table-row" data-index="${i}">
        <td class="editor-table-td editor-table-td-num">
          <div class="u-flex u-items-center u-gap-4">
            <span>${escapeHtml(i + 1 + skip)}</span>
            <button class="btn-delete-doc btn-icon btn-sm u-opacity-0 hover-opacity-100" data-index="${i}" title="Delete document">
              ${icon('trash', 10)}
            </button>
          </div>
        </td>
        ${columns.map(col => {
      const val = doc[col];
      const type = getFieldType(col, val);
      const expandable = isExpandable(val);

      const preview = val === undefined ? '' : previewJson(val, TITLE_PREVIEW_CHARS + 1);
      const titleText = preview.length > TITLE_PREVIEW_CHARS
        ? preview.slice(0, TITLE_PREVIEW_CHARS) + '…'
        : preview;
      const isTruncated = preview.length > CELL_PREVIEW_CHARS;
      const displayVal = isTruncated ? preview.slice(0, CELL_PREVIEW_CHARS) + '...' : preview;
      const cellHtml = sq ? highlightText(displayVal, sq) : escapeHtml(displayVal);
      const showExpand = expandable || isTruncated;
      const colAttr = escapeHtml(col);
      const valueRefHtml = val === undefined ? '' : ` data-value-ref="${escapeHtml(stashValue(val))}"`;
      return `
            <td class="editor-table-td${showExpand ? ' has-expandable' : ''}" draggable="true"
                title="${escapeHtml(titleText)}"
                data-index="${i}" data-col="${colAttr}" data-field="${colAttr}" data-type="${escapeHtml(type)}"
                ${valueRefHtml}>
              <div class="table-cell-content">
                <span class="cell-text">${cellHtml}</span>
                ${showExpand ? `
                  <button class="btn-expand-cell"${valueRefHtml} title="View full value">
                    ${icon('expand')}
                  </button>
                ` : ''}
                ${val !== undefined ? `
                  <button class="btn-copy-cell"${valueRefHtml} title="Copy full value">
                    ${icon('copy')}
                  </button>
                ` : ''}
              </div>
            </td>`;
    }).join('')}
      </tr>
    `).join('');
    setupTableColumnResize();
  }
}
