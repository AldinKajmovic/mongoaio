import { state } from '../utils/state.js';
import {
  currentRenderedItems, currentEJSONItems, expandedDocs, openEditorEditModal
} from './query.js';
import { startInlineEdit, startHeaderEdit } from './inline-edit.js';
import { startJsonInlineEdit } from './json-edit.js';
import { openDeleteDocsModal } from '../modals/delete-docs.js';
import { copyToClipboard, closestTarget } from '../utils/dom.js';
import { initQueryBuilder } from './query-builder.js';
import { toggleNestedField, showValueViewer, hideValueViewer } from './value-viewer.js';
import { elementValue, elementValueText, previewJson } from './value-store.js';

const MAX_DRAG_VALUE = 2000;

/**
 * Initialize all query result event listeners
 */
export function initQueryHandlers() {
  const jsonView = document.getElementById('editor-data-json');
  if (jsonView) {
    jsonView.addEventListener('dblclick', (e) => {
      const item = closestTarget(e, '.editor-json-doc-item');
      if (item) startJsonInlineEdit(e, parseInt(item.dataset.index, 10));
    });
    jsonView.addEventListener('click', (e) => {
      if (closestTarget(e, '.btn-copy-json')) {
        copyToClipboard(JSON.stringify(currentEJSONItems, null, 2));
      }
    });
  }

  const treeRows = document.getElementById('editor-tree-rows');
  if (treeRows) {
    treeRows.addEventListener('click', (e) => {
      const arrow = closestTarget(e, '.nested-arrow');
      if (arrow) {
        const row = arrow.closest('.nested-expandable');
        if (row) {
          const sq = (/** @type {HTMLInputElement | null} */ (document.getElementById('editor-search-input')))?.value.toLowerCase() || '';
          toggleNestedField(row, sq);
        }
        return;
      }

      const field = closestTarget(e, '.editor-field-row');
      if (field) {
        document.querySelectorAll('.editor-field-row.selected, .editor-table-td.selected').forEach(r => r.classList.remove('selected'));
        field.classList.add('selected');
        state.editor.selectedField = {
          key: field.dataset.path || field.dataset.key,
          value: elementValue(field),
          type: field.dataset.type
        };
        return;
      }

      const header = closestTarget(e, '.editor-doc-header');
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
      const field = closestTarget(e, '.editor-field-key, .editor-field-value');
      if (!field) return;
      const path = (/** @type {HTMLElement | null} */ (field.closest('.editor-field-row')))?.dataset.path || field.dataset.key;
      startInlineEdit(e, parseInt(field.dataset.index, 10), path, field.dataset.type);
    });
  }

  const tableBody = document.getElementById('editor-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const cell = closestTarget(e, '.editor-table-td');
      if (cell?.dataset.col) {
        document.querySelectorAll('.editor-table-td.selected, .editor-field-row.selected').forEach(el => el.classList.remove('selected'));
        cell.classList.add('selected');
        state.editor.selectedField = {
          key: cell.dataset.col,
          value: elementValue(cell),
          type: cell.dataset.type
        };
        return;
      }

      const row = closestTarget(e, '.editor-table-row');
      if (row) {
        document.querySelectorAll('.editor-table-td.selected, .editor-field-row.selected').forEach(el => el.classList.remove('selected'));
        state.editor.selectedField = null;
      }
    });

    tableBody.addEventListener('dblclick', (e) => {
      const cell = closestTarget(e, '.editor-table-td');
      if (cell?.dataset.col) {
        startInlineEdit(e, parseInt(cell.dataset.index, 10), cell.dataset.col, 'value');
        return;
      }
      const row = closestTarget(e, '.editor-table-row');
      if (row) openEditorEditModal(parseInt(row.dataset.index, 10));
    });

    const tableHead = document.getElementById('editor-table-head');
    if (tableHead) {
      tableHead.addEventListener('dblclick', (e) => {
        const th = closestTarget(e, '.editor-table-th');
        if (th?.dataset.col) startHeaderEdit(e, th.dataset.col);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Del') {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        if (state.editor.selectedField) {
          const { key, value, type } = state.editor.selectedField;
          openDeleteDocsModal(formatDocQuery(key, value, type));
          return;
        }

        const hoveredRow = /** @type {HTMLElement | null} */ (document.querySelector('.editor-doc-row:hover, .editor-table-row:hover'));
        if (hoveredRow) {
          const idx = parseInt(hoveredRow.dataset.docIndex || hoveredRow.dataset.index, 10) - (hoveredRow.dataset.docIndex ? 1 : 0);
          const doc = currentRenderedItems[idx];
          if (doc) openDeleteDocsModal(JSON.stringify({ _id: doc._id }, null, 2));
        }
      }
    });

    document.addEventListener('click', (e) => {
      const btnExpand = closestTarget(e, '.btn-expand-cell');
      if (btnExpand) {
        e.stopPropagation();
        const anchor = btnExpand.closest('.editor-table-td') || btnExpand;
        const val = elementValue(btnExpand);
        if (val !== null && typeof val === 'object') {
          showValueViewer(val, anchor);
        } else {
          showLongValuePopover(String(val ?? ''), anchor);
        }
        return;
      }

      const btnCopy = closestTarget(e, '.btn-copy-cell');
      if (btnCopy) copyToClipboard(elementValueText(btnCopy));

      const btnDelete = closestTarget(e, '.btn-delete-doc');
      if (btnDelete) {
        e.stopPropagation();
        const idx = parseInt(btnDelete.dataset.index, 10);
        const doc = currentRenderedItems[idx];
        if (doc) openDeleteDocsModal(JSON.stringify({ _id: doc._id }, null, 2));
      }
    });

    document.addEventListener('dragstart', (e) => {
      const dragEl = closestTarget(e, '[draggable][data-field]');
      if (dragEl && dragEl.dataset.field) {
        const field = dragEl.dataset.path || dragEl.dataset.field;
        const dragged = elementValue(dragEl);
        const carriable = dragged === undefined ? false
          : (typeof dragged !== 'object' || dragged === null
            || previewJson(dragged, MAX_DRAG_VALUE + 1).length <= MAX_DRAG_VALUE);
        const payload = {
          field,
          value: carriable ? dragged : "",
          type: dragEl.dataset.type || "String"
        };
        e.dataTransfer.setData('application/json', JSON.stringify(payload));
        e.dataTransfer.setData('text/plain', field);
        e.dataTransfer.effectAllowed = 'copy';
      }
    });

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

    if (type === 'Int32' && Number.isInteger(val)) {
      valStr = `NumberInt(${val})`;
    } else if (type === 'ObjectId' && typeof val === 'string') {
      valStr = `ObjectId("${val}")`;
    } else if (type === 'Double' && typeof val === 'number') {
      valStr = `Double(${val})`;
    } else if (type === 'Date' && typeof val === 'string') {
      valStr = `ISODate(${JSON.stringify(val)})`;
    }

    // JSON.stringify quotes and escapes the key, so a `"` in a field name
    // can't break (or widen) the generated delete filter.
    return `{\n  ${JSON.stringify(key)}: ${valStr}\n}`;
  }
}
