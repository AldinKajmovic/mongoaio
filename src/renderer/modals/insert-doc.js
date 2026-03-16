import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';

function updateInsertDocLineNumbers() {
  if (!elements.insertDocEditor) return;
  const text = elements.insertDocEditor.value;
  const lines = text.split('\n').length;
  elements.insertDocLineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

export function openInsertDocModal() {
  elements.insertDocTitle.textContent = 'Insert JSON Document';
  elements.insertDocEditor.value = '{\n  \n}';
  elements.insertDocError.style.display = 'none';
  elements.insertDocOverlay.style.display = 'flex';
  updateInsertDocLineNumbers();
  elements.insertDocEditor.focus();
  elements.insertDocEditor.setSelectionRange(3, 3);
}

export function closeInsertDocModal() {
  elements.insertDocOverlay.style.display = 'none';
}

async function insertDocFromModal(keepOpen) {
  const json = elements.insertDocEditor.value;
  let doc;
  try { doc = JSON.parse(json); }
  catch (e) {
    elements.insertDocError.textContent = 'Invalid JSON: ' + e.message;
    elements.insertDocError.style.display = 'block';
    return;
  }
  elements.insertDocError.style.display = 'none';

  try {
    showLoading('Inserting document...');
    const result = await window.api.insertDocument(state.editor.side, state.editor.db, state.editor.coll, doc);
    hideLoading();
    if (result.error) {
      elements.insertDocError.textContent = 'Insert failed: ' + result.error;
      elements.insertDocError.style.display = 'block';
      return;
    }
    toast(`Document inserted (id: ${result.insertedId})`, 'success');
    const { runEditorQuery } = await import('../editor/query.js');
    runEditorQuery();
    if (keepOpen) {
      elements.insertDocEditor.value = '{\n  \n}';
      updateInsertDocLineNumbers();
      elements.insertDocEditor.focus();
      elements.insertDocEditor.setSelectionRange(3, 3);
    } else {
      closeInsertDocModal();
    }
  } catch (err) {
    hideLoading();
    elements.insertDocError.textContent = err.message;
    elements.insertDocError.style.display = 'block';
  }
}

// --- Listeners ---
if (elements.insertDocEditor) {
  elements.insertDocEditor.addEventListener('input', updateInsertDocLineNumbers);
  elements.insertDocEditor.addEventListener('scroll', () => {
    elements.insertDocLineNumbers.scrollTop = elements.insertDocEditor.scrollTop;
  });
}

if (elements.insertDocValidate) {
  elements.insertDocValidate.addEventListener('click', () => {
    try {
      JSON.parse(elements.insertDocEditor.value);
      elements.insertDocError.style.display = 'none';
      toast('Valid JSON', 'success');
    } catch (e) {
      elements.insertDocError.textContent = 'Invalid JSON: ' + e.message;
      elements.insertDocError.style.display = 'block';
    }
  });
}

if (elements.insertDocFormat) {
  elements.insertDocFormat.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(elements.insertDocEditor.value);
      elements.insertDocEditor.value = JSON.stringify(parsed, null, 2);
      elements.insertDocError.style.display = 'none';
      updateInsertDocLineNumbers();
    } catch (e) {
      elements.insertDocError.textContent = 'Cannot format: ' + e.message;
      elements.insertDocError.style.display = 'block';
    }
  });
}

if (elements.insertDocWordwrap) {
  elements.insertDocWordwrap.addEventListener('change', (e) => {
    elements.insertDocEditor.classList.toggle('word-wrap', e.target.checked);
  });
}

if (elements.insertDocClose) elements.insertDocClose.addEventListener('click', closeInsertDocModal);
if (elements.insertDocCancel) elements.insertDocCancel.addEventListener('click', closeInsertDocModal);
if (elements.insertDocMinimize) elements.insertDocMinimize.addEventListener('click', closeInsertDocModal);
if (elements.insertDocOverlay) {
  elements.insertDocOverlay.addEventListener('click', (e) => {
    if (e.target === elements.insertDocOverlay) closeInsertDocModal();
  });
}
if (elements.insertDocAdd) elements.insertDocAdd.addEventListener('click', () => insertDocFromModal(false));
if (elements.insertDocAddContinue) elements.insertDocAddContinue.addEventListener('click', () => insertDocFromModal(true));
