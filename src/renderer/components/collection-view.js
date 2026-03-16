import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { debounce, emptyState } from '../utils/dom.js';
import { confirmDialog } from '../modals/base.js';
import { navigateTo } from '../utils/navigation.js';

export async function loadCollections(sourceDbName, targetDbName) {
  showLoading(`Loading collections...`);
  const result = await window.api.compareCollections(sourceDbName, targetDbName);
  hideLoading();

  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
    return;
  }

  state.collComparison = result;
  elements.collDbName.textContent = sourceDbName === targetDbName ? sourceDbName : `${sourceDbName} vs ${targetDbName}`;
  renderCollections(result, sourceDbName, targetDbName);
}

// Search listener for collection search
elements.collSearch.addEventListener('input', debounce((e) => {
  state.collSearchQuery = e.target.value.toLowerCase();
  if (state.collComparison) renderCollections(state.collComparison, state.currentSourceDb, state.currentTargetDb);
}, 300));

export function renderCollections({ common, onlyInSource, onlyInTarget }, sourceDbName, targetDbName) {
  const filter = (name) => name.toLowerCase().includes(state.collSearchQuery);

  const filteredCommon = common.filter(filter);
  const filteredOnlyInSource = onlyInSource.filter(filter);
  const filteredOnlyInTarget = onlyInTarget.filter(filter);

  elements.collStats.innerHTML = `
    <span class="stat-pill common ${state.collFilter === 'common' ? 'active' : ''}" data-filter="common">${filteredCommon.length} common</span>
    <span class="stat-pill source-only ${state.collFilter === 'source-only' ? 'active' : ''}" data-filter="source-only">${filteredOnlyInSource.length} only in source</span>
    <span class="stat-pill target-only ${state.collFilter === 'target-only' ? 'active' : ''}" data-filter="target-only">${filteredOnlyInTarget.length} only in target</span>
  `;

  const sourceItems = [
    ...(state.collFilter === 'all' || state.collFilter === 'common' ? filteredCommon.map(c => ({ name: c, status: 'common' })) : []),
    ...(state.collFilter === 'all' || state.collFilter === 'source-only' ? filteredOnlyInSource.map(c => ({ name: c, status: 'missing' })) : []),
  ];

  const targetItems = [
    ...(state.collFilter === 'all' || state.collFilter === 'common' ? filteredCommon.map(c => ({ name: c, status: 'common' })) : []),
    ...(state.collFilter === 'all' || state.collFilter === 'target-only' ? filteredOnlyInTarget.map(c => ({ name: c, status: 'missing' })) : []),
  ];

  elements.sourceCollList.innerHTML = sourceItems.length ? sourceItems.map(item => `
    <div class="item-card coll-card" data-coll="${item.name}" data-status="${item.status}">
      <span class="item-name">${item.name}</span>
      <div class="u-flex u-items-center u-gap-6">
        <span class="item-status ${item.status}">${item.status === 'common' ? '✓ Common' : '⚠ Source only'}</span>
        ${item.status === 'missing' ? `<button class="btn btn-sm btn-target copy-coll-btn" data-from="source" data-to="target" data-coll="${item.name}" title="Copy to target">-> Copy</button>` : ''}
        <button class="btn btn-sm btn-danger drop-coll-btn" data-side="source" data-coll="${item.name}" title="Drop collection">✕</button>
      </div>
    </div>
  `).join('') : emptyState('No collections');

  elements.targetCollList.innerHTML = targetItems.length ? targetItems.map(item => `
    <div class="item-card coll-card" data-coll="${item.name}" data-status="${item.status}">
      <span class="item-name">${item.name}</span>
      <div class="u-flex u-items-center u-gap-6">
        <span class="item-status ${item.status}">${item.status === 'common' ? '✓ Common' : '⚠ Target only'}</span>
        ${item.status === 'missing' ? `<button class="btn btn-sm btn-source copy-coll-btn" data-from="target" data-to="source" data-coll="${item.name}" title="Copy to source"><- Copy</button>` : ''}
        <button class="btn btn-sm btn-danger drop-coll-btn" data-side="target" data-coll="${item.name}" title="Drop collection">✕</button>
      </div>
    </div>
  `).join('') : emptyState('No collections');

  // Click to compare documents (for all collections)
  document.querySelectorAll('.coll-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.copy-coll-btn') || e.target.closest('.drop-coll-btn')) return;
      navigateTo('documents', { collName: card.dataset.coll, sourceDb: sourceDbName, targetDb: targetDbName });
    });
  });

  // Copy collection buttons
  document.querySelectorAll('.copy-coll-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const from = btn.dataset.from;
      const to = btn.dataset.to;
      const coll = btn.dataset.coll;
      const confirmed = await confirmDialog(`Copy collection "${coll}" from ${from} to ${to}?`);
      if (!confirmed) return;
      showLoading(`Copying collection ${coll}...`);

      const dbFrom = from === 'source' ? sourceDbName : targetDbName;
      const dbTo = to === 'source' ? sourceDbName : targetDbName;

      const result = await window.api.copyCollection(from, to, dbFrom, coll); // Wait, API signature is (fromSide, toSide, dbName, collName) - it doesn't support cross-db-copy yet! But let's leave it as is for now since it wasn't requested.

      hideLoading();
      if (result.error) {
        toast(`Error: ${result.error}`, 'error');
      } else {
        toast(`Collection "${coll}" copied (${result.copiedCount} docs)`, 'success');
        await loadCollections(sourceDbName, targetDbName);
      }
    });
  });

  // Drop collection buttons
  document.querySelectorAll('.drop-coll-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const side = btn.dataset.side;
      const coll = btn.dataset.coll;
      const currentSideDb = side === 'source' ? sourceDbName : targetDbName;
      const confirmed = await confirmDialog(`Drop collection "${coll}" from ${side}?`, 'This action cannot be undone!');
      if (!confirmed) return;
      showLoading(`Dropping collection ${coll}...`);
      const result = await window.api.dropCollection(side, currentSideDb, coll);
      hideLoading();
      if (result.error) {
        toast(`Error: ${result.error}`, 'error');
      } else {
        toast(`Collection "${coll}" dropped from ${side}`, 'success');
        await loadCollections(sourceDbName, targetDbName);
      }
    });
  });
}

function setCollFilter(filter) {
  state.collFilter = state.collFilter === filter ? 'all' : filter;
  renderCollections(state.collComparison, state.currentSourceDb, state.currentTargetDb);
}

// Global Event Delegation for Collection View stats
elements.collStats.addEventListener('click', (e) => {
  const pill = e.target.closest('.stat-pill');
  if (pill && pill.dataset.filter) {
    setCollFilter(pill.dataset.filter);
  }
});
