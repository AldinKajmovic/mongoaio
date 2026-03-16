import { state, elements } from '../utils/state.js';
import { debounce } from '../utils/dom.js';
import { renderEditorResults } from './query.js';

let editorLocalResults = [];
let activeLocalSearchQuery = '';
let searchOccurrences = []; // Array of DOM elements with .search-highlight
let searchCurrentIndex = -1;

const editorSearchBar = document.getElementById('editor-search-bar');
const editorSearchInput = document.getElementById('editor-search-input');
const editorSearchCount = document.getElementById('editor-search-count');
const editorSearchClear = document.getElementById('editor-search-clear');
const editorSearchPrev = document.getElementById('editor-search-prev');
const editorSearchNext = document.getElementById('editor-search-next');

function showLocalSearch() {
  if (!editorSearchBar) return;
  editorSearchBar.style.display = 'flex';
  editorSearchInput.value = activeLocalSearchQuery;
  editorSearchInput.focus();
  editorSearchInput.select();
}

function hideLocalSearch() {
  if (!editorSearchBar) return;
  editorSearchBar.style.display = 'none';
  editorSearchInput.value = '';
  editorSearchCount.textContent = '';
  searchOccurrences = [];
  searchCurrentIndex = -1;
  if (activeLocalSearchQuery) {
    activeLocalSearchQuery = '';
    refreshEditorDisplay();
  }
}

function applySearchHighlights() {
  if (!activeLocalSearchQuery) {
    searchOccurrences = [];
    searchCurrentIndex = -1;
    editorSearchCount.textContent = '';
    return;
  }

  // Collect all .search-highlight marks across the visible view
  const treePanel = document.getElementById('editor-data-tree');
  const jsonPanel = document.getElementById('editor-data-json');
  const tablePanel = document.getElementById('editor-data-table');

  let container;
  if (treePanel && treePanel.style.display !== 'none') container = treePanel;
  else if (jsonPanel && jsonPanel.style.display !== 'none') container = jsonPanel;
  else if (tablePanel && tablePanel.style.display !== 'none') container = tablePanel;

  if (!container) {
    searchOccurrences = [];
    searchCurrentIndex = -1;
    editorSearchCount.textContent = '0 results';
    return;
  }

  searchOccurrences = Array.from(container.querySelectorAll('.search-highlight'));
  searchCurrentIndex = searchOccurrences.length > 0 ? 0 : -1;

  updateSearchCountDisplay();
  if (searchCurrentIndex >= 0) {
    activateSearchOccurrence(searchCurrentIndex);
  }
}

function updateSearchCountDisplay() {
  if (searchOccurrences.length === 0) {
    editorSearchCount.textContent = activeLocalSearchQuery ? 'No results' : '';
  } else {
    editorSearchCount.textContent = `${searchCurrentIndex + 1} of ${searchOccurrences.length}`;
  }
}

function activateSearchOccurrence(index) {
  // Remove ALL previous active highlights (safety)
  document.querySelectorAll('.search-highlight-active').forEach(m => {
    m.classList.remove('search-highlight-active');
    m.classList.add('search-highlight');
  });

  if (index < 0 || index >= searchOccurrences.length) return;

  const el = searchOccurrences[index];
  el.classList.remove('search-highlight');
  el.classList.add('search-highlight-active');

  // In tree view, expand all ancestor doc rows so the match becomes visible
  const treePanel = document.getElementById('editor-data-tree');
  if (treePanel && treePanel.style.display !== 'none') {
    let node = el.parentElement;
    while (node && node !== treePanel) {
      if (node.classList.contains('editor-doc-children')) {
        const parentRow = node.closest('.editor-doc-row');
        if (parentRow && !parentRow.classList.contains('expanded')) {
          parentRow.classList.add('expanded');
        }
      }
      node = node.parentElement;
    }
  }

  // Scroll to the element — find the scrollable panel and scroll it directly
  requestAnimationFrame(() => {
    const scrollParent = el.closest('.editor-data-panel') || el.closest('#editor-data-json') || el.closest('#editor-data-table');
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offsetTop = elRect.top - parentRect.top + scrollParent.scrollTop;
      scrollParent.scrollTo({
        top: offsetTop - scrollParent.clientHeight / 2,
        behavior: 'smooth'
      });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  updateSearchCountDisplay();
}

function navigateSearch(direction) {
  if (searchOccurrences.length === 0) return;
  searchCurrentIndex += direction;
  if (searchCurrentIndex >= searchOccurrences.length) searchCurrentIndex = 0;
  if (searchCurrentIndex < 0) searchCurrentIndex = searchOccurrences.length - 1;
  activateSearchOccurrence(searchCurrentIndex);
}

const runLocalSearch = debounce((query) => {
  activeLocalSearchQuery = query.toLowerCase();
  searchCurrentIndex = -1;
  refreshEditorDisplay();
}, 200);

// Event listeners
editorSearchInput.addEventListener('input', (e) => {
  runLocalSearch(e.target.value);
});

editorSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideLocalSearch();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    navigateSearch(1);
  } else if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    navigateSearch(-1);
  }
});

editorSearchClear.addEventListener('click', hideLocalSearch);
editorSearchNext.addEventListener('click', () => navigateSearch(1));
editorSearchPrev.addEventListener('click', () => navigateSearch(-1));

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'f' && elements.editorView && elements.editorView.classList.contains('visible')) {
    e.preventDefault();
    showLocalSearch();
  }
});

const btnEditorSearchLocal = document.getElementById('btn-editor-search-local');
if (btnEditorSearchLocal) {
  btnEditorSearchLocal.onclick = showLocalSearch;
}

export function refreshEditorDisplay() {
  // Use a filtered version of editorLocalResults if search is active
  const itemsToDisplay = activeLocalSearchQuery
    ? editorLocalResults.filter(doc => JSON.stringify(doc).toLowerCase().includes(activeLocalSearchQuery))
    : editorLocalResults;

  // Patch the result object for re-rendering
  const mockResult = {
    items: itemsToDisplay,
    total: state.editor.total,
    page: Math.floor(state.editor.skip / state.editor.limit) + 1,
    limit: state.editor.limit
  };
  renderEditorResults(mockResult, true); // true = skip state sync

  // After rendering, apply highlights
  applySearchHighlights();
}

// Setter for cross-module mutation from query.js
export function setEditorLocalResults(items) {
  editorLocalResults = items;
}

// Export the reactive getter so query.js can read activeLocalSearchQuery
export { editorLocalResults, activeLocalSearchQuery };
