/* =============================================
   Editor — Undo the Last Applied Batch
   ============================================= */

import { state } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { getNestedValue } from '../utils/dom.js';
import { hasPending } from './pending-edits.js';
import { fieldRowFor, clearPendingFromRow, flashRowSaved } from './pending-dom.js';
import { locateDocIndex, replaceLocalDoc } from './pending-local.js';
import { currentRenderedItems, currentEJSONItems, renderEditorResults } from './query.js';


/**
 * One reverted path of an applied batch (built by pending-commit.js undoEntryFor).
 * @typedef {object} UndoChange
 * @property {string} path
 * @property {'set'|'unset'} kind
 * @property {*} oldEJSON - value before the apply (canonical EJSON), undefined if unknown
 * @property {boolean} oldMissing - the path did not exist before the apply
 * @property {*} newEJSON - value the apply wrote, undefined for a removal
 */

/** @type {{ side: string, db: string, coll: string, groups: Array<{docKey: string, docId: *, docIndex: number, changes: UndoChange[]}> } | null} */
let lastBatch = null;

function notify() {
  document.dispatchEvent(new CustomEvent('editor-undo-changed'));
}

/** Remember a successfully applied batch; replaces any earlier one. */
export function recordAppliedBatch(batch) {
  lastBatch = batch;
  notify();
}

export function clearUndo() {
  if (!lastBatch) return;
  lastBatch = null;
  notify();
}

/** The undoable batch for the collection on screen, or null. */
export function undoInfo() {
  if (!lastBatch || lastBatch.db !== state.editor.db || lastBatch.coll !== state.editor.coll) return null;
  const changes = lastBatch.groups.reduce((n, g) => n + g.changes.length, 0);
  return { changes, docs: lastBatch.groups.length };
}

/** Old values back, guarded by the values the apply wrote. */
function inverseRequest(group) {
  const set = {};
  const unset = [];
  const expect = {};
  const expectMissing = [];
  for (const change of group.changes) {
    if (!change.oldMissing && change.oldEJSON === undefined) continue; // old value unknown
    if (change.newEJSON === undefined) expectMissing.push(change.path);
    else expect[change.path] = change.newEJSON;
    if (change.oldMissing) unset.push(change.path);
    else set[change.path] = change.oldEJSON;
  }
  return { set, unset, expect, expectMissing, exact: true };
}

/** Show undone values on the page without losing the tree's expansion state. */
function settleUndoneRows(group, index, savedDoc) {
  for (const change of group.changes) {
    const row = fieldRowFor(index, change.path);
    clearPendingFromRow(row, { kind: 'set', oldValue: getNestedValue(savedDoc, change.path) });
    flashRowSaved(row);
  }
}

/** A removed field has no row to restore into — re-render from the local copies. */
function rerenderFromLocal() {
  const limit = state.editor.limit || currentRenderedItems.length || 1;
  renderEditorResults({
    items: currentRenderedItems,
    itemsEJSON: currentEJSONItems,
    page: Math.floor((state.editor.skip || 0) / limit) + 1,
    limit,
    total: state.editor.total,
  }, true);
}

/** Revert every document of the last applied batch. */
export async function undoLastBatch() {
  const info = undoInfo();
  if (!info) return;
  if (hasPending()) {
    toast('Apply or discard your staged changes before undoing', 'warning');
    return;
  }

  const { side, db, coll, groups } = lastBatch;
  const failures = [];
  let needsRerender = false;

  showLoading(`Undoing ${info.changes} change${info.changes === 1 ? '' : 's'}...`);
  for (const group of groups) {
    try {
      const result = await window.api.applyFieldChanges(side, db, coll, group.docId, inverseRequest(group));
      if (result?.error) throw new Error(result.error);
      const index = locateDocIndex(group.docKey, group.docIndex);
      if (index < 0) continue;
      replaceLocalDoc(index, result);
      if (group.changes.some(c => c.kind === 'unset' || c.oldMissing)) needsRerender = true;
      else settleUndoneRows(group, index, result.document);
    } catch (err) {
      failures.push(err.message);
    }
  }
  hideLoading();
  clearUndo();
  if (needsRerender) rerenderFromLocal();

  if (failures.length === 0) toast(`Undid ${info.changes} change${info.changes === 1 ? '' : 's'}`, 'success');
  else toast(`${failures.length} document${failures.length === 1 ? '' : 's'} could not be undone: ${failures[0]}`, 'error');
}

// A different collection means the batch no longer belongs to what's on screen.
document.addEventListener('editor-query-ran', notify);
