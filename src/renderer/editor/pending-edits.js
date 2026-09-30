/* =============================================
   Editor — Staged (Pending) Field Edits Store
   ============================================= */

/**
 * Tree-view edits used to write to MongoDB and re-run the query immediately,
 * which rebuilt #editor-tree-rows and collapsed every nested branch the user
 * had opened. Edits are staged here instead: this module owns *what* changed,
 * pending-dom.js shows it on the row, and one explicit confirm (pending-bar.js
 * → pending-commit.js) flushes everything — one $set per document, no re-render.
 *
 * Pure state: no DOM access, no IPC.
 */

/**
 * @typedef {object} PendingChange
 * @property {string} path - dotted field path inside the document
 * @property {'set'|'unset'} kind
 * @property {*} oldValue - value as stored before the first staged edit
 * @property {*} newValue - value to write (undefined for 'unset'); may be an
 *   Extended JSON marker such as {"$date": ...} for a typed edit
 * @property {*} [display] - how newValue reads in the tree, when it differs
 */

/**
 * @typedef {object} PendingGroup
 * @property {string} docKey - docKeyFor(_id), the map key
 * @property {*} docId - raw _id, as handed to the IPC layer
 * @property {number} docIndex - index into currentRenderedItems
 * @property {Map<string, PendingChange>} changes
 */

/** @type {Map<string, PendingGroup>} */
const groups = new Map();

/** Announce a store change so the pending bar can re-render. */
function notify() {
  document.dispatchEvent(new CustomEvent('editor-pending-changed'));
}

/** Structural equality — good enough for the JSON-shaped values rows carry. */
function valuesEqual(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

/** Map key for an _id; String() would collapse every compound _id to "[object Object]". */
export function docKeyFor(docId) {
  if (docId !== null && typeof docId === 'object') return `o:${JSON.stringify(docId)}`;
  return `${typeof docId}:${String(docId)}`;
}

/**
 * @param {*} docId
 * @param {number} docIndex
 * @returns {PendingGroup}
 */
function groupFor(docId, docIndex) {
  const docKey = docKeyFor(docId);
  const existing = groups.get(docKey);
  if (existing) {
    existing.docIndex = docIndex;
    return existing;
  }
  const created = { docKey, docId, docIndex, changes: new Map() };
  groups.set(docKey, created);
  return created;
}

/**
 * Stage one change. Re-staging the same path keeps the *original* stored value
 * as `oldValue`, so a revert always restores what MongoDB holds rather than an
 * intermediate draft. Setting a value back to the stored one un-stages it.
 *
 * @param {*} [display] - display form of newValue, when newValue is a typed marker
 * @returns {PendingChange|null} the staged change, or null when it cancelled out
 */
export function stageChange(docId, docIndex, path, kind, oldValue, newValue, display) {
  const group = groupFor(docId, docIndex);
  const existing = group.changes.get(path);
  const baseline = existing ? existing.oldValue : oldValue;

  if (kind === 'set' && valuesEqual(baseline, display === undefined ? newValue : display)) {
    group.changes.delete(path);
    if (group.changes.size === 0) groups.delete(group.docKey);
    notify();
    return null;
  }

  const change = { path, kind, oldValue: baseline, newValue };
  if (display !== undefined) change.display = display;
  group.changes.set(path, change);
  notify();
  return change;
}

/** @returns {PendingChange|undefined} */
export function getChange(docId, path) {
  return groups.get(docKeyFor(docId))?.changes.get(path);
}

/**
 * Drop one staged change.
 * @returns {PendingChange|null} the change that was dropped
 */
export function revertChange(docId, path) {
  const group = groups.get(docKeyFor(docId));
  const change = group?.changes.get(path);
  if (!change) return null;
  group.changes.delete(path);
  if (group.changes.size === 0) groups.delete(group.docKey);
  notify();
  return change;
}

/** Drop every staged change for one document (after a successful write). */
export function clearGroup(docKey) {
  if (!groups.delete(docKey)) return;
  notify();
}

/** Drop the whole store. */
export function discardAll() {
  if (groups.size === 0) return;
  groups.clear();
  notify();
}

/** @returns {PendingGroup[]} a snapshot, safe to iterate while committing */
export function pendingGroups() {
  return Array.from(groups.values());
}

export function pendingCount() {
  let total = 0;
  for (const group of groups.values()) total += group.changes.size;
  return total;
}

export function pendingDocCount() {
  return groups.size;
}

export function hasPending() {
  return groups.size > 0;
}
