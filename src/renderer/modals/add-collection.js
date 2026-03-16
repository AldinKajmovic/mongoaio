import { $ } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { renderEditorTree } from '../editor/tree-renderer.js';
import { buildCollectionOptions } from './add-collection-options.js';

let currentAlias = null;
let currentDb = null;
let activeTab = 'options';

export function openAddCollectionModal(alias, dbName) {
  const overlay = $('#add-coll-overlay');
  if (!overlay) return;
  currentAlias = alias;
  currentDb = dbName;
  resetForm();
  $('#add-coll-context').textContent = `${alias}  >  ${dbName}`;
  overlay.style.display = 'flex';
  $('#add-coll-name').focus();
}

export function closeAddCollectionModal() {
  const overlay = $('#add-coll-overlay');
  if (overlay) overlay.style.display = 'none';
}

function switchTab(tabName) {
  activeTab = tabName;
  const tabs = document.querySelectorAll('.add-coll-tab');
  const panels = document.querySelectorAll('.add-coll-panel');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  panels.forEach(p => {
    p.style.display = p.id.endsWith(`-${tabName}`) ? '' : 'none';
  });
  const validateBtn = $('#add-coll-validate-json');
  if (validateBtn) {
    validateBtn.style.display = (tabName === 'storage' || tabName === 'validator') ? '' : 'none';
  }
}

function handleTypeChange() {
  const selected = document.querySelector('input[name="add-coll-type"]:checked');
  if (!selected) return;
  const type = selected.value;
  const sections = {
    capped: $('#add-coll-capped-fields'),
    timeseries: $('#add-coll-ts-fields'),
    clustered: $('#add-coll-clustered-fields'),
  };
  Object.entries(sections).forEach(([key, el]) => {
    if (el) el.style.display = (key === type) ? '' : 'none';
  });
}

async function performCreateCollection() {
  const collName = $('#add-coll-name')?.value.trim();
  if (!collName) {
    showError('Collection name is required');
    return;
  }
  hideError();

  let options;
  try {
    options = buildCollectionOptions();
  } catch (err) {
    showError(err.message);
    return;
  }

  showLoading(`Creating collection ${collName}...`);
  try {
    const { ensureActive } = await import('../editor/tree-actions.js');
    await ensureActive(currentAlias);

    const result = await window.api.createCollection('source', currentDb, collName, options);
    if (result.error) throw new Error(result.error);

    toast(`Collection ${collName} created`, 'success');
    closeAddCollectionModal();
    renderEditorTree();
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
  }
}

function validateActiveJson() {
  const editorId = activeTab === 'storage'
    ? '#add-coll-storage-editor'
    : '#add-coll-validator-editor';
  const textarea = $(editorId);
  if (!textarea) return;
  try {
    JSON.parse(textarea.value);
    toast('Valid JSON', 'success');
  } catch (err) {
    showError(`Invalid JSON: ${err.message}`);
  }
}

function syncLineNumbers(textarea, lineNumEl) {
  if (!textarea || !lineNumEl) return;
  const lines = textarea.value.split('\n').length;
  lineNumEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  lineNumEl.scrollTop = textarea.scrollTop;
}

function showError(msg) {
  const el = $('#add-coll-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideError() {
  const el = $('#add-coll-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function resetForm() {
  hideError();
  activeTab = 'options';
  $('#add-coll-name').value = '';
  // Reset radios
  const defaultRadio = document.querySelector('input[name="add-coll-type"][value="default"]');
  if (defaultRadio) defaultRadio.checked = true;
  handleTypeChange();
  // Reset fields
  ['#add-coll-capped-size', '#add-coll-capped-max', '#add-coll-ts-timefield',
    '#add-coll-ts-metafield', '#add-coll-ts-expire', '#add-coll-clustered-name'
  ].forEach(sel => { const el = $(sel); if (el) el.value = ''; });
  // Reset editors
  const storageEd = $('#add-coll-storage-editor');
  if (storageEd) storageEd.value = '{\n}';
  const validatorEd = $('#add-coll-validator-editor');
  if (validatorEd) validatorEd.value = '{\n}';
  // Reset selects
  const levelSel = $('#add-coll-validation-level');
  if (levelSel) levelSel.value = 'strict';
  const actionSel = $('#add-coll-validation-action');
  if (actionSel) actionSel.value = 'error';
  // Reset collation
  const localeSel = $('#add-coll-col-locale');
  if (localeSel) localeSel.value = 'en_US';
  ['#add-coll-col-strength', '#add-coll-col-caselevel', '#add-coll-col-casefirst',
    '#add-coll-col-numeric', '#add-coll-col-alternate', '#add-coll-col-maxvar',
    '#add-coll-col-backwards', '#add-coll-col-normalization'
  ].forEach(sel => { const el = $(sel); if (el) el.value = ''; });
  // Reset tabs
  switchTab('options');
  // Reset create button
  const createBtn = $('#add-coll-create');
  if (createBtn) createBtn.disabled = true;
}

function updateCreateButton() {
  const btn = $('#add-coll-create');
  const name = $('#add-coll-name')?.value.trim();
  if (btn) btn.disabled = !name;
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
  const overlay = $('#add-coll-overlay');
  if (!overlay) return;

  // Close handlers
  $('#add-coll-close')?.addEventListener('click', closeAddCollectionModal);
  $('#add-coll-cancel')?.addEventListener('click', closeAddCollectionModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAddCollectionModal();
  });

  // Create
  $('#add-coll-create')?.addEventListener('click', performCreateCollection);

  // Name input
  const nameInput = $('#add-coll-name');
  nameInput?.addEventListener('input', updateCreateButton);
  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAddCollectionModal();
  });

  // Tabs
  $('#add-coll-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.add-coll-tab');
    if (tab) switchTab(tab.dataset.tab);
  });

  // Radio buttons
  document.querySelectorAll('input[name="add-coll-type"]').forEach(radio => {
    radio.addEventListener('change', handleTypeChange);
  });

  // Validate JSON button
  $('#add-coll-validate-json')?.addEventListener('click', validateActiveJson);

  // Line numbers sync for editors
  const storageEd = $('#add-coll-storage-editor');
  const storageLn = $('#add-coll-storage-lines');
  if (storageEd && storageLn) {
    storageEd.addEventListener('input', () => syncLineNumbers(storageEd, storageLn));
    storageEd.addEventListener('scroll', () => { storageLn.scrollTop = storageEd.scrollTop; });
  }
  const validatorEd = $('#add-coll-validator-editor');
  const validatorLn = $('#add-coll-validator-lines');
  if (validatorEd && validatorLn) {
    validatorEd.addEventListener('input', () => syncLineNumbers(validatorEd, validatorLn));
    validatorEd.addEventListener('scroll', () => { validatorLn.scrollTop = validatorEd.scrollTop; });
  }
});
