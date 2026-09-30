// =============================================
// Saved Connections Management
// =============================================

import { state, elements, $ } from './state.js';
import { showLoading, hideLoading, toast, setStatus, showView } from './ui.js';
import { shortUrl, escapeHtml } from './dom.js';
import { initEditorResizables } from '../editor/resize.js';
import { loadEditorTree } from '../editor/tree.js';
import { confirmDialog } from '../modals/base.js';
import { openEditConnectionModal } from '../modals/edit-connection.js';

export let savedConnections = {};

function refreshConnectionViews() {
  updateAliasDropdowns();
  populateConnectionList();
}

function editConnection(alias) {
  openEditConnectionModal(alias, savedConnections[alias] || '', async (newAlias, url) => {
    const result = await window.api.updateConnection(alias, newAlias, url);
    if (result && typeof result.error === 'string') return result.error;
    savedConnections = result;
    refreshConnectionViews();
    toast('Connection updated', 'success');
    warnIfPlaintextStorage();
    return null;
  });
}

/** IPC failures come back as { error }; never treat that as a connection map. */
function connectionsOrEmpty(result) {
  if (result && typeof result.error === 'string') {
    toast(`Saved connections: ${result.error}`, 'error');
    return null;
  }
  return result || {};
}

let warnedPlaintext = false;

/** Tell the user (once per session) when connection strings aren't encrypted at rest. */
async function warnIfPlaintextStorage() {
  if (warnedPlaintext) return;
  const info = await window.api.connectionStorageInfo();
  if (!info || info.error || info.encrypted || info.plaintextEntries === 0) return;
  warnedPlaintext = true;
  toast('OS keychain unavailable — saved connection strings (and any passwords in them) are stored unencrypted on disk.', 'warning');
}

export async function loadConnections() {
  savedConnections = connectionsOrEmpty(await window.api.getConnections()) || {};
  updateAliasDropdowns();
  populateConnectionList();
  warnIfPlaintextStorage();
}

export function populateConnectionList() {
  const list = $('#connection-list');
  if (!list) return;

  const aliases = Object.keys(savedConnections);
  if (aliases.length === 0) {
    list.innerHTML = '<span class="connection-list-empty">No saved connections found.</span>';
    return;
  }

  // SECURITY: escapeHtml on alias prevents XSS from crafted connection names
  list.innerHTML = aliases.map(alias => {
    const safeAlias = escapeHtml(alias);
    return `
    <div class="conn-item" data-alias="${safeAlias}">
      <button class="btn btn-secondary btn-sm open-editor-btn" data-alias="${safeAlias}">
        ${safeAlias}
      </button>
      <button class="conn-edit-btn" data-edit-alias="${safeAlias}" title="Edit connection" aria-label="Edit ${safeAlias}">&#9998;</button>
      <button class="conn-remove-btn" data-remove-alias="${safeAlias}" title="Remove connection" aria-label="Remove ${safeAlias}">&times;</button>
    </div>
  `;
  }).join('');
}

async function removeConnection(alias) {
  const confirmed = await confirmDialog('Are you really sure?', `Remove saved connection "${alias}"?`);
  if (!confirmed) return;

  // safeHandler returns { error } on failure — don't let that replace the
  // connections map (it would render a bogus "error" entry in the list).
  const res = await window.api.deleteConnection(alias);
  if (res && res.error) {
    toast(`Failed to remove connection: ${res.error}`, 'error');
    return;
  }

  savedConnections = res;
  refreshConnectionViews();
  toast('Connection removed', 'success');
}

export async function openDbEditorWith(alias) {
  const url = savedConnections[alias];

  elements.urlSource.value = url;
  elements.urlTarget.value = url;

  setStatus('connecting');
  showLoading('Connecting to DB Editor...');

  const result = await window.api.connect(url, url);
  if (result.error) {
    hideLoading();
    setStatus('disconnected');
    toast(`Connection failed: ${result.error}`, 'error');
    return;
  }

  state.connected = true;
  state.sourceUrl = url;
  state.targetUrl = url;
  state.editorOnlyMode = true;

  setStatus('connected');
  elements.btnDisconnect.style.display = 'inline-flex';

  elements.sourceUrlLabel.textContent = `Editor: ${shortUrl(url)}`;
  elements.targetUrlLabel.textContent = "";

  hideLoading();
  toast(`Opened Editor for: ${alias}`, 'success');

  showView('editor');
  initEditorResizables();
  loadEditorTree();
}

export function updateAliasDropdowns() {
  const options = '<option value="">Saved...</option>' +
    Object.keys(savedConnections).sort().map(alias => {
      const safe = escapeHtml(alias);
      return `<option value="${safe}">${safe}</option>`;
    }).join('');

  if (elements.selectSourceSaved) elements.selectSourceSaved.innerHTML = options;
  if (elements.selectTargetSaved) elements.selectTargetSaved.innerHTML = options;
}

// --- Event listeners ---

if (elements.selectSourceSaved) {
  elements.selectSourceSaved.addEventListener('change', (e) => {
    if (e.target.value && savedConnections[e.target.value]) {
      elements.urlSource.value = savedConnections[e.target.value];
    }
  });
}

if (elements.selectTargetSaved) {
  elements.selectTargetSaved.addEventListener('change', (e) => {
    if (e.target.value && savedConnections[e.target.value]) {
      elements.urlTarget.value = savedConnections[e.target.value];
    }
  });
}

if (elements.btnSaveConn) {
  elements.btnSaveConn.onclick = async () => {
    const alias = elements.newConnAlias.value.trim();
    const url = elements.newConnUrl.value.trim();

    if (!alias || !url) {
      return toast('Please enter both alias and URL', 'error');
    }

    if (Object.hasOwn(savedConnections, alias)) {
      const ok = await confirmDialog('Replace connection?', `A connection named "${alias}" already exists. Overwrite it?`);
      if (!ok) return;
    }
    const saved = connectionsOrEmpty(await window.api.saveConnection(alias, url));
    if (!saved) return;
    savedConnections = saved;
    refreshConnectionViews();
    elements.newConnAlias.value = '';
    elements.newConnUrl.value = '';
    toast('Connection saved', 'success');
    warnIfPlaintextStorage();
  };
}

if (elements.connectionPanel) {
  elements.connectionPanel.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.conn-edit-btn');
    if (editBtn && editBtn.dataset.editAlias) {
      editConnection(editBtn.dataset.editAlias);
      return;
    }
    const removeBtn = e.target.closest('.conn-remove-btn');
    if (removeBtn && removeBtn.dataset.removeAlias) {
      removeConnection(removeBtn.dataset.removeAlias);
      return;
    }
    const btn = e.target.closest('.open-editor-btn');
    if (btn && btn.dataset.alias) {
      openDbEditorWith(btn.dataset.alias);
    }
  });
}
// Call on load
loadConnections();
