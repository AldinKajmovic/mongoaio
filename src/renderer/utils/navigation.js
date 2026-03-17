import { state, elements } from './state.js';
import { showLoading, hideLoading, toast, setStatus, showView } from './ui.js';
import { shortUrl } from './dom.js';
import { renderDatabases } from '../components/database-view.js';
import { loadCollections } from '../components/collection-view.js';
import { loadDocuments } from '../components/document-view.js';
import { initEditorResizables } from '../editor/resize.js';
import { loadEditorTree } from '../editor/tree.js';
import { clearEditorResults } from '../editor/query.js';

export function navigateTo(level, params = {}) {
  // Compare screen 
  showView('main');

  elements.dbView.style.display = 'none';
  elements.collView.style.display = 'none';
  elements.docView.style.display = 'none';

  if (level === 'databases') {
    state.currentSourceDb = null;
    state.currentTargetDb = null;
    state.currentColl = null;
    elements.dbView.style.display = 'block';
    updateBreadcrumb([{ label: 'Databases', level: 'databases' }]);

    const crossBanner = document.getElementById('cross-compare-banner');
    if (crossBanner) crossBanner.style.display = 'none';

    document.querySelectorAll('.item-card').forEach(c => c.classList.remove('selected'));
  } else if (level === 'collections') {
    state.currentSourceDb = params.sourceDb || params.dbName;
    state.currentTargetDb = params.targetDb || params.dbName;
    state.currentColl = null;
    elements.collView.style.display = 'block';

    const dbLabel = state.currentSourceDb === state.currentTargetDb
      ? state.currentSourceDb
      : `${state.currentSourceDb} vs ${state.currentTargetDb}`;

    updateBreadcrumb([
      { label: 'Databases', level: 'databases' },
      { label: dbLabel, level: 'collections' },
    ]);
    loadCollections(state.currentSourceDb, state.currentTargetDb);
  } else if (level === 'documents') {
    state.currentColl = params.collName;
    elements.docView.style.display = 'block';

    const dbLabel = state.currentSourceDb === state.currentTargetDb
      ? state.currentSourceDb
      : `${state.currentSourceDb} vs ${state.currentTargetDb}`;

    updateBreadcrumb([
      { label: 'Databases', level: 'databases' },
      { label: dbLabel, level: 'collections' },
      { label: params.collName, level: 'documents' },
    ]);
    loadDocuments(state.currentSourceDb, state.currentTargetDb, params.collName);
  }
}

export function updateBreadcrumb(items) {
  elements.breadcrumb.innerHTML = items.map((item, i) => {
    const isLast = i === items.length - 1;
    return `<button class="breadcrumb-item ${isLast ? 'active' : ''}" data-level="${item.level}">${item.label}</button>`;
  }).join('');

  elements.breadcrumb.querySelectorAll('.breadcrumb-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = btn.dataset.level;
      if (level === 'databases') navigateTo('databases');
      else if (level === 'collections') navigateTo('collections', { sourceDb: state.currentSourceDb, targetDb: state.currentTargetDb });
    });
  });
}

// =============================================
// Connect
// =============================================

elements.btnConnect.addEventListener('click', async () => {
  const url1 = elements.urlSource.value.trim();
  const url2 = elements.urlTarget.value.trim();

  if (!url1 || !url2) {
    toast('Please enter both MongoDB URLs', 'error');
    return;
  }

  setStatus('connecting');
  showLoading('Connecting to databases...');

  const result = await window.api.connect(url1, url2);
  if (result.error) {
    hideLoading();
    setStatus('disconnected');
    toast(`Connection failed: ${result.error}`, 'error');
    return;
  }

  state.connected = true;
  state.editorOnlyMode = false;
  state.sourceUrl = url1;
  state.targetUrl = url2;

  setStatus('connected');
  elements.btnDisconnect.style.display = 'inline-flex';

  elements.sourceUrlLabel.textContent = `Source: ${shortUrl(url1)}`;
  elements.targetUrlLabel.textContent = `Target: ${shortUrl(url2)}`;

  showView('main');

  showLoading('Comparing databases...');
  await loadDatabases();
  hideLoading();
  toast('Connected successfully!', 'success');
});

// =============================================
// Disconnect
// =============================================

elements.btnDisconnect.addEventListener('click', async () => {
  await window.api.disconnect();
  state.connected = false;
  state.editorOnlyMode = false;
  state.dbComparison = null;
  state.collComparison = null;
  state.docComparison = null;

  clearEditorResults();
  setStatus('disconnected');
  elements.btnDisconnect.style.display = 'none';
  showView('connection');
  toast('Disconnected', 'info');
});

// Enter key to connect
elements.urlTarget.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') elements.btnConnect.click();
});

// =============================================
// Load Databases
// =============================================

export async function loadDatabases() {
  const result = await window.api.compareDatabases();
  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
    return;
  }

  state.dbComparison = result;
  renderDatabases(result);
  navigateTo('databases');
}


export function initVisibility() {
  showView('connection');
  if (!state.connected) {
    clearEditorResults();
  }
}

initVisibility();

// Override the DB Editor button to show editor view instead of saved connections
elements.btnEditor.onclick = function () {
  const isVisible = elements.editorView.classList.contains('visible');

  if (!isVisible) {
    showView('editor');
    initEditorResizables();
    loadEditorTree();
  } else {
    if (state.connected) {
      showView('main');
    } else {
      showView('connection');
    }
  }
};

// Editor back button handler
const btnEditorBack = document.getElementById('btn-editor-back');
if (btnEditorBack) {
  btnEditorBack.addEventListener('click', async () => {
    if (state.editorOnlyMode) {
      await window.api.disconnect();
      state.connected = false;
      state.editorOnlyMode = false;
      clearEditorResults();
      setStatus('disconnected');
      elements.btnDisconnect.style.display = 'none';
      showView('connection');
    } else if (state.connected) {
      showView('main');
    } else {
      showView('connection');
    }
  });
}

// Compare screen back button — disconnects and returns to connection panel
const btnCompareBack = document.getElementById('btn-compare-back');
if (btnCompareBack) {
  btnCompareBack.addEventListener('click', async () => {
    await window.api.disconnect();
    state.connected = false;
    state.editorOnlyMode = false;
    state.dbComparison = null;
    state.collComparison = null;
    state.docComparison = null;
    clearEditorResults();
    setStatus('disconnected');
    elements.btnDisconnect.style.display = 'none';
    showView('connection');
    toast('Disconnected', 'info');
  });
}
