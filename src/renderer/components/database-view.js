import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { emptyState } from '../utils/dom.js';
import { confirmDialog } from '../modals/base.js';
import { navigateTo, loadDatabases } from '../utils/navigation.js';

export function renderDatabases({ common, onlyInSource, onlyInTarget }) {
  // Stats
  elements.dbStats.innerHTML = `
    <span class="stat-pill common ${state.dbFilter === 'common' ? 'active' : ''}" data-filter="common">${common.length} common</span>
    <span class="stat-pill source-only ${state.dbFilter === 'source-only' ? 'active' : ''}" data-filter="source-only">${onlyInSource.length} only in source</span>
    <span class="stat-pill target-only ${state.dbFilter === 'target-only' ? 'active' : ''}" data-filter="target-only">${onlyInTarget.length} only in target</span>
  `;

  const dbPassesFilter = (status) => {
    if (state.dbFilter === 'all') return true;
    if (state.dbFilter === 'common') return status === 'common';
    if (state.dbFilter === 'source-only') return status === 'missing';
    if (state.dbFilter === 'target-only') return status === 'missing';
    return true;
  };

  // Source column: common + onlyInSource
  const sourceItems = [
    ...(state.dbFilter === 'all' || state.dbFilter === 'common' ? common.map(db => ({ name: db, status: 'common' })) : []),
    ...(state.dbFilter === 'all' || state.dbFilter === 'source-only' ? onlyInSource.map(db => ({ name: db, status: 'missing' })) : []),
  ];

  // Target column: common + onlyInTarget
  const targetItems = [
    ...(state.dbFilter === 'all' || state.dbFilter === 'common' ? common.map(db => ({ name: db, status: 'common' })) : []),
    ...(state.dbFilter === 'all' || state.dbFilter === 'target-only' ? onlyInTarget.map(db => ({ name: db, status: 'missing' })) : []),
  ];

  elements.sourceDbList.innerHTML = sourceItems.length ? sourceItems.map(item => `
    <div class="item-card" data-db="${item.name}" data-status="${item.status}">
      <span class="item-name">${item.name}</span>
      <div class="u-flex u-items-center u-gap-6">
        <span class="item-status ${item.status}">${item.status === 'common' ? '✓ Common' : '⚠ Source only'}</span>
        ${item.status === 'missing' ? `<button class="btn btn-sm btn-target copy-db-btn" data-from="source" data-to="target" data-db="${item.name}" title="Copy to target">-> Copy to Target</button>` : ''}
      </div>
    </div>
  `).join('') : emptyState('No databases');

  elements.targetDbList.innerHTML = targetItems.length ? targetItems.map(item => `
    <div class="item-card" data-db="${item.name}" data-status="${item.status}">
      <span class="item-name">${item.name}</span>
      <div class="u-flex u-items-center u-gap-6">
        <span class="item-status ${item.status}">${item.status === 'common' ? '✓ Common' : '⚠ Target only'}</span>
        ${item.status === 'missing' ? `<button class="btn btn-sm btn-source copy-db-btn" data-from="target" data-to="source" data-db="${item.name}" title="Copy to source"><- Copy to Source</button>` : ''}
      </div>
    </div>
  `).join('') : emptyState('No databases');

  // Cross-compare banner updates
  const updateCrossBanner = () => {
    const banner = document.getElementById('cross-compare-banner');
    if (state.currentSourceDb && state.currentTargetDb) {
      document.getElementById('cc-source-name').textContent = state.currentSourceDb;
      document.getElementById('cc-target-name').textContent = state.currentTargetDb;
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  };

  // Click to select or navigate to databases
  const dbCards = [...elements.sourceDbList.querySelectorAll('.item-card'), ...elements.targetDbList.querySelectorAll('.item-card')];
  dbCards.forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.copy-db-btn')) return;

      const side = card.closest('.column').querySelector('.source-header') ? 'source' : 'target';
      const dbName = card.dataset.db;

      const isSelected = card.classList.contains('selected');

      // Remove selection from all cards on this side
      card.closest('.items-list').querySelectorAll('.item-card').forEach(c => c.classList.remove('selected'));

      if (!isSelected) {
        card.classList.add('selected');
        if (side === 'source') state.currentSourceDb = dbName;
        if (side === 'target') state.currentTargetDb = dbName;
      } else {
        // Deselect
        if (side === 'source') state.currentSourceDb = null;
        if (side === 'target') state.currentTargetDb = null;
      }

      updateCrossBanner();
    });
  });

  // Cross compare button
  const btnCrossCompare = document.getElementById('btn-cross-compare');
  if (btnCrossCompare) {
    // Remove old listeners to avoid duplicates
    const newBtn = btnCrossCompare.cloneNode(true);
    btnCrossCompare.parentNode.replaceChild(newBtn, btnCrossCompare);
    newBtn.addEventListener('click', () => {
      navigateTo('collections', { sourceDb: state.currentSourceDb, targetDb: state.currentTargetDb });
    });
  }

  // Copy DB buttons
  document.querySelectorAll('.copy-db-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const from = btn.dataset.from;
      const to = btn.dataset.to;
      const db = btn.dataset.db;
      const confirmed = await confirmDialog(`Copy database "${db}" from ${from} to ${to}?`, 'This will create the database and copy all collections.');
      if (!confirmed) return;
      showLoading(`Copying database ${db}...`);
      // Get all collections from source db and copy each
      const collResult = await window.api.listCollections(from, db);
      if (collResult.error) {
        hideLoading();
        toast(`Error: ${collResult.error}`, 'error');
        return;
      }
      for (const coll of collResult.collections) {
        await window.api.copyCollection(from, to, db, coll);
      }
      hideLoading();
      toast(`Database "${db}" copied to ${to}`, 'success');
      // Refresh
      showLoading('Refreshing...');
      await loadDatabases();
      hideLoading();
    });
  });
}

function setDbFilter(filter) {
  state.dbFilter = state.dbFilter === filter ? 'all' : filter;
  renderDatabases(state.dbComparison);
}

// Global Event Delegation for Database View stats
elements.dbStats.addEventListener('click', (e) => {
  const pill = e.target.closest('.stat-pill');
  if (pill && pill.dataset.filter) {
    setDbFilter(pill.dataset.filter);
  }
});
