/* =============================================
   Editor — Applying / Discarding Staged Edits
   ============================================= */

import { state } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { getNestedValue } from '../utils/dom.js';
import { currentEJSONItems, writeIdFor } from './query.js';
import { pendingGroups, clearGroup, discardAll, pendingCount } from './pending-edits.js';
import {
  fieldRowFor, clearPendingFromRow, flashRowSaved, removeFieldRow, reapplyPendingRows
} from './pending-dom.js';
import { locateDocIndex, replaceLocalDoc } from './pending-local.js';
import { recordAppliedBatch } from './pending-undo.js';

/** Bring the tree rows of a committed group up to date, showing the value as saved (the main process may have coerced it, e.g. */
function settleGroupRows(group, index, savedDoc) {
  for (const change of group.changes.values()) {
    const row = fieldRowFor(index, change.path);
    if (change.kind === 'unset') {
      removeFieldRow(row);
    } else {
      clearPendingFromRow(row, { kind: 'set', oldValue: getNestedValue(savedDoc, change.path) });
      flashRowSaved(row);
    }
  }
}

/** One document's $set/$unset plus the values the user saw, for the server's conflict check. */
function buildRequest(group, index) {
  const ejsonDoc = index >= 0 ? currentEJSONItems[index] : undefined;
  const set = {};
  const unset = [];
  const expect = {};
  const expectMissing = [];
  for (const change of group.changes.values()) {
    if (ejsonDoc) {
      const before = getNestedValue(ejsonDoc, change.path);
      if (before === undefined) expectMissing.push(change.path);
      else expect[change.path] = before;
    }
    if (change.kind === 'unset') unset.push(change.path);
    else set[change.path] = change.newValue;
  }
  return { set, unset, expect, expectMissing };
}

/** Send one document's staged changes. Throws with the server's message. */
async function writeGroup(group, side, index) {
  const { db, coll } = state.editor;
  const request = buildRequest(group, index);
  const docId = index >= 0 ? writeIdFor(index) : group.docId;
  const result = await window.api.applyFieldChanges(side, db, coll, docId, request);
  if (result?.error) throw new Error(result.error);
  return { result, request, docId };
}

/**
 * What undoing a committed group needs: old values back, guarded by the new ones.
 * Old values come from the server's canonical `previousEJSON` when present, so a
 * whole-number double is restored as a double rather than the int its relaxed form reads as.
 */
function undoEntryFor(group, request, docId, result) {
  const previous = result.previousEJSON || {};
  const savedEJSON = result.documentEJSON;
  return {
    docKey: group.docKey,
    docId,
    docIndex: group.docIndex,
    changes: [...group.changes.values()].map(change => ({
      path: change.path,
      kind: change.kind,
      oldEJSON: Object.hasOwn(previous, change.path) ? previous[change.path] : request.expect[change.path],
      oldMissing: request.expectMissing.includes(change.path),
      newEJSON: getNestedValue(savedEJSON, change.path),
    })),
  };
}

/** Flush every staged change: one atomic update per document ($set and $unset together). */
export async function applyPendingChanges() {
  const groups = pendingGroups();
  if (groups.length === 0) return;

  const side = state.editor.side || 'source';
  const total = pendingCount();
  const failures = [];
  const applied = [];

  showLoading(`Applying ${total} change${total === 1 ? '' : 's'}...`);
  for (const group of groups) {
    const index = locateDocIndex(group.docKey, group.docIndex);
    try {
      const { result, request, docId } = await writeGroup(group, side, index);
      replaceLocalDoc(index, result);
      settleGroupRows(group, index, result.document);
      applied.push(undoEntryFor(group, request, docId, result));
      clearGroup(group.docKey);
    } catch (err) {
      failures.push(err.message);
    }
  }
  hideLoading();

  if (applied.length > 0) {
    recordAppliedBatch({ side, db: state.editor.db, coll: state.editor.coll, groups: applied });
  }

  const savedDocs = applied.length;
  if (failures.length === 0) {
    toast(`${total} change${total === 1 ? '' : 's'} saved in ${savedDocs} document${savedDocs === 1 ? '' : 's'}`, 'success');
  } else {
    toast(`${failures.length} document${failures.length === 1 ? '' : 's'} failed: ${failures[0]}`, 'error');
  }
}

/** Drop every staged change and restore the rows to their stored values. */
export function discardPendingChanges(silent = false) {
  const groups = pendingGroups();
  if (groups.length === 0) return;
  const total = pendingCount();

  for (const group of groups) {
    for (const change of group.changes.values()) {
      clearPendingFromRow(fieldRowFor(group.docIndex, change.path), change);
    }
  }
  discardAll();
  if (!silent) toast(`${total} change${total === 1 ? '' : 's'} discarded`, 'info');
}

// query.js asks for a discard through an event rather than importing this
// module, which would close a renderer → query → commit → query import cycle.
document.addEventListener('editor-discard-pending', (e) => {
  discardPendingChanges(/** @type {CustomEvent} */ (e).detail?.silent === true);
});

document.addEventListener('editor-tree-rendered', reapplyPendingRows);

// Veto unload while edits are staged; main.js asks the user (confirmDiscardOnClose).
window.addEventListener('beforeunload', (e) => {
  if (pendingCount() > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});
