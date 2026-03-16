import { state, elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import {
  currentRenderedItems, expandedDocs, runEditorQuery, openEditorEditModal
} from './query.js';
import {
  startInlineEdit, startHeaderEdit, startJsonInlineEdit
} from './inline-edit.js';
import { openDeleteDocsModal } from '../modals/delete-docs.js';
import { showContextMenu } from './tree-selection.js';
import { copyToClipboard } from '../utils/dom.js';
import { addQbField, initQueryBuilder } from './query-builder.js';

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
      const field = e.target.closest('.editor-field-row');
      if (field) {
        document.querySelectorAll('.editor-field-row.selected').forEach(r => r.classList.remove('selected'));
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
        document.querySelectorAll('.editor-field-row.selected').forEach(r => r.classList.remove('selected'));
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

    treeRows.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const row = e.target.closest('.editor-doc-row');
      const field = e.target.closest('.editor-field-row');
      if (!row) return;

      const idx = parseInt(row.dataset.docIndex, 10) - 1;
      const doc = currentRenderedItems[idx];
      if (!doc) return;

      const items = [];
      if (field) {
        const fieldKey = field.dataset.key;
        const fieldVal = JSON.parse(field.dataset.value);
        const fieldType = field.dataset.type;

        items.push({
          label: `Delete documents where "${fieldKey}" is matched`,
          action: () => openDeleteDocsModal(formatDocQuery(fieldKey, fieldVal, fieldType))
        });
        items.push({ separator: true });
      }

      items.push({ label: 'Edit Document', action: () => openEditorEditModal(idx) });
      items.push({ label: 'Delete this document', action: () => openDeleteDocsModal(JSON.stringify({ _id: doc._id }, null, 2)) });

      showContextMenu(e.clientX, e.clientY, items);
    });

    treeRows.addEventListener('dblclick', (e) => {
      const field = e.target.closest('.editor-field-key, .editor-field-value');
      if (field) startInlineEdit(e, parseInt(field.dataset.index, 10), field.dataset.key, field.dataset.type);
    });
  }

  // 3. Table View Delegation
  const tableBody = document.getElementById('editor-table-body');
  if (tableBody) {
    tableBody.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.editor-table-td');
      if (cell?.dataset.col) {
        startInlineEdit(e, parseInt(cell.dataset.index, 10), cell.dataset.col, 'value');
        return;
      }
      const row = e.target.closest('.editor-table-row');
      if (row) openEditorEditModal(parseInt(row.dataset.index, 10));
    });

    tableBody.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const row = e.target.closest('.editor-table-row');
      if (!row) return;
      const idx = parseInt(row.dataset.index, 10);
      const doc = currentRenderedItems[idx];
      if (!doc) return;

      const items = [
        { label: 'Edit Document', action: () => openEditorEditModal(idx) },
        { label: 'Delete Document(s)', action: () => openDeleteDocsModal(JSON.stringify({ _id: doc._id }, null, 2)) }
      ];
      showContextMenu(e.clientX, e.clientY, items);
    });
  }

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

  // 7. Double-click on tree field key adds to query builder
  if (treeRows) {
    treeRows.addEventListener('dblclick', (e) => {
      const fieldKey = e.target.closest('.editor-field-key');
      if (fieldKey && fieldKey.dataset.key) {
        const row = fieldKey.closest('.editor-field-row');
        const val = row.dataset.value ? JSON.parse(row.dataset.value) : "";
        addQbField(fieldKey.dataset.key, val, row.dataset.type);
      }
    });
  }

  // 8. Double-click on table header adds to query builder
  if (tableHead) {
    tableHead.addEventListener('dblclick', (e) => {
      const th = e.target.closest('.editor-table-th');
      if (th && th.dataset.field) addQbField(th.dataset.field, "", "String");
    });
  }

  // 9. Initialize query builder panel (dropzone, clear, run)
  initQueryBuilder();
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
