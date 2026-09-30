/* =============================================
   Editor — Pending Edit Row Decoration
   ============================================= */

import { stashValue, previewJson } from './value-store.js';
import { pendingGroups } from './pending-edits.js';
import { getFieldType, isExpandable, valueSummary } from './field-types.js';

/** How long a committed row stays highlighted green. */
const SAVED_FLASH_MS = 1400;
/** Longest stored-value preview shown in a row's tooltip. */
const TOOLTIP_PREVIEW_CHARS = 120;

/**
 * Locate a tree row by document index + dotted path. Paths come from document
 * keys (they may contain quotes, brackets or spaces), so both are CSS-escaped.
 *
 * @returns {HTMLElement|null}
 */
export function fieldRowFor(docIndex, path) {
  // CSS.escape makes any key safe inside the attribute selector, so the
  // lookup is one indexed query instead of a scan over every row.
  return document.querySelector(
    `#editor-tree-rows .editor-field-row[data-index="${CSS.escape(String(docIndex))}"][data-path="${CSS.escape(path)}"]`
  );
}

/** How a value reads in the Value column. Mirrors nested-rows.js. */
export function displayText(val) {
  if (isExpandable(val)) return valueSummary(val);
  return val === null ? 'null' : String(val);
}

/**
 * Show a value on a row without re-rendering the tree: value text, drag/expand
 * payload and type label all follow. Children rendered from the previous value
 * are dropped so a later expand re-renders them from the new one.
 */
function setRowValue(row, val) {
  const valEl = row.querySelector('.editor-field-value');
  if (valEl) {
    const text = displayText(val);
    // SECURITY: textContent — field values are untrusted document data
    valEl.textContent = text;
    valEl.classList.toggle('nested-summary', isExpandable(val));
    valEl.classList.toggle('editor-field-value-empty', !isExpandable(val) && text === '');
  }

  row.dataset.valueRef = stashValue(val);
  const type = getFieldType(row.dataset.key || '', val);
  row.dataset.type = type;
  const typeEl = row.querySelector('.editor-field-type');
  if (typeEl) typeEl.textContent = type;

  const children = row.nextElementSibling;
  if (children?.classList.contains('editor-nested-children')) {
    children.innerHTML = '';
    delete children.dataset.rendered;
    row.classList.remove('nested-expanded');
  }
}

/**
 * Mark a row as carrying a staged change.
 * @param {HTMLElement|null} row
 * @param {{kind: 'set'|'unset', oldValue: *, newValue: *, display?: *}} change
 */
export function applyPendingToRow(row, change) {
  if (!row) return;
  row.classList.remove('editor-field-saved');

  if (change.kind === 'unset') {
    row.classList.add('editor-field-pending-remove');
    row.title = 'Staged for removal — apply or discard in the changes bar';
    return;
  }

  row.classList.remove('editor-field-pending-remove');
  row.classList.add('editor-field-pending');
  row.title = `Staged change — stored value: ${previewJson(change.oldValue, TOOLTIP_PREVIEW_CHARS)}`;
  setRowValue(row, change.display === undefined ? change.newValue : change.display);
}

/**
 * Undo a row's pending decoration, restoring the stored value for a 'set'.
 * @param {HTMLElement|null} row
 * @param {{kind: 'set'|'unset', oldValue: *}} change
 */
export function clearPendingFromRow(row, change) {
  if (!row) return;
  row.classList.remove('editor-field-pending', 'editor-field-pending-remove');
  row.removeAttribute('title');
  if (change.kind === 'set') setRowValue(row, change.oldValue);
}

/** Briefly highlight a row that was just written to the database. */
export function flashRowSaved(row) {
  if (!row) return;
  row.classList.remove('editor-field-pending', 'editor-field-pending-remove');
  row.removeAttribute('title');
  row.classList.add('editor-field-saved');
  setTimeout(() => row.classList.remove('editor-field-saved'), SAVED_FLASH_MS);
}

/** Drop a removed field's row (and its children container) from the tree. */
export function removeFieldRow(row) {
  if (!row) return;
  const children = row.nextElementSibling;
  if (children?.classList.contains('editor-nested-children')) children.remove();
  row.remove();
}

/** Keep a document header's "{ n fields }" summary honest after a removal. */
export function syncDocFieldCount(docIndex, doc) {
  const header = document.querySelector(
    `#editor-tree-rows .editor-doc-row[data-doc-index="${docIndex + 1}"] > .editor-doc-header .editor-doc-value`
  );
  if (header) header.textContent = `{ ${Object.keys(doc).length} fields }`;
}

/**
 * Re-decorate every staged row after a full tree render. Local search re-renders
 * the tree from the stored documents, which would otherwise leave the changes
 * bar claiming edits that no row shows. Wired up in pending-commit.js.
 */
export function reapplyPendingRows() {
  for (const group of pendingGroups()) {
    for (const change of group.changes.values()) {
      applyPendingToRow(fieldRowFor(group.docIndex, change.path), change);
    }
  }
}
