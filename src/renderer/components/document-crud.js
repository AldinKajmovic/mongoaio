import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { getNestedValue, setNestedValue, escapeHtml, queryAllHtml } from '../utils/dom.js';
import { formatFieldValue } from '../utils/json-tree.js';
import { confirmDialog, openSyncModal } from '../modals/base.js';
import { loadDocuments, renderDocTab } from './document-view.js';
import { compareItem, compareDoc, compareWriteId, compareIdLabel } from './compare-ids.js';

export function resolveDb(side) {
  return side === 'source' ? state.currentSourceDb : state.currentTargetDb;
}

/** `key` is the compared document's DOM key (see compare-ids.js). */
export async function copyDoc(fromSide, toSide, key) {
  // The same path can be checked on either side (source and target trees each
  // carry a checkbox), so dedupe to a unique set of paths.
  const selectedPaths = new Set();
  queryAllHtml(`.field-sync-checkbox[data-doc-id="${CSS.escape(String(key))}"]:checked`).forEach(cb => {
    selectedPaths.add(cb.dataset.field);
  });
  const initiallySelected = [...selectedPaths];

  const docItem = compareItem(key);
  if (!docItem) return;
  const docId = compareWriteId(key);

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
      // Synced server-side from the stored document so BSON types survive.
      const result = await window.api.syncFields(
        fromSide, toSide, resolveDb(fromSide), targetDb, state.currentColl, docId, selectedFields
      );
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
    const confirmed = await confirmDialog(`Copy entire document to ${toSide}?`, `This will overwrite the document with _id: ${compareIdLabel(key)} in the ${toSide} database.`);
    if (!confirmed) return;

    showLoading('Copying document...');
    const result = await window.api.copyDocument(fromSide, toSide, resolveDb(fromSide), state.currentColl, docId, resolveDb(toSide));
    hideLoading();

    if (result.error) {
      toast(`Error: ${result.error}`, 'error');
    } else {
      toast('Document copied successfully', 'success');
      await loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
    }
  }
};

export async function deleteDoc(side, key) {
  const confirmed = await confirmDialog(`Delete document from ${side}?`, `This will permanently delete the document with _id: ${compareIdLabel(key)}. This cannot be undone.`);
  if (!confirmed) return;

  showLoading('Deleting document...');
  const result = await window.api.deleteDocument(side, resolveDb(side), state.currentColl, compareWriteId(key));
  hideLoading();

  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
  } else {
    toast('Document deleted', 'success');
    await loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
  }
};

export function startEditField(side, key, field) {
  const container = document.getElementById(`field-${side}-${key}-${field}`);
  const parentField = container.closest('.diff-field');
  if (parentField) parentField.classList.remove('collapsed');

  const originalDoc = compareDoc(key, side);
  if (!originalDoc) return;

  const rawVal = JSON.stringify(originalDoc[field], null, 2) || String(originalDoc[field]);

  // SECURITY: Using DOM API to set textarea value to prevent XSS from rawVal
  container.innerHTML = `
    <textarea class="inline-edit-input" id="${escapeHtml(`edit-${side}-${key}-${field}`)}"></textarea>
    <div class="diff-field-actions u-opacity-1 u-pos-abs u-right-4 u-top-4 u-z-10">
      <span class="action-icon save-field-btn" data-side="${escapeHtml(side)}" data-doc-id="${escapeHtml(key)}" data-field="${escapeHtml(field)}" title="Save">✓</span>
      <span class="action-icon cancel-edit-btn" data-side="${escapeHtml(side)}" data-doc-id="${escapeHtml(key)}" data-field="${escapeHtml(field)}" title="Cancel">✕</span>
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

function cancelEditField(side, key, field) {
  const container = document.getElementById(`field-${side}-${key}-${field}`);
  const originalDoc = compareDoc(key, side);
  if (!originalDoc) return;

  const val = originalDoc[field];
  container.innerHTML = `
    <span class="val-text">${formatFieldValue(val, undefined, false, { path: field, docId: key })}</span>
    <div class="diff-field-actions">
      <span class="action-icon edit-field-btn" data-side="${escapeHtml(side)}" data-doc-id="${escapeHtml(key)}" data-field="${escapeHtml(field)}" title="Edit">✎</span>
    </div>
  `;
};

async function saveField(side, key, field) {
  const newValueRaw = /** @type {HTMLTextAreaElement} */ (document.getElementById(`edit-${side}-${key}-${field}`)).value;

  let newValue;
  try {
    newValue = JSON.parse(newValueRaw);
  } catch (e) {
    newValue = newValueRaw;
  }

  showLoading('Saving field...');
  const result = await window.api.patchDocument(side, resolveDb(side), state.currentColl, compareWriteId(key), { [field]: newValue });
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
