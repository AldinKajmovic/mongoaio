import { elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { renderEditorTree } from '../editor/tree-renderer.js';

let currentAlias = null;

export function openAddDatabaseModal(alias) {
  if (!elements.addDbOverlay) return;
  currentAlias = alias;
  elements.addDbName.value = '';
  elements.addDbError.style.display = 'none';
  elements.addDbOverlay.style.display = 'flex';
  elements.addDbName.focus();
}

export function closeAddDatabaseModal() {
  if (elements.addDbOverlay) elements.addDbOverlay.style.display = 'none';
}

async function performAddDatabase() {
  const dbName = elements.addDbName.value.trim();
  if (!dbName) {
    elements.addDbError.textContent = 'Database name is required';
    elements.addDbError.style.display = 'block';
    return;
  }
  
  elements.addDbError.style.display = 'none';
  showLoading(`Creating database ${dbName}...`);
  
  try {
    const { ensureActive } = await import('../editor/tree-actions.js');
    await ensureActive(currentAlias);
    
    // In MongoDB, a database is created when the first collection is created.
    // We'll create an '_init' collection to force existence.
    const result = await window.api.createDatabase('source', dbName, '_init');
    
    if (result.error) {
       throw new Error(result.error);
    }
    
    toast(`Database ${dbName} created`, 'success');
    closeAddDatabaseModal();
    renderEditorTree();
  } catch (err) {
    elements.addDbError.textContent = err.message;
    elements.addDbError.style.display = 'block';
  } finally {
    hideLoading();
  }
}

// --- Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  if (elements.addDbConfirm) elements.addDbConfirm.addEventListener('click', performAddDatabase);
  if (elements.addDbCancel) elements.addDbCancel.addEventListener('click', closeAddDatabaseModal);
  if (elements.addDbClose) elements.addDbClose.addEventListener('click', closeAddDatabaseModal);
  
  if (elements.addDbOverlay) {
    elements.addDbOverlay.addEventListener('click', (e) => {
      if (e.target === elements.addDbOverlay) closeAddDatabaseModal();
    });
  }
  
  if (elements.addDbName) {
    elements.addDbName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performAddDatabase();
      if (e.key === 'Escape') closeAddDatabaseModal();
    });
  }
});
