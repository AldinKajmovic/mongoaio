import { state, elements } from '../utils/state.js';
import { debounce } from '../utils/dom.js';
import { renderEditorResults } from './query.js';
import { renderJsonEditorHighlights } from './json-edit.js';
import { wasAutoExpandTruncated, countMatches } from './value-viewer.js';
import { activePanel, activeTreePanel, expandAncestors, scrollToMatch } from './search-panels.js';
import {
  getActiveJsonEditTextarea, searchInTextarea, navigateTextarea,
  resetTextareaMatches, hasTextareaMatches
} from './search-textarea.js';

let editorLocalResults = [];
let activeLocalSearchQuery = '';
let searchOccurrences = [];
let searchCurrentIndex = -1;

const editorSearchBar = document.getElementById('editor-search-bar');
const editorSearchInput = /** @type {HTMLInputElement} */ (document.getElementById('editor-search-input'));
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
  resetTextareaMatches();
  if (activeLocalSearchQuery) {
    activeLocalSearchQuery = '';
    if (!getActiveJsonEditTextarea()) refreshEditorDisplay();
    else renderJsonEditorHighlights('');
  }
}

function applySearchHighlights() {
  if (!activeLocalSearchQuery) {
    searchOccurrences = [];
    searchCurrentIndex = -1;
    editorSearchCount.textContent = '';
    return;
  }

  const container = activePanel();
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

let totalMatchesQuery = null;
let totalMatches = 0;

function totalMatchesInResults() {
  if (totalMatchesQuery !== activeLocalSearchQuery) {
    totalMatchesQuery = activeLocalSearchQuery;
    totalMatches = editorLocalResults.reduce(
      (n, doc) => n + countMatches(doc, activeLocalSearchQuery), 0);
  }
  return totalMatches;
}

function updateSearchCountDisplay() {
  if (searchOccurrences.length === 0) {
    editorSearchCount.textContent = activeLocalSearchQuery ? 'No results' : '';
    return;
  }

  const shown = searchOccurrences.length;
  if (activeTreePanel() && wasAutoExpandTruncated()) {
    const total = totalMatchesInResults();
    if (total > shown) {
      editorSearchCount.textContent = `${searchCurrentIndex + 1} of ${shown} shown · ${total} in results`;
      return;
    }
  }
  editorSearchCount.textContent = `${searchCurrentIndex + 1} of ${shown}`;
}

document.addEventListener('editor-tree-expanded', () => {
  if (!activeLocalSearchQuery) return;
  const container = activeTreePanel();
  if (!container) return;
  const active = document.querySelector('.search-highlight-active');
  searchOccurrences = Array.from(container.querySelectorAll('.search-highlight, .search-highlight-active'));
  searchCurrentIndex = active ? searchOccurrences.indexOf(active) : (searchOccurrences.length ? 0 : -1);
  updateSearchCountDisplay();
});

function activateSearchOccurrence(index) {
  document.querySelectorAll('.search-highlight-active').forEach(m => {
    m.classList.remove('search-highlight-active');
    m.classList.add('search-highlight');
  });

  if (index < 0 || index >= searchOccurrences.length) return;

  const el = searchOccurrences[index];
  el.classList.remove('search-highlight');
  el.classList.add('search-highlight-active');

  const treePanel = activeTreePanel();
  if (treePanel) expandAncestors(el, treePanel);

  scrollToMatch(el);
  updateSearchCountDisplay();
}

function navigateSearch(direction) {
  const ta = getActiveJsonEditTextarea();
  if (ta && hasTextareaMatches()) {
    navigateTextarea(ta, direction, activeLocalSearchQuery, editorSearchCount);
    return;
  }
  if (searchOccurrences.length === 0) return;
  searchCurrentIndex += direction;
  if (searchCurrentIndex >= searchOccurrences.length) searchCurrentIndex = 0;
  if (searchCurrentIndex < 0) searchCurrentIndex = searchOccurrences.length - 1;
  activateSearchOccurrence(searchCurrentIndex);
}

const runLocalSearch = debounce((query) => {
  activeLocalSearchQuery = query.toLowerCase();
  searchCurrentIndex = -1;
  const ta = getActiveJsonEditTextarea();
  if (ta) {
    searchOccurrences = [];
    searchInTextarea(ta, activeLocalSearchQuery, editorSearchCount);
    return;
  }
  refreshEditorDisplay();
}, 200);

editorSearchInput.addEventListener('input', () => {
  runLocalSearch(editorSearchInput.value);
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
  const mockResult = {
    items: editorLocalResults,
    total: state.editor.total,
    page: Math.floor(state.editor.skip / state.editor.limit) + 1,
    limit: state.editor.limit
  };
  renderEditorResults(mockResult, true);

  applySearchHighlights();
}

export function setEditorLocalResults(items) {
  editorLocalResults = items;
}

export { editorLocalResults, activeLocalSearchQuery };
