import { escapeHtml } from '../utils/dom.js';
import { state } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { currentRenderedItems, currentEJSONItems, runEditorQuery, writeIdFor } from './query.js';
import { parseTypedInline } from './value-parse.js';
import { stageValueEdit } from './pending-stage.js';
import { hasPending } from './pending-edits.js';

/**
 * Write a single value straight to MongoDB and refresh. Used by the table view,
 * which has no expansion state to lose. Tree-view edits are staged instead —
 * see pending-stage.js.
 */
async function saveValueImmediately(el, docIndex, fieldPath, rawValue, originalHtml) {
  const doc = currentRenderedItems[docIndex];
  if (!doc) return;

  showLoading('Saving...');
  try {
    const result = await window.api.patchDocument(
      state.editor.side,
      state.editor.db,
      state.editor.coll,
      writeIdFor(docIndex),
      { [fieldPath]: parseTypedInline(rawValue).value }
    );
    if (result.error) throw new Error(result.error);
    toast('Value updated', 'success');
    runEditorQuery();
  } catch (err) {
    toast(err.message, 'error');
    el.innerHTML = originalHtml;
  } finally {
    hideLoading();
  }
}

/** Rename a top-level key by replacing the document. */
async function renameKey(el, docIndex, fieldPath, newKey, originalHtml) {
  const doc = currentRenderedItems[docIndex];
  if (!doc) return;

  if (fieldPath.includes('.')) {
    el.innerHTML = originalHtml;
    toast('Renaming a nested field is not supported yet', 'error');
    return;
  }
  if (hasPending()) {
    el.innerHTML = originalHtml;
    toast('Apply or discard your pending changes before renaming a field', 'warning');
    return;
  }

  // Rebuild from the Extended JSON copy: the moved value keeps its BSON type.
  const updatedDoc = { ...(currentEJSONItems[docIndex] || doc) };
  updatedDoc[newKey] = updatedDoc[fieldPath];
  delete updatedDoc[fieldPath];

  showLoading('Renaming field...');
  try {
    const result = await window.api.updateDocument(
      state.editor.side, state.editor.db, state.editor.coll, writeIdFor(docIndex), updatedDoc
    );
    if (result.error) throw new Error(result.error);
    toast('Field renamed', 'success');
    runEditorQuery();
  } catch (err) {
    toast(err.message, 'error');
    el.innerHTML = originalHtml;
  } finally {
    hideLoading();
  }
}

export function startInlineEdit(event, docIndex, fieldPath, editType) {
  event.stopPropagation();
  const el = event.target.closest('.editor-field-key, .editor-field-value, .editor-table-td');
  if (!el) return;
  if (el.querySelector('.editor-inline-input')) return;

  const originalHtml = el.innerHTML;
  const originalText = el.innerText;
  const treeRow = el.closest('.editor-field-row');

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalText;
  input.className = 'editor-inline-input';

  const rect = el.getBoundingClientRect();
  input.style.minWidth = (rect.width + 10) + 'px';

  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;

    if (!save || input.value === originalText) {
      el.innerHTML = originalHtml;
      return;
    }

    if (editType === 'value' && treeRow) {
      // Tree view: stage the change so the tree isn't re-rendered (and every
      // expanded branch stays open) until the user confirms.
      if (!stageValueEdit(treeRow, docIndex, fieldPath, input.value)) el.innerHTML = originalHtml;
      return;
    }

    if (editType === 'value') {
      await saveValueImmediately(el, docIndex, fieldPath, input.value, originalHtml);
    } else if (editType === 'key') {
      await renameKey(el, docIndex, fieldPath, input.value, originalHtml);
    }
  };

  input.onblur = () => finish(true);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
};

export function startHeaderEdit(event, fieldName) {
  if (fieldName === '_id') {
    toast('Cannot rename _id field', 'warning');
    return;
  }

  const el = event.target.closest('.editor-table-th');
  if (!el) return;
  if (el.querySelector('.editor-inline-input')) return;

  const originalText = fieldName;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalText;
  input.className = 'editor-inline-input';
  input.style.width = '100%';

  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;

    if (save && input.value !== originalText && input.value.trim() !== '') {
      const newName = input.value.trim();

      try {
        showLoading(`Renaming field ${fieldName} to ${newName} across collection...`);
        const result = await window.api.renameField(
          state.editor.side,
          state.editor.db,
          state.editor.coll,
          fieldName,
          newName
        );
        hideLoading();

        if (result.error) throw new Error(result.error);
        toast(`Field renamed in ${result.modifiedCount} documents`, 'success');
        runEditorQuery();
      } catch (err) {
        toast(err.message, 'error');
        el.innerHTML = `${escapeHtml(originalText)}<span class="col-resize-handle"></span>`;
      }
    } else {
      el.innerHTML = `${escapeHtml(originalText)}<span class="col-resize-handle"></span>`;
    }
  };

  input.onblur = () => finish(true);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
};
