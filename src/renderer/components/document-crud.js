import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { getNestedValue, setNestedValue, prettyJson } from '../utils/dom.js';
import { formatFieldValue } from '../utils/json-tree.js';
import { confirmDialog, openModal, openSyncModal } from '../modals/base.js';
import { loadDocuments, renderDocTab } from './document-view.js';

export function resolveDb(side) {
  return side === 'source' ? state.currentSourceDb : state.currentTargetDb;
}

export async function copyDoc(fromSide, toSide, docId) {
  // The same path can be checked on either side (source and target trees each
  // carry a checkbox), so dedupe to a unique set of paths.
  const selectedPaths = new Set();
  document.querySelectorAll(`.field-sync-checkbox[data-doc-id="${docId}"]:checked`).forEach(cb => {
    selectedPaths.add(cb.dataset.field);
  });
  const initiallySelected = [...selectedPaths];

  // Find doc data
  const docItem = state.docComparison.items.find(d => d._id === docId);
  if (!docItem) return;

  const side = fromSide === 'source' ? 'source' : 'target';
  const fromDoc = state.activeDocTab === 'different' ? docItem[side] : docItem;
  const targetDb = resolveDb(toSide);

  if (state.activeDocTab === 'different' || initiallySelected.length > 0) {
    const topLevel = state.activeDocTab === 'different' ? docItem.diffs.filter(d => d.type !== 'same').map(d => d.field) : Object.keys(fromDoc);
    // Nested paths come only from checked tree checkboxes; surface them in the
    // modal too so the user can review/deselect them alongside top-level fields.
    const fieldsToOffer = [...topLevel, ...initiallySelected.filter(f => !topLevel.includes(f))];

    // If we're on "different" tab and nothing was selected, offer all diffs selected
    const selection = initiallySelected.length > 0 ? initiallySelected :
      (state.activeDocTab === 'different' ? fieldsToOffer : []);

    openSyncModal(`Sync Fields to ${toSide}`, fieldsToOffer, fromDoc, selection, async (selectedRaw) => {
      // Drop any path nested under another selected path — $set would otherwise
      // conflict (e.g. both `idCards` and `idCards.0`).
      const selectedFields = selectedRaw.filter(p => !selectedRaw.some(o => o !== p && p.startsWith(`${o}.`)));

      showLoading('Syncing fields...');
      const updates = {};
      selectedFields.forEach(f => { updates[f] = getNestedValue(fromDoc, f); });

      const result = await window.api.patchDocument(toSide, targetDb, state.currentColl, docId, updates);
      hideLoading();

      if (result.error) {
        toast(`Error: ${result.error}`, 'error');
        return false;
      } else {
        toast('Fields synced successfully', 'success');
        // Optimized: mirror the change locally (handles nested dot-paths) and
        // re-render the tab instead of a full reload.
        if (state.activeDocTab === 'different') {
          const destDoc = fromSide === 'source' ? docItem.target : docItem.source;
          selectedFields.forEach(f => {
            const value = getNestedValue(fromDoc, f);
            setNestedValue(destDoc, f, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
            const diffEntry = docItem.diffs?.find(d => d.field === f);
            if (diffEntry) {
              diffEntry.type = 'same';
              diffEntry.sourceValue = getNestedValue(docItem.source, f);
              diffEntry.targetValue = getNestedValue(docItem.target, f);
            }
          });
        }
        renderDocTab(state.activeDocTab);
        return true;
      }
    });
  } else {
    // Full document copy
    const confirmed = await confirmDialog(`Copy entire document to ${toSide}?`, `This will overwrite the document with _id: ${docId} in the ${toSide} database.`);
    if (!confirmed) return;

    showLoading('Copying document...');
    const result = await window.api.copyDocument(fromSide, toSide, resolveDb(fromSide), state.currentColl, docId);
    hideLoading();

    if (result.error) {
      toast(`Error: ${result.error}`, 'error');
    } else {
      toast('Document copied successfully', 'success');
      await loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
    }
  }
};

export async function deleteDoc(side, docId) {
  const confirmed = await confirmDialog(`Delete document from ${side}?`, `This will permanently delete the document with _id: ${docId}. This cannot be undone.`);
  if (!confirmed) return;

  showLoading('Deleting document...');
  const result = await window.api.deleteDocument(side, resolveDb(side), state.currentColl, docId);
  hideLoading();

  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
  } else {
    toast('Document deleted', 'success');
    await loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
  }
};

export async function editDoc(side, docId) {
  showLoading('Loading document...');
  const result = await window.api.getDocument(side, resolveDb(side), state.currentColl, docId);
  hideLoading();

  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
    return;
  }

  const doc = result.document;
  openModal(`Edit Document (${side})`, prettyJson(doc), async (json) => {
    try {
      const parsed = JSON.parse(json);
      showLoading('Updating document...');
      const updateResult = await window.api.updateDocument(side, resolveDb(side), state.currentColl, docId, parsed);
      hideLoading();
      if (updateResult.error) throw new Error(updateResult.error);
      toast('Document updated', 'success');
      await loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
      return true;
    } catch (err) {
      hideLoading();
      throw err;
    }
  });
};

export async function addNewDoc(side) {
  openModal(`Add New Document (${side})`, '{\n  \n}', async (json) => {
    try {
      const parsed = JSON.parse(json);
      showLoading('Inserting document...');
      const result = await window.api.insertDocument(side, resolveDb(side), state.currentColl, parsed);
      hideLoading();
      if (result.error) throw new Error(result.error);
      toast(`Document inserted (id: ${result.insertedId})`, 'success');
      await loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
      return true;
    } catch (err) {
      hideLoading();
      throw err;
    }
  });
};

export function startEditField(side, docId, field) {
  const container = document.getElementById(`field-${side}-${docId}-${field}`);
  const parentField = container.closest('.diff-field');
  if (parentField) parentField.classList.remove('collapsed');

  // Find original value from current page items
  let originalDoc;
  const item = state.docComparison.items.find(d => d._id === docId);
  if (!item) return;

  if (state.activeDocTab === 'different') {
    originalDoc = side === 'source' ? item.source : item.target;
  } else {
    originalDoc = item;
  }

  const rawVal = JSON.stringify(originalDoc[field], null, 2) || String(originalDoc[field]);

  // SECURITY: Using DOM API to set textarea value to prevent XSS from rawVal
  container.innerHTML = `
    <textarea class="inline-edit-input" id="edit-${side}-${docId}-${field}"></textarea>
    <div class="diff-field-actions u-opacity-1 u-pos-abs u-right-4 u-top-4 u-z-10">
      <span class="action-icon save-field-btn" data-side="${side}" data-doc-id="${docId}" data-field="${field}" title="Save">✓</span>
      <span class="action-icon cancel-edit-btn" data-side="${side}" data-doc-id="${docId}" data-field="${field}" title="Cancel">✕</span>
    </div>
  `;
  container.querySelector('textarea').value = rawVal;

  // Auto-resize textarea
  const textarea = container.querySelector('textarea');
  textarea.style.height = 'auto';
  textarea.style.height = (textarea.scrollHeight + 2) + 'px';
  textarea.focus();

  textarea.oninput = () => {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight + 2) + 'px';
  };
};

function cancelEditField(side, docId, field) {
  const container = document.getElementById(`field-${side}-${docId}-${field}`);

  // Find original value from current page items
  let originalDoc;
  const item = state.docComparison.items.find(d => d._id === docId);
  if (!item) return;

  if (state.activeDocTab === 'different') {
    originalDoc = side === 'source' ? item.source : item.target;
  } else {
    originalDoc = item;
  }

  const val = originalDoc[field];
  container.innerHTML = `
    <span class="val-text">${formatFieldValue(val, undefined, false, { path: field, docId })}</span>
    <div class="diff-field-actions">
      <span class="action-icon edit-field-btn" data-side="${side}" data-doc-id="${docId}" data-field="${field}" title="Edit">✎</span>
    </div>
  `;
};

async function saveField(side, docId, field) {
  const container = document.getElementById(`field-${side}-${docId}-${field}`);
  const newValueRaw = document.getElementById(`edit-${side}-${docId}-${field}`).value;

  let newValue;
  try {
    newValue = JSON.parse(newValueRaw);
  } catch (e) {
    newValue = newValueRaw;
  }

  showLoading('Saving field...');
  const result = await window.api.patchDocument(side, resolveDb(side), state.currentColl, docId, { [field]: newValue });
  hideLoading();

  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
  } else {
    toast('Field updated', 'success');
    await loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
  }
}

// Global Event Delegation for CRUD actions on doc items
elements.docContent.addEventListener('click', (e) => {
  const saveBtn = e.target.closest('.save-field-btn');
  if (saveBtn) {
    saveField(saveBtn.dataset.side, saveBtn.dataset.docId, saveBtn.dataset.field);
    return;
  }

  const cancelBtn = e.target.closest('.cancel-edit-btn');
  if (cancelBtn) {
    cancelEditField(cancelBtn.dataset.side, cancelBtn.dataset.docId, cancelBtn.dataset.field);
    return;
  }

  const editBtn = e.target.closest('.edit-field-btn');
  if (editBtn) {
    startEditField(editBtn.dataset.side, editBtn.dataset.docId, editBtn.dataset.field);
    return;
  }
});
