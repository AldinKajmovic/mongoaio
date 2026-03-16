import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { debounce, emptyState } from '../utils/dom.js';
import { copyDoc, deleteDoc, startEditField } from './document-crud.js';
import { renderDocTabDifferent, renderDocTabUnique } from './document-item-renderer.js';

export async function loadDocuments(sourceDbName, targetDbName, collName) {
  const tabMap = {
    'different': 'common',
    'only-source': 'only-source',
    'only-target': 'only-target'
  };

  showLoading(`Comparing documents in ${collName}...`);
  const result = await window.api.compareDocuments(sourceDbName, targetDbName, collName, {
    page: state.currentPage,
    limit: state.currentLimit,
    tab: tabMap[state.activeDocTab] || 'common',
    search: state.fieldSearchQuery
  });
  hideLoading();

  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
    return;
  }

  state.docComparison = result;
  elements.docCollName.textContent = collName;


  // Stats
  const activeTab = state.activeDocTab;
  elements.docStats.innerHTML = `
    <span class="stat-pill common clickable ${activeTab === 'different' ? 'active' : ''}" data-tab="different">${result.counts.common} common</span>
    <span class="stat-pill source-only clickable ${activeTab === 'only-source' ? 'active' : ''}" data-tab="only-source">${result.counts.onlyInSource} source only</span>
    <span class="stat-pill target-only clickable ${activeTab === 'only-target' ? 'active' : ''}" data-tab="only-target">${result.counts.onlyInTarget} target only</span>
  `;

  renderDocTab(state.activeDocTab);
  updatePaginationUI();
}

export function updatePaginationUI() {
  const p = state.docComparison?.pagination;
  if (!p || p.totalPages <= 1) {
    elements.paginationFooter.style.display = 'none';
    return;
  }

  elements.paginationFooter.style.display = 'flex';
  elements.paginationInfo.textContent = `Showing ${((p.page - 1) * p.limit) + 1} - ${Math.min(p.page * p.limit, p.total)} of ${p.total}`;
  elements.prevBtn.disabled = p.page === 1;
  elements.nextBtn.disabled = p.page === p.totalPages;

  // Render simple page numbers (show up to 5 pages around current)
  const maxVisible = 5;
  let startPage = Math.max(1, p.page - Math.floor(maxVisible / 2));
  let endPage = Math.min(p.totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  let pagesHtml = '';
  for (let i = startPage; i <= endPage; i++) {
    pagesHtml += `<button class="btn btn-sm ${i === p.page ? 'btn-primary' : 'btn-ghost'}" data-page="${i}">${i}</button>`;
  }
  elements.pageNumbers.innerHTML = pagesHtml;
}

function goToPage(page) {
  state.currentPage = page;
  loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
}

// Global page jump helper (used by pagination)
elements.pageNumbers.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && btn.dataset.page) {
    goToPage(parseInt(btn.dataset.page, 10));
  }
});

// Doc stats pills as tabs
elements.docStats.addEventListener('click', (e) => {
  const pill = e.target.closest('.stat-pill.clickable');
  if (pill && pill.dataset.tab) {
    state.activeDocTab = pill.dataset.tab;
    state.currentPage = 1; // Reset page on tab change
    loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
  }
});

export function renderDocTab(tab) {
  const data = state.docComparison;
  if (!data) return;
  let html = '';
  const q = state.fieldSearchQuery;
  if (tab === 'different') {
    html = renderDocTabDifferent(data.items, q);
  } else {
    html = renderDocTabUnique(data.items, tab === 'only-source' ? 'source' : 'target', q);
  }
  if (html === '' && q) html = emptyState(`No items matching "${q}"`);
  elements.docContent.innerHTML = html;
}

// Field search listener
elements.fieldSearch.addEventListener('input', debounce((e) => {
  state.fieldSearchQuery = e.target.value.toLowerCase();
  state.currentPage = 1;
  loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
}, 300));

// Pagination listeners
elements.prevBtn.addEventListener('click', () => {
  if (state.currentPage > 1) {
    state.currentPage--;
    loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
  }
});

elements.nextBtn.addEventListener('click', () => {
  if (state.docComparison && state.currentPage < state.docComparison.pagination.totalPages) {
    state.currentPage++;
    loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
  }
});

elements.limitSelect.addEventListener('change', (e) => {
  state.currentLimit = parseInt(e.target.value, 10);
  state.currentPage = 1;
  loadDocuments(state.currentSourceDb, state.currentTargetDb, state.currentColl);
});

// Global CTRL+F search shortcut
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault(); // Stop browser search
    // Focus appropriate search bar
    if (document.activeElement === elements.collSearch || document.activeElement === elements.fieldSearch) {
      // Toggle focus if already focused? Or just keep it.
      return;
    }

    if (state.docComparison) {
      elements.fieldSearch.focus();
      elements.fieldSearch.select();
    } else {
      elements.collSearch.focus();
      elements.collSearch.select();
    }
  }
});

function setFieldFilter(filter) {
  state.fieldFilter = state.fieldFilter === filter ? 'all' : filter;
  renderDocTab(state.activeDocTab);
}

function toggleField(element) {
  element.classList.toggle('collapsed');
}

// Global Event Delegation for Document View
elements.docContent.addEventListener('click', (e) => {
  // 1. Action Icons (Edit / Toggle)
  const toggleIcon = e.target.closest('.field-toggle-icon');
  if (toggleIcon) {
    toggleField(toggleIcon.closest('.diff-field'));
    return;
  }

  const editIcon = e.target.closest('.action-icon.edit-field');
  if (editIcon) {
    const container = editIcon.closest('.diff-field-value');
    if (container) {
      startEditField(container.dataset.side, container.dataset.docId, container.dataset.field);
    }
    return;
  }

  // 2. Stat Pills
  const pill = e.target.closest('.stat-pill.clickable');
  if (pill) {
    e.stopPropagation();
    if (pill.dataset.filter) setFieldFilter(pill.dataset.filter);
    return;
  }

  // 3. Document Copy/Delete Actions
  const actionBtn = e.target.closest('.btn-source, .btn-target, .btn-danger');
  if (actionBtn && actionBtn.dataset.id) {
    e.stopPropagation();
    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;
    const side = actionBtn.dataset.side;

    if (action === 'sync-target-to-source') copyDoc('target', 'source', id);
    else if (action === 'sync-source-to-target') copyDoc('source', 'target', id);
    else if (action === 'copy-source-to-target') copyDoc('source', 'target', id);
    else if (action === 'copy-target-to-source') copyDoc('target', 'source', id);
    else if (actionBtn.classList.contains('delete-doc-btn')) deleteDoc(side, id);
    return;
  }

  // 4. Header Toggle (last, as other buttons are inside it)
  const header = e.target.closest('.doc-item-header');
  if (header) {
    header.parentElement.classList.toggle('expanded');
    return;
  }
});

// Double click Delegation
elements.docContent.addEventListener('dblclick', (e) => {
  const container = e.target.closest('.diff-field-value');
  if (container) {
    startEditField(container.dataset.side, container.dataset.docId, container.dataset.field);
  }
});
