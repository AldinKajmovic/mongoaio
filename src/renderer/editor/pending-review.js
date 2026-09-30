/* =============================================
   Editor — Staged Changes Review Popup
   ============================================= */

import { openPopover, closePopover } from '../utils/popover.js';
import { pendingGroups, pendingCount, pendingDocCount, revertChange } from './pending-edits.js';
import { fieldRowFor, clearPendingFromRow, displayText } from './pending-dom.js';
import { icon } from '../utils/icons.js';

/** Longest value preview shown per side of a change. */
const PREVIEW_CHARS = 60;

function truncate(text) {
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
}

/** One `<span>` carrying untrusted text. */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  // SECURITY: textContent — paths and values are untrusted document data
  el.textContent = text;
  return el;
}

/** Render one staged change as a reviewable row. */
function changeRow(group, change, onRevert) {
  const row = document.createElement('div');
  row.className = 'editor-pending-item';
  row.appendChild(span('editor-pending-path', change.path));

  const delta = document.createElement('span');
  delta.className = 'editor-pending-delta';
  if (change.kind === 'unset') {
    delta.appendChild(span('editor-pending-removed', 'remove field'));
  } else {
    delta.appendChild(span('editor-pending-old', truncate(displayText(change.oldValue))));
    delta.appendChild(span('editor-pending-arrow', '→'));
    delta.appendChild(span('editor-pending-new', truncate(displayText(change.display ?? change.newValue))));
  }
  row.appendChild(delta);

  const revert = document.createElement('button');
  revert.className = 'editor-pending-revert btn-icon btn-sm';
  revert.title = 'Revert this change';
  revert.innerHTML = icon('close', 11, 2.5);
  revert.addEventListener('click', () => {
    const dropped = revertChange(group.docId, change.path);
    if (dropped) clearPendingFromRow(fieldRowFor(group.docIndex, change.path), dropped);
    onRevert();
  });
  row.appendChild(revert);

  return row;
}

/** Build the popup body: changes grouped per document. */
function buildContent(onRevert, onApply, onDiscard) {
  const wrap = document.createElement('div');

  const head = document.createElement('div');
  head.className = 'editor-pending-popover-head';
  const changes = pendingCount();
  const docs = pendingDocCount();
  head.textContent = `${changes} change${changes === 1 ? '' : 's'} in ${docs} document${docs === 1 ? '' : 's'}`;
  wrap.appendChild(head);

  const list = document.createElement('div');
  list.className = 'editor-pending-list';
  for (const group of pendingGroups()) {
    const idText = typeof group.docId === 'object' ? JSON.stringify(group.docId) : String(group.docId);
    list.appendChild(span('editor-pending-doc', `_id: ${idText}`));
    for (const change of group.changes.values()) {
      list.appendChild(changeRow(group, change, onRevert));
    }
  }
  wrap.appendChild(list);

  const foot = document.createElement('div');
  foot.className = 'editor-pending-popover-foot';

  const discard = document.createElement('button');
  discard.className = 'btn btn-ghost btn-sm';
  discard.textContent = 'Discard all';
  discard.addEventListener('click', onDiscard);

  const apply = document.createElement('button');
  apply.className = 'btn btn-primary btn-sm';
  apply.innerHTML = `${icon('check', 12, 2.5)}<span>Apply all</span>`;
  apply.addEventListener('click', onApply);

  foot.appendChild(discard);
  foot.appendChild(apply);
  wrap.appendChild(foot);

  return wrap;
}

/**
 * Open the review popup anchored to the pending bar's Review button. Reverting
 * the last change closes it, since there is nothing left to review.
 *
 * @param {HTMLElement} anchorEl
 * @param {{onApply: () => void, onDiscard: () => void}} handlers
 */
export function openPendingReview(anchorEl, handlers) {
  const rerender = () => {
    if (pendingCount() === 0) {
      closePopover();
      return;
    }
    openPendingReview(anchorEl, handlers);
  };

  const content = buildContent(rerender, handlers.onApply, handlers.onDiscard);
  openPopover(anchorEl, content, { className: 'editor-pending-popover', align: 'right' });
}
