import { escapeHtml, highlightText } from '../utils/dom.js';
import { syncTreeRowColumns, setupTableColumnResize } from './resize.js';

export function renderJsonView(items, sq) {
  const jsonView = document.getElementById('editor-data-json');
  if (!jsonView) return;

  if (items.length === 0) {
    jsonView.innerHTML = '<pre class="u-m-0 u-p-12 u-font-mono u-font-small u-text-muted">[]</pre>';
  } else {
    jsonView.innerHTML = items.map((doc, i) => `
      <div class="editor-json-doc-item" data-index="${i}" title="Double click to edit">
        <div class="doc-actions-overlay">
          <button class="btn-delete-doc btn-icon btn-sm" data-index="${i}" title="Delete document">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
        <pre class="u-m-0 u-p-12 u-font-mono u-font-small u-text-muted">${sq ? highlightText(JSON.stringify(doc, null, 2), sq) : escapeHtml(JSON.stringify(doc, null, 2))}</pre>
      </div>
    `).join('');
  }
}

export function renderTreeView(items, sq, expandedDocs) {
  const treeRows = document.querySelector('#editor-tree-rows');
  if (!treeRows) return;

  if (items.length === 0) {
    treeRows.innerHTML = '<div class="u-p-20 u-text-center u-text-muted">No documents found</div>';
  } else {
    treeRows.innerHTML = items.map((doc, i) => {
      const idStr = String(doc._id);
      const docMatchesSearch = sq && Object.entries(doc).some(([key, val]) => {
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return key.toLowerCase().includes(sq) || valStr.toLowerCase().includes(sq);
      });
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </div>
        <div class="editor-doc-children">
          ${Object.entries(doc).map(([key, val]) => {
        let type = 'String';
        if (val === null) type = 'Null';
        else if (Array.isArray(val)) type = 'Array';
        else if (typeof val === 'number') {
          type = Number.isInteger(val) ? 'Int32' : 'Double';
        } else if (typeof val === 'boolean') type = 'Boolean';
        else if (typeof val === 'object') type = 'Object';
        // Basic detection for ObjectId if it's a 24-char hex string coming from the driver's serialization
        if (key === '_id' || (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val))) {
          if (key === '_id' || type === 'String') type = 'ObjectId';
        }

        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return `
            <div class="editor-field-row" draggable="true" data-index="${i}" data-key="${escapeHtml(key)}" data-field="${escapeHtml(key)}" data-type="${type}" data-value='${escapeHtml(JSON.stringify(val))}'>
              <span class="editor-field-indent"></span>
              <span class="editor-field-key" data-index="${i}" data-key="${escapeHtml(key)}" data-type="key">${sq ? highlightText(key, sq) : escapeHtml(key)}</span>
              <span class="editor-field-value" data-index="${i}" data-key="${escapeHtml(key)}" data-type="value">${sq ? highlightText(valStr, sq) : escapeHtml(valStr)}</span>
              <span class="editor-field-type u-text-muted u-font-xs u-ml-8">${type}</span>
            </div>
            `;
      }).join('')}
        </div>
      </div>
    `}).join('');
  }
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

    tableHead.innerHTML = '<th class="editor-table-th editor-table-th-num">#<span class="col-resize-handle"></span></th>' +
      columns.map(col => `<th class="editor-table-th" data-col="${col}" draggable="true" data-field="${col}">${col}<span class="col-resize-handle"></span></th>`).join('');

    tableBody.innerHTML = items.map((doc, i) => `
      <tr class="editor-table-row" data-index="${i}">
        <td class="editor-table-td editor-table-td-num">
          <div class="u-flex u-items-center u-gap-4">
            <span>${i + 1 + skip}</span>
            <button class="btn-delete-doc btn-icon btn-sm u-opacity-0 hover-opacity-100" data-index="${i}" title="Delete document">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
        ${columns.map(col => {
      const val = doc[col];
      let type = 'String';
      if (val === null) type = 'Null';
      else if (Array.isArray(val)) type = 'Array';
      else if (typeof val === 'number') {
        type = Number.isInteger(val) ? 'Int32' : 'Double';
      } else if (typeof val === 'boolean') type = 'Boolean';
      else if (typeof val === 'object') type = 'Object';
      if (col === '_id' || (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val))) {
        if (col === '_id' || type === 'String') type = 'ObjectId';
      }

      let displayVal = val === undefined ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
      const fullVal = val === undefined ? '' : JSON.stringify(val);
      if (displayVal.length > 50) displayVal = displayVal.substring(0, 50) + '...';
      const cellHtml = sq ? highlightText(displayVal, sq) : escapeHtml(displayVal);
      return `
            <td class="editor-table-td" draggable="true" title="${val === undefined ? '' : JSON.stringify(val).replace(/"/g, '&quot;')}"
                data-index="${i}" data-col="${col}" data-field="${col}" data-type="${type}"
                data-value='${escapeHtml(fullVal)}'>
              <div class="table-cell-content">
                <span class="cell-text">${cellHtml}</span>
                ${val !== undefined ? `
                  <button class="btn-copy-cell" data-value='${escapeHtml(fullVal)}' title="Copy full value">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
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
