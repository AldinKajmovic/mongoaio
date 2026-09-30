/* =============================================
   Editor — Staged Changes Bar
   ============================================= */

import { icon } from '../utils/icons.js';
import { closePopover } from '../utils/popover.js';
import { hasPending, pendingCount, pendingDocCount } from './pending-edits.js';
import { applyPendingChanges, discardPendingChanges } from './pending-commit.js';
import { openPendingReview } from './pending-review.js';
import { undoInfo, undoLastBatch, clearUndo } from './pending-undo.js';

let bar = null;
let label = null;
/** Buttons shown while edits are staged vs. after an apply (undo mode). */
let stagedActions = null;
let undoActions = null;

/**
 * Build the bar once, as the last flex child of the collections view so it sits
 * between the results panel and the status bar (no overlay, no reflow of rows).
 */
function ensureBar() {
  if (bar) return bar;
  const host = document.getElementById('editor-view-collections-content');
  if (!host) return null;

  bar = document.createElement('div');
  bar.className = 'editor-pending-bar u-hidden';
  bar.id = 'editor-pending-bar';

  const dot = document.createElement('span');
  dot.className = 'editor-pending-dot';
  bar.appendChild(dot);

  label = document.createElement('span');
  label.className = 'editor-pending-label';
  bar.appendChild(label);

  const actions = document.createElement('div');
  actions.className = 'editor-pending-actions';

  const review = document.createElement('button');
  review.className = 'btn btn-ghost btn-sm';
  review.textContent = 'Review';
  review.addEventListener('click', () => {
    openPendingReview(review, {
      onApply: () => { closePopover(); applyPendingChanges(); },
      onDiscard: () => { closePopover(); discardPendingChanges(); }
    });
  });

  const apply = document.createElement('button');
  apply.className = 'btn btn-primary btn-sm editor-pending-apply';
  apply.innerHTML = `${icon('check', 12, 2.5)}<span>Apply</span>`;
  apply.addEventListener('click', () => { closePopover(); applyPendingChanges(); });

  const discard = document.createElement('button');
  discard.className = 'btn btn-ghost btn-sm';
  discard.textContent = 'Discard';
  discard.addEventListener('click', () => { closePopover(); discardPendingChanges(); });

  actions.appendChild(review);
  actions.appendChild(apply);
  actions.appendChild(discard);
  bar.appendChild(actions);
  stagedActions = actions;

  undoActions = document.createElement('div');
  undoActions.className = 'editor-pending-actions u-hidden';
  const undo = document.createElement('button');
  undo.className = 'btn btn-ghost btn-sm';
  undo.textContent = 'Undo';
  undo.title = 'Restore the values these changes replaced';
  undo.addEventListener('click', () => { undoLastBatch(); });
  const dismiss = document.createElement('button');
  dismiss.className = 'btn-icon btn-sm';
  dismiss.title = 'Dismiss';
  dismiss.innerHTML = icon('close', 11, 2.5);
  dismiss.addEventListener('click', clearUndo);
  undoActions.appendChild(undo);
  undoActions.appendChild(dismiss);
  bar.appendChild(undoActions);

  host.appendChild(bar);
  return bar;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Reflect the stores: staged edits take priority; otherwise offer to undo the
 * last applied batch; otherwise hide the bar.
 */
function syncBar() {
  const undo = hasPending() ? null : undoInfo();
  if (!hasPending() && !undo) {
    if (bar) bar.classList.add('u-hidden');
    closePopover();
    return;
  }

  const el = ensureBar();
  if (!el) return;

  el.classList.toggle('editor-pending-bar-undo', !!undo);
  stagedActions.classList.toggle('u-hidden', !!undo);
  undoActions.classList.toggle('u-hidden', !undo);
  label.textContent = undo
    ? `${plural(undo.changes, 'change')} saved in ${plural(undo.docs, 'document')} `
    : `${plural(pendingCount(), 'unsaved change')} in ${plural(pendingDocCount(), 'document')}`;
  el.classList.remove('u-hidden');
}

document.addEventListener('editor-pending-changed', syncBar);
document.addEventListener('editor-undo-changed', syncBar);
