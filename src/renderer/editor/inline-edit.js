import { state } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { currentRenderedItems, runEditorQuery } from './query.js';

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

export function startJsonInlineEdit(event, docIndex) {
  const container = event.target.closest('.editor-json-doc-item');
  if (!container) return;
  if (container.querySelector('textarea')) return;

  const doc = currentRenderedItems[docIndex];
  if (!doc) return;

  const originalHtml = container.innerHTML;
  const originalJson = JSON.stringify(doc, null, 2);

  const textarea = document.createElement('textarea');
  textarea.className = 'editor-json-inline-textarea';
  textarea.value = originalJson;
  textarea.spellcheck = false;

  // Auto-resize
  const updateHeight = () => {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight + 5) + 'px';
  };

  container.innerHTML = '';
  container.appendChild(textarea);
  updateHeight();
  textarea.focus();

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;

    if (save && textarea.value !== originalJson) {
      try {
        const updatedDoc = JSON.parse(textarea.value);

        // Safety check for _id
        if (String(updatedDoc._id) !== String(doc._id)) {
          throw new Error('Changing _id is not allowed.');
        }

        showLoading('Updating document...');
        const result = await window.api.updateDocument(
          state.editor.side,
          state.editor.db,
          state.editor.coll,
          doc._id,
          updatedDoc
        );
        hideLoading();

        if (result.error) throw new Error(result.error);
        toast('Document updated', 'success');
        runEditorQuery();
      } catch (err) {
        toast(err.message, 'error');
        container.innerHTML = originalHtml;
      }
    } else {
      container.innerHTML = originalHtml;
    }
  };

  textarea.onblur = () => finish(true);
  textarea.oninput = updateHeight;
  textarea.onkeydown = (e) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter for a new line
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + "\n" + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        updateHeight();
      } else {
        // Enter only for saving
        e.preventDefault();
        finish(true);
      }
    }
    if (e.key === 'Escape') {
      finish(false);
    }
  };
};
