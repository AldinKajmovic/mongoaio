import { state, elements } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { getNestedValue, setNestedValue, escapeHtml } from '../utils/dom.js';
import { renderPrimitive } from '../utils/json-tree.js';
import { resolveDb } from './document-crud.js';

// In-place editing of a single leaf value inside a JSON tree, so editing a
// nested field no longer means opening (and scrolling through) the whole field.

function getDoc(side, docId) {
  const item = state.docComparison?.items.find(d => d._id === docId);
  if (!item) return null;
  return state.activeDocTab === 'different' ? (side === 'source' ? item.source : item.target) : item;
}

function startEditLeaf(leaf) {
  if (!leaf || leaf.classList.contains('jt-editing')) return;
  const container = leaf.closest('.diff-field-value');
  if (!container) return;

  const { side, docId } = container.dataset;
  const current = getNestedValue(getDoc(side, docId), leaf.dataset.leafPath);

  leaf.classList.add('jt-editing');
  const valSpan = leaf.querySelector('.jt-leaf-val');
  valSpan.innerHTML = '<input class="jt-leaf-input" type="text">';
  const input = valSpan.querySelector('input');
  // Strings edit as their raw text; everything else as JSON (so 5, true, null
  // round-trip correctly through JSON.parse on save).
  input.value = typeof current === 'string' ? current : JSON.stringify(current);

  const pencil = leaf.querySelector('.jt-edit-leaf');
  if (pencil) pencil.outerHTML = '<span class="jt-leaf-save" title="Save">✓</span><span class="jt-leaf-cancel" title="Cancel">✕</span>';

  input.focus();
  input.select();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveLeaf(leaf); }
    else if (e.key === 'Escape') { e.preventDefault(); finishLeaf(leaf, current); }
  });
}

function finishLeaf(leaf, value) {
  leaf.classList.remove('jt-editing');
  const valSpan = leaf.querySelector('.jt-leaf-val');
  if (valSpan) valSpan.innerHTML = renderPrimitive(value);
  leaf.querySelector('.jt-leaf-cancel')?.remove();
  const save = leaf.querySelector('.jt-leaf-save');
  if (save) save.outerHTML = '<span class="jt-edit-leaf" title="Edit this value">✎</span>';
}

async function saveLeaf(leaf) {
  const container = leaf.closest('.diff-field-value');
  if (!container) return;
  const { side, docId } = container.dataset;
  const path = leaf.dataset.leafPath;
  const input = leaf.querySelector('.jt-leaf-input');
  if (!input) return;

  let newValue;
  try { newValue = JSON.parse(input.value); } catch { newValue = input.value; }

  showLoading('Saving field...');
  const result = await window.api.patchDocument(side, resolveDb(side), state.currentColl, docId, { [path]: newValue });
  hideLoading();

  if (result.error) {
    toast(`Error: ${result.error}`, 'error');
    return;
  }
  // Keep local state in sync so re-renders/compares stay correct, then close
  // the editor in place — no full reload (which would jump the scroll position).
  const doc = getDoc(side, docId);
  if (doc) setNestedValue(doc, path, newValue);
  finishLeaf(leaf, newValue);

  // Re-evaluate the diff against the other side: if the value now matches, the
  // highlight (and any sync checkboxes/badges up the chain) should clear; if it
  // now differs, it should light up.
  if (state.activeDocTab === 'different') {
    const otherSide = side === 'source' ? 'target' : 'source';
    const counterpart = getNestedValue(getDoc(otherSide, docId), path);
    updateDiffChain(leaf, path, JSON.stringify(counterpart) !== JSON.stringify(newValue));
  }
  toast('Field updated', 'success');
}

// Set/clear a node's diff highlight and its sync checkbox (on both sides; never
// the root, which the field-level checkbox covers).
function setNodeDiff(el, differs) {
  el.classList.toggle('jt-diff', differs);
  const isRoot = el.parentElement?.parentElement?.classList?.contains('json-tree');
  const existing = el.querySelector(':scope > .jt-sync');
  if (!differs || isRoot) { existing?.remove(); return; }
  if (existing) return;
  const cell = `<input type="checkbox" class="field-sync-checkbox jt-sync" data-doc-id="${escapeHtml(String(el.closest('.diff-field-value').dataset.docId))}" data-field="${escapeHtml(el.dataset.leafPath || el.dataset.path)}" title="Select this path to sync">`;
  const caret = el.querySelector(':scope > .jt-caret');
  if (caret) caret.insertAdjacentHTML('afterend', cell);
  else el.insertAdjacentHTML('afterbegin', cell);
}

// After a leaf edit, refresh the diff highlight at that path in BOTH the source
// and target trees (a branch differs iff any descendant still does), in place —
// no full re-render, so scroll position and expansion are preserved.
function updateDiffChain(leaf, path, differs) {
  const row = leaf.closest('.diff-field');
  if (!row) return;
  ['source', 'target'].forEach((s) => {
    const container = row.querySelector(`.diff-field-value[data-side="${s}"]`);
    if (!container) return;
    const node = [...container.querySelectorAll('.jt-leaf')].find(n => n.dataset.leafPath === path);
    if (node) setNodeDiff(node, differs);
    let children = node ? node.closest('.jt-children') : null;
    while (children) {
      const branch = children.parentElement;
      const toggle = branch.querySelector(':scope > .jt-toggle');
      if (!toggle) break;
      setNodeDiff(toggle, !!children.querySelector('.jt-diff'));
      children = branch.closest('.jt-children');
    }
  });
}

// Event delegation for leaf edit affordances within the document view.
elements.docContent.addEventListener('click', (e) => {
  const editLeaf = e.target.closest('.jt-edit-leaf');
  if (editLeaf) { e.stopPropagation(); startEditLeaf(editLeaf.closest('.jt-leaf')); return; }

  const saveBtn = e.target.closest('.jt-leaf-save');
  if (saveBtn) { e.stopPropagation(); saveLeaf(saveBtn.closest('.jt-leaf')); return; }

  const cancelBtn = e.target.closest('.jt-leaf-cancel');
  if (cancelBtn) {
    e.stopPropagation();
    const leaf = cancelBtn.closest('.jt-leaf');
    const container = leaf.closest('.diff-field-value');
    const { side, docId } = container.dataset;
    finishLeaf(leaf, getNestedValue(getDoc(side, docId), leaf.dataset.leafPath));
  }
});
