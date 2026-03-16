import { elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import { formatValue, getNestedValue } from '../utils/dom.js';

let modalCallback = null;

export function openModal(title, content, onConfirm) {
  elements.modalTitle.textContent = title;
  elements.modalEditor.value = content;
  elements.modalEditor.style.display = 'block';
  elements.modalSyncList.style.display = 'none';
  elements.modalError.style.display = 'none';
  modalCallback = onConfirm;
  elements.modalOverlay.style.display = 'flex';
  elements.modalEditor.focus();
}

export function openSyncModal(title, fields, values, initialSelection, onConfirm) {
  elements.modalTitle.textContent = title;
  elements.modalEditor.style.display = 'none';
  elements.modalSyncList.style.display = 'block';
  elements.modalError.style.display = 'none';

  const allSelected = initialSelection.length === fields.length;

  elements.modalSyncList.innerHTML = `
    <div class="sync-modal-header">
      <label><input type="checkbox" id="sync-all-fields" ${allSelected ? 'checked' : ''}> <strong>Select All</strong></label>
    </div>
    <div class="sync-modal-fields">
      ${fields.map(f => `
        <div class="sync-modal-item">
          <label>
            <input type="checkbox" class="sync-modal-checkbox" data-field="${f}" ${initialSelection.includes(f) ? 'checked' : ''}>
            <span class="sync-modal-field-name">${f}</span>
            <div class="sync-modal-preview">${formatValue(getNestedValue(values, f))}</div>
          </label>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('sync-all-fields').onchange = (e) => {
    elements.modalSyncList.querySelectorAll('.sync-modal-checkbox').forEach(cb => cb.checked = e.target.checked);
  };

  modalCallback = () => {
    const selected = [];
    elements.modalSyncList.querySelectorAll('.sync-modal-checkbox:checked').forEach(cb => selected.push(cb.dataset.field));
    if (selected.length === 0) {
      toast('Please select at least one field', 'warning');
      return false;
    }
    return onConfirm(selected);
  };

  elements.modalOverlay.style.display = 'flex';
}

export function closeModal() {
  elements.modalOverlay.style.display = 'none';
  modalCallback = null;
}

export function confirmDialog(title, message = '') {
  return new Promise((resolve) => {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmOverlay.style.display = 'flex';

    const cleanup = () => {
      elements.confirmOverlay.style.display = 'none';
      elements.confirmOk.removeEventListener('click', onOk);
      elements.confirmCancel.removeEventListener('click', onCancel);
      elements.confirmClose.removeEventListener('click', onCancel);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    elements.confirmOk.addEventListener('click', onOk);
    elements.confirmCancel.addEventListener('click', onCancel);
    elements.confirmClose.addEventListener('click', onCancel);
  });
}

// --- Listeners ---
if (elements.modalClose) elements.modalClose.addEventListener('click', closeModal);
if (elements.modalCancel) elements.modalCancel.addEventListener('click', closeModal);
if (elements.modalOverlay) {
  elements.modalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.modalOverlay) closeModal();
  });
}

if (elements.modalConfirm) {
  elements.modalConfirm.addEventListener('click', async () => {
    if (!modalCallback) return;
    const json = elements.modalEditor.value;
    try {
      const success = await modalCallback(json);
      if (success) closeModal();
    } catch (err) {
      elements.modalError.textContent = err.message;
      elements.modalError.style.display = 'block';
    }
  });
}

if (elements.confirmOverlay) {
  elements.confirmOverlay.addEventListener('click', (e) => {
    if (e.target === elements.confirmOverlay) elements.confirmOverlay.style.display = 'none';
  });
}
