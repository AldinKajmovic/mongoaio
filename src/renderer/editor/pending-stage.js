/* =============================================
   Editor — Staging Entry Points (tree view)
   ============================================= */

import { toast } from '../utils/ui.js';
import { currentRenderedItems } from './query.js';
import { parseTypedInline } from './value-parse.js';
import { stageChange, getChange, revertChange } from './pending-edits.js';
import { applyPendingToRow, clearPendingFromRow } from './pending-dom.js';
import { elementValue } from './value-store.js';

/**
 * Stage a tree-view value edit instead of writing it straight to MongoDB.
 * The row shows the new value immediately; nothing is re-rendered, so every
 * expanded branch stays open.
 *
 * @param {HTMLElement} row - the .editor-field-row being edited
 * @param {number} docIndex
 * @param {string} path - dotted field path
 * @param {string} raw - the text the user typed
 * @returns {boolean} true when the edit was staged (caller leaves the row alone)
 */
export function stageValueEdit(row, docIndex, path, raw) {
  const doc = currentRenderedItems[docIndex];
  if (!doc || !path) return false;

  if (path === '_id') {
    toast('The _id field cannot be changed', 'warning');
    return false;
  }

  const { value, display } = parseTypedInline(raw);
  const change = stageChange(doc._id, docIndex, path, 'set', elementValue(row), value, display);
  if (change) {
    applyPendingToRow(row, change);
  } else {
    // Edited back to the stored value: the parsed value is that stored value,
    // so this both drops the pending decoration and restores the row's display.
    clearPendingFromRow(row, { kind: 'set', oldValue: display === undefined ? value : display });
  }
  return true;
}

/**
 * Toggle a staged removal for one field. A field with a staged value edit is
 * reverted first, so a document never holds both a $set and a $unset for the
 * same path.
 *
 * @param {HTMLElement} row
 * @param {number} docIndex
 * @param {string} path
 */
export function toggleStagedRemoval(row, docIndex, path) {
  const doc = currentRenderedItems[docIndex];
  if (!doc || !path) return;
  if (path === '_id') {
    toast('Cannot remove the _id field', 'warning');
    return;
  }

  const existing = getChange(doc._id, path);

  if (existing?.kind === 'unset') {
    revertChange(doc._id, path);
    clearPendingFromRow(row, existing);
    return;
  }

  if (existing) {
    revertChange(doc._id, path);
    clearPendingFromRow(row, existing);
  }

  const change = stageChange(doc._id, docIndex, path, 'unset', elementValue(row), undefined);
  applyPendingToRow(row, change);
}
