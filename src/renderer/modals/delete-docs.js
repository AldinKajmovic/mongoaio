import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { parseRelaxedJSON } from '../utils/dom.js';

function updateDeleteDocsLineNumbers() {
  if (!elements.deleteDocsEditor) return;
  const text = elements.deleteDocsEditor.value;
  const lines = text.split('\n').length;
  elements.deleteDocsLineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

export function openDeleteDocsModal(initialQuery = '{}') {
  if (!elements.deleteDocsOverlay) return;
  elements.deleteDocsEditor.value = initialQuery;
  elements.deleteDocsError.style.display = 'none';
  elements.deleteDocsOverlay.style.display = 'flex';
  updateDeleteDocsLineNumbers();
  elements.deleteDocsEditor.focus();
}

export function closeDeleteDocsModal() {
  if (elements.deleteDocsOverlay) elements.deleteDocsOverlay.style.display = 'none';
}

async function performDeleteFromModal() {
  const json = elements.deleteDocsEditor.value;
  let query;
  try { query = parseRelaxedJSON(json); }
  catch (e) {
    elements.deleteDocsError.textContent = 'Invalid JSON: ' + e.message;
    elements.deleteDocsError.style.display = 'block';
    return;
  }
  elements.deleteDocsError.style.display = 'none';

  try {
    showLoading('Deleting documents...');
    const result = await window.api.deleteDocuments(state.editor.side, state.editor.db, state.editor.coll, query);
    hideLoading();
    if (result.error) throw new Error(result.error);
    toast(`Deleted ${result.deletedCount} document(s)`, 'success');
    closeDeleteDocsModal();
    const { runEditorQuery } = await import('../editor/query.js');
    runEditorQuery();
  } catch (err) {
    hideLoading();
    elements.deleteDocsError.textContent = err.message;
    elements.deleteDocsError.style.display = 'block';
  }
}

// --- Listeners ---
if (elements.deleteDocsEditor) {
  elements.deleteDocsEditor.addEventListener('input', updateDeleteDocsLineNumbers);
  elements.deleteDocsEditor.addEventListener('scroll', () => {
    elements.deleteDocsLineNumbers.scrollTop = elements.deleteDocsEditor.scrollTop;
  });
}

if (elements.deleteDocsValidate) {
  elements.deleteDocsValidate.addEventListener('click', () => {
    try {
      parseRelaxedJSON(elements.deleteDocsEditor.value);
      elements.deleteDocsError.style.display = 'none';
      toast('Valid JSON', 'success');
    } catch (e) {
      elements.deleteDocsError.textContent = 'Invalid JSON: ' + e.message;
      elements.deleteDocsError.style.display = 'block';
    }
  });
}

if (elements.deleteDocsConfirm) elements.deleteDocsConfirm.addEventListener('click', performDeleteFromModal);
if (elements.deleteDocsCancel) elements.deleteDocsCancel.addEventListener('click', closeDeleteDocsModal);
if (elements.deleteDocsClose) elements.deleteDocsClose.addEventListener('click', closeDeleteDocsModal);
if (elements.deleteDocsOverlay) {
  elements.deleteDocsOverlay.addEventListener('click', (e) => {
    if (e.target === elements.deleteDocsOverlay) closeDeleteDocsModal();
  });
}
