import { escapeHtml } from '../utils/dom.js';
import { confirmToast } from '../utils/ui.js';
import { hideShellPanel } from './shell.js';
import { renderResultItem, renderEmptyResults } from './shell-renderer.js';

let tabs = [];      // { id, label, text, results[], context }
let activeTabId = null;
let nextId = 1;
let nextResultId = 1;

const tabBarEl = () => document.getElementById('shell-tab-bar');

// --- Public API ---

export function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

export function initShellTabs() {
  addTab();
}

export function addTab() {
  const id = nextId++;
  const tab = {
    id,
    label: `Shell ${id}`,
    text: '',
    results: [],   // Array of { query, content, type, meta }
    context: { alias: '', db: '', coll: '' },
  };
  tabs.push(tab);
  switchTab(id);
  renderTabBar();
  return tab;
}

/** Release any live shell cursors held by a tab's results. */
function releaseTabCursors(tab) {
  if (!tab) return;
  tab.results.forEach(r => {
    if (r.meta?.cursorId) window.api.shellCursorClose(r.meta.cursorId);
  });
}

export function closeTab(id) {
  // Last tab — confirm and exit shell entirely
  if (tabs.length <= 1) {
    confirmToast('Are you sure you want to exit the shell?', () => {
      tabs.forEach(releaseTabCursors);
      tabs = [];
      activeTabId = null;
      nextId = 1;
      hideShellPanel();
      // Re-create a fresh tab for next time shell opens
      addTab();
    });
    return;
  }

  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  releaseTabCursors(tabs[idx]);
  tabs.splice(idx, 1);

  if (activeTabId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    switchTab(next.id);
  }
  renderTabBar();
}

export function switchTab(id) {
  // Save current tab state before switching
  saveActiveTabState();
  activeTabId = id;
  restoreTabState();
  renderTabBar();
}

// --- Save/Restore state ---

function saveActiveTabState() {
  const tab = getActiveTab();
  if (!tab) return;
  const textarea = document.getElementById('editor-shell-textarea');
  if (textarea) tab.text = textarea.value;
}

function restoreTabState() {
  const tab = getActiveTab();
  if (!tab) return;

  const textarea = document.getElementById('editor-shell-textarea');
  if (textarea) textarea.value = tab.text;

  const resultsEl = document.getElementById('editor-shell-results');
  if (resultsEl) {
    if (tab.results.length === 0) {
      renderEmptyResults(resultsEl);
    } else {
      resultsEl.innerHTML = '';
      // Newest first (results are unshifted, so iterate in order).
      tab.results.forEach(r => resultsEl.appendChild(renderResultItem(r)));
    }
  }
}

// --- Persist a result into the active tab ---

export function pushResult(query, content, type, meta) {
  const tab = getActiveTab();
  if (!tab) return null;
  const time = new Date().toLocaleTimeString();
  const result = {
    id: `res-${nextResultId++}`,
    query, content, type,
    meta: meta || {},
    time,
    view: 'table', // 'table' | 'json' (only meaningful for array results)
    page: 1,
  };
  tab.results.unshift(result);
  return result;
}

/** Find a result by id within the active tab. */
export function findResult(id) {
  const tab = getActiveTab();
  if (!tab) return null;
  return tab.results.find(r => r.id === id) || null;
}

/** Remove a result by id from the active tab. Returns remaining count. */
export function removeResult(id) {
  const tab = getActiveTab();
  if (!tab) return 0;
  const idx = tab.results.findIndex(r => r.id === id);
  if (idx !== -1) tab.results.splice(idx, 1);
  return tab.results.length;
}

// --- Render the tab bar ---

function renderTabBar() {
  const bar = tabBarEl();
  if (!bar) return;

  bar.innerHTML = tabs.map(t => {
    const active = t.id === activeTabId ? ' active' : '';
    return `<button class="shell-tab${active}" data-tab-id="${t.id}">
      <span class="shell-tab-label">${escapeHtml(t.label)}</span>
      <span class="shell-tab-close" data-tab-id="${t.id}" title="Close">&times;</span>
    </button>`;
  }).join('') +
    '<button class="shell-tab shell-tab-add" title="New Shell Tab">+</button>';
}

// --- Delegation ---

document.addEventListener('click', (e) => {
  const close = e.target.closest('.shell-tab-close');
  if (close) {
    e.stopPropagation();
    closeTab(Number(close.dataset.tabId));
    return;
  }

  const addBtn = e.target.closest('.shell-tab-add');
  if (addBtn) {
    addTab();
    return;
  }

  const tabBtn = e.target.closest('.shell-tab[data-tab-id]');
  if (tabBtn) {
    switchTab(Number(tabBtn.dataset.tabId));
  }
});
