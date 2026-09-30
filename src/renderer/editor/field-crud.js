/* =============================================
   Editor — Per-Field Add / Delete
   ============================================= */

import { state } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { parseRelaxedJSON, UNSAFE_KEYS, closestTarget } from '../utils/dom.js';
import { currentRenderedItems, runEditorQuery, writeIdFor } from './query.js';
import { toggleStagedRemoval } from './pending-stage.js';
import { hasPending } from './pending-edits.js';

function deleteFieldFromRow(btn) {
  const docIndex = parseInt(btn.dataset.index, 10);
  const path = btn.dataset.path;
  const row = btn.closest('.editor-field-row');
  if (!row || !path) return;

  toggleStagedRemoval(row, docIndex, path);
}


function addFieldFromRow(btn) {
  const addRow = btn.closest('.editor-field-add-row');
  if (!addRow || addRow.querySelector('.editor-field-add-form')) return;

  const docIndex = parseInt(btn.dataset.index, 10);
  const parentPath = btn.dataset.path || '';
  const doc = currentRenderedItems[docIndex];
  if (!doc) return;
  if (hasPending()) {
    toast('Apply or discard your pending changes before adding a field', 'warning');
    return;
  }

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
    if (UNSAFE_KEYS.has(name)) { toast('Invalid field name', 'error'); return; }
    done = true;

    const path = parentPath ? `${parentPath}.${name}` : name;

    const raw = valInput.value;
    let value = raw;
    if (raw.trim() !== '') {
      try { value = parseRelaxedJSON(raw); } catch (_) { value = raw; }
    }

    const side = state.editor.side || 'source';
    showLoading('Adding field...');
    let result;
    try {
      result = await window.api.setField(side, state.editor.db, state.editor.coll, writeIdFor(docIndex), path, value);
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

document.addEventListener('click', (e) => {
  const delBtn = closestTarget(e, '.editor-field-delete');
  if (delBtn) { e.preventDefault(); e.stopPropagation(); deleteFieldFromRow(delBtn); return; }

  const addBtn = closestTarget(e, '.editor-field-add');
  if (addBtn) { e.preventDefault(); e.stopPropagation(); addFieldFromRow(addBtn); return; }
});
