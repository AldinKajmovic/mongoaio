import { state } from '../utils/state.js';
import { showLoading, hideLoading, toast, confirmToast } from '../utils/ui.js';
import { parseRelaxedJSON } from '../utils/dom.js';
import { currentRenderedItems, runEditorQuery } from './query.js';

// Field names that could pollute Object.prototype — mirror the backend/dom.js guard.
const UNSAFE_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

export function startInlineEdit(event, docIndex, fieldPath, editType) {
  event.stopPropagation();
  const el = event.target.closest('.editor-field-key, .editor-field-value, .editor-table-td');
  if (!el) return;
  // If already editing, ignore
  if (el.querySelector('.editor-inline-input')) return;

  const originalHtml = el.innerHTML;
  const originalText = el.innerText;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalText;
  input.className = 'editor-inline-input';

  // Style it to match current size roughly
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

    if (save && input.value !== originalText) {
      const newVal = input.value;
      const doc = currentRenderedItems[docIndex];

      try {
        if (editType === 'value') {
          // Parse value
          let parsedVal = newVal;
          if (newVal === 'true') parsedVal = true;
          else if (newVal === 'false') parsedVal = false;
          else if (newVal === 'null') parsedVal = null;
          else if (!isNaN(newVal) && newVal.trim() !== '') {
            if (newVal.length > 1 && newVal.startsWith('0') && !newVal.includes('.')) parsedVal = newVal;
            else parsedVal = Number(newVal);
          } else {
            try {
              if ((newVal.startsWith('{') && newVal.endsWith('}')) || (newVal.startsWith('[') && newVal.endsWith(']'))) {
                parsedVal = JSON.parse(newVal);
              }
            } catch (e) { }
          }

          showLoading('Saving...');
          const result = await window.api.patchDocument(
            state.editor.side,
            state.editor.db,
            state.editor.coll,
            doc._id,
            { [fieldPath]: parsedVal }
          );
          hideLoading();
          if (result.error) throw new Error(result.error);
          toast('Value updated', 'success');
        } else if (editType === 'key') {
          // Rename key
          const updatedDoc = { ...doc };
          updatedDoc[newVal] = updatedDoc[fieldPath];
          delete updatedDoc[fieldPath];

          showLoading('Renaming field...');
          const result = await window.api.updateDocument(
            state.editor.side,
            state.editor.db,
            state.editor.coll,
            doc._id,
            updatedDoc
          );
          hideLoading();
          if (result.error) throw new Error(result.error);
          toast('Field renamed', 'success');
        }
        runEditorQuery();
      } catch (err) {
        toast(err.message, 'error');
        el.innerHTML = originalHtml;
      }
    } else {
      el.innerHTML = originalHtml;
    }
  };

  input.onblur = () => finish(true);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
};


/**
 * Remove a single field from a document via unsetField (confirmed first).
 */
function deleteFieldFromRow(btn) {
  const docIndex = parseInt(btn.dataset.index, 10);
  const path = btn.dataset.path;
  const doc = currentRenderedItems[docIndex];
  if (!doc || !path) return;
  if (path === '_id') { toast('Cannot remove the _id field', 'warning'); return; }

  confirmToast(`Remove field "${path}"?`, async () => {
    const side = state.editor.side || 'source';
    showLoading('Removing field...');
    let result;
    try {
      result = await window.api.unsetField(side, state.editor.db, state.editor.coll, doc._id, path);
    } catch (err) {
      result = { error: err.message };
    }
    hideLoading();
    if (!result || result.error) {
      toast(`Error: ${result?.error || 'Failed to remove field'}`, 'error');
      return;
    }
    toast('Field removed', 'success');
    runEditorQuery();
  });
}

/**
 * Turn the "+ add field" row into an inline name/value form. On save, call
 * setField with (parentPath + name). The value is parsed with parseRelaxedJSON
 * so numbers/booleans/objects and Extended JSON ({"$oid":...}) work; anything
 * that doesn't parse is stored verbatim as a string.
 */
function addFieldFromRow(btn) {
  const addRow = btn.closest('.editor-field-add-row');
  if (!addRow || addRow.querySelector('.editor-field-add-form')) return;

  const docIndex = parseInt(btn.dataset.index, 10);
  const parentPath = btn.dataset.path || '';
  const doc = currentRenderedItems[docIndex];
  if (!doc) return;

  const originalHtml = addRow.innerHTML;

  const form = document.createElement('span');
  form.className = 'editor-field-add-form';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'editor-inline-input editor-add-name';
  nameInput.placeholder = 'field name';

  const valInput = document.createElement('input');
  valInput.type = 'text';
  valInput.className = 'editor-inline-input editor-add-value';
  valInput.placeholder = 'value';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm editor-add-save';
  saveBtn.textContent = 'Add';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost btn-sm editor-add-cancel';
  cancelBtn.textContent = 'Cancel';

  form.appendChild(nameInput);
  form.appendChild(valInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);

  addRow.innerHTML = '';
  addRow.appendChild(form);
  nameInput.focus();

  let done = false;
  const restore = () => { if (!done) { done = true; addRow.innerHTML = originalHtml; } };

  const save = async () => {
    if (done) return;
    const name = nameInput.value.trim();
    if (!name) { toast('Field name is required', 'warning'); nameInput.focus(); return; }
    if (UNSAFE_FIELD_NAMES.has(name)) { toast('Invalid field name', 'error'); return; }
    done = true;

    const path = parentPath ? `${parentPath}.${name}` : name;

    // Parse the value; fall back to the raw string when it isn't valid JSON.
    const raw = valInput.value;
    let value = raw;
    if (raw.trim() !== '') {
      try { value = parseRelaxedJSON(raw); } catch (_) { value = raw; }
    }

    const side = state.editor.side || 'source';
    showLoading('Adding field...');
    let result;
    try {
      result = await window.api.setField(side, state.editor.db, state.editor.coll, doc._id, path, value);
    } catch (err) {
      result = { error: err.message };
    }
    hideLoading();
    if (!result || result.error) {
      toast(`Error: ${result?.error || 'Failed to add field'}`, 'error');
      addRow.innerHTML = originalHtml;
      return;
    }
    toast('Field added', 'success');
    runEditorQuery();
  };

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', restore);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); valInput.focus(); }
    if (e.key === 'Escape') restore();
  });
  valInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') restore();
  });
}

// Delegated once at module load — the buttons live inside dynamically
// re-rendered tree rows, so we bind on document and match via closest().
document.addEventListener('click', (e) => {
  const delBtn = e.target.closest('.editor-field-delete');
  if (delBtn) { e.preventDefault(); e.stopPropagation(); deleteFieldFromRow(delBtn); return; }

  const addBtn = e.target.closest('.editor-field-add');
  if (addBtn) { e.preventDefault(); e.stopPropagation(); addFieldFromRow(addBtn); return; }
});

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
        el.innerHTML = originalText + '<span class="col-resize-handle"></span>';
      }
    } else {
      el.innerHTML = originalText + '<span class="col-resize-handle"></span>';
    }
  };

  input.onblur = () => finish(true);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
};
