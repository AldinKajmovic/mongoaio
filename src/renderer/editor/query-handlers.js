import { state } from '../utils/state.js';
import {
  currentRenderedItems, expandedDocs, runEditorQuery, openEditorEditModal
} from './query.js';
import {
  startInlineEdit, startHeaderEdit, startJsonInlineEdit
} from './inline-edit.js';
import { openDeleteDocsModal } from '../modals/delete-docs.js';
import { copyToClipboard } from '../utils/dom.js';
import { initQueryBuilder } from './query-builder.js';
import { toggleNestedField, showValueViewer, hideValueViewer } from './value-viewer.js';

/**
 * Initialize all query result event listeners
 */
export function initQueryHandlers() {
  // 1. JSON View Delegation
  const jsonView = document.getElementById('editor-data-json');
  if (jsonView) {
    jsonView.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.editor-json-doc-item');
      if (item) startJsonInlineEdit(e, parseInt(item.dataset.index, 10));
    });
  }

  // 2. Tree View Delegation
  const treeRows = document.getElementById('editor-tree-rows');
  if (treeRows) {
    treeRows.addEventListener('click', (e) => {
      // Handle nested field expansion (click on arrow)
      const arrow = e.target.closest('.nested-arrow');
      if (arrow) {
        const row = arrow.closest('.nested-expandable');
        if (row) {
          const sq = document.getElementById('editor-search-input')?.value.toLowerCase() || '';
          toggleNestedField(row, sq);
        }
        return;
      }

      const field = e.target.closest('.editor-field-row');
      if (field) {
        document.querySelectorAll('.editor-field-row.selected, .editor-table-td.selected').forEach(r => r.classList.remove('selected'));
        field.classList.add('selected');
        state.editor.selectedField = {
          key: field.dataset.key,
          value: JSON.parse(field.dataset.value),
          type: field.dataset.type
        };
        return;
      }

      const header = e.target.closest('.editor-doc-header');
      if (header) {
        document.querySelectorAll('.editor-field-row.selected, .editor-table-td.selected').forEach(r => r.classList.remove('selected'));
        state.editor.selectedField = null;

        const row = header.parentElement;
        row.classList.toggle('expanded');
        const idx = parseInt(row.dataset.docIndex, 10) - 1;
        const doc = currentRenderedItems[idx];
        if (doc?._id) {
          const idStr = String(doc._id);
          if (row.classList.contains('expanded')) expandedDocs.add(idStr);
          else expandedDocs.delete(idStr);
        }
      }
    });

    treeRows.addEventListener('dblclick', (e) => {
      const field = e.target.closest('.editor-field-key, .editor-field-value');
      if (field) startInlineEdit(e, parseInt(field.dataset.index, 10), field.dataset.key, field.dataset.type);
    });
  }

  // 3. Table View Delegation
  const tableBody = document.getElementById('editor-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const cell = e.target.closest('.editor-table-td');
      if (cell?.dataset.col) {
        document.querySelectorAll('.editor-table-td.selected, .editor-field-row.selected').forEach(el => el.classList.remove('selected'));
        cell.classList.add('selected');
        state.editor.selectedField = {
          key: cell.dataset.col,
          value: JSON.parse(cell.dataset.value),
          type: cell.dataset.type
        };
        return;
      }

      const row = e.target.closest('.editor-table-row');
      if (row) {
        document.querySelectorAll('.editor-table-td.selected, .editor-field-row.selected').forEach(el => el.classList.remove('selected'));
        state.editor.selectedField = null;
      }
    });

    tableBody.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.editor-table-td');
      if (cell?.dataset.col) {
        startInlineEdit(e, parseInt(cell.dataset.index, 10), cell.dataset.col, 'value');
        return;
      }
      const row = e.target.closest('.editor-table-row');
      if (row) openEditorEditModal(parseInt(row.dataset.index, 10));
    });

    const tableHead = document.getElementById('editor-table-head');
    if (tableHead) {
      tableHead.addEventListener('dblclick', (e) => {
        const th = e.target.closest('.editor-table-th');
        if (th?.dataset.col) startHeaderEdit(e, th.dataset.col);
      });
    }

    // 4. Keyboard Shortcuts (DEL)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Del') {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        // Check for selected field first
        if (state.editor.selectedField) {
          const { key, value, type } = state.editor.selectedField;
          openDeleteDocsModal(formatDocQuery(key, value, type));
          return;
        }

        const hoveredRow = document.querySelector('.editor-doc-row:hover, .editor-table-row:hover');
        if (hoveredRow) {
          const idx = parseInt(hoveredRow.dataset.docIndex || hoveredRow.dataset.index, 10) - (hoveredRow.dataset.docIndex ? 1 : 0);
          const doc = currentRenderedItems[idx];
          if (doc) openDeleteDocsModal(JSON.stringify({ _id: doc._id }, null, 2));
        }
      }
    });

    // 5. Global Document Tool Clicks
    document.addEventListener('click', (e) => {
      // Expand cell value (table view)
      const btnExpand = e.target.closest('.btn-expand-cell');
      if (btnExpand) {
        e.stopPropagation();
        const raw = btnExpand.dataset.value;
        try {
          const val = JSON.parse(raw);
          if (val !== null && typeof val === 'object') {
            showValueViewer(val, btnExpand.closest('.editor-table-td') || btnExpand);
          } else {
            // For long primitive values, show in a simple popover
            showLongValuePopover(raw, btnExpand.closest('.editor-table-td') || btnExpand);
          }
        } catch (_) {
          showLongValuePopover(raw, btnExpand.closest('.editor-table-td') || btnExpand);
        }
        return;
      }

      // Copy cell
      const btnCopy = e.target.closest('.btn-copy-cell');
      if (btnCopy) copyToClipboard(btnCopy.dataset.value);

      // Delete document button
      const btnDelete = e.target.closest('.btn-delete-doc');
      if (btnDelete) {
        e.stopPropagation();
        const idx = parseInt(btnDelete.dataset.index, 10);
        const doc = currentRenderedItems[idx];
        if (doc) openDeleteDocsModal(JSON.stringify({ _id: doc._id }, null, 2));
      }
    });

    // 6. Drag-start delegation for fields (tree rows + table headers/cells)
    document.addEventListener('dragstart', (e) => {
      const dragEl = e.target.closest('[draggable][data-field]');
      if (dragEl && dragEl.dataset.field) {
        // Create a payload with key, value, and type if available
        const payload = {
          field: dragEl.dataset.field,
          value: dragEl.dataset.value ? JSON.parse(dragEl.dataset.value) : "",
          type: dragEl.dataset.type || "String"
        };
        e.dataTransfer.setData('application/json', JSON.stringify(payload));
        e.dataTransfer.setData('text/plain', dragEl.dataset.field);
        e.dataTransfer.effectAllowed = 'copy';
      }
    });

    // 7. Initialize query builder panel (dropzone, clear, run)
    initQueryBuilder();
  }

  /**
   * Show a simple popover for long primitive values in table cells.
   */
  function showLongValuePopover(text, anchorEl) {
    hideValueViewer();
    const popover = document.createElement('div');
    popover.className = 'value-viewer-popover';
    const body = document.createElement('div');
    body.className = 'value-viewer-body value-viewer-text';
    // SECURITY: textContent to prevent XSS
    body.textContent = text;
    popover.appendChild(body);
    document.body.appendChild(popover);

    const rect = anchorEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= 200 ? rect.bottom + 4 : rect.top - popover.offsetHeight - 4;
    popover.style.top = `${Math.max(4, top)}px`;
    popover.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 8))}px`;

    const handler = (e) => {
      if (!popover.contains(e.target)) {
        popover.remove();
        document.removeEventListener('click', handler);
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
  }

  /**
   * Format a key/value pair into a pretty query string for the delete modal.
   */
  function formatDocQuery(key, val, type) {
    let valStr = JSON.stringify(val, null, 2);

    // Use shell-like constructors for specific types to match user expectation
    if (type === 'Int32' && Number.isInteger(val)) {
      valStr = `NumberInt(${val})`;
    } else if (type === 'ObjectId' && typeof val === 'string') {
      valStr = `ObjectId("${val}")`;
    } else if (type === 'Double' && typeof val === 'number') {
      valStr = `Double(${val})`;
    } else if (type === 'Date' && typeof val === 'string') {
      valStr = `ISODate("${val}")`;
    }

    return `{\n  "${key}": ${valStr}\n}`;
  }
}
