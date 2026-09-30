/* =============================================
   Editor — Full Field Path Popover
   ============================================= */

import { openPopover } from '../utils/popover.js';
import { copyToClipboard, closestTarget } from '../utils/dom.js';

/**
 * A query-builder block clips a deep field to something like `cards.3.…`, which
 * is unreadable exactly when it matters. This popover spells the path out
 * segment by segment, shows it in full, and hands it to the clipboard.
 */

/** Buttons that open this popover. */
const PATH_BUTTONS = '.editor-qb-btn-path';

/**
 * Where a path button takes its field from.
 * @typedef {{path: string, type: string, valueText: () => string}} PathContext
 */

/**
 * @param {HTMLElement} btn
 * @returns {PathContext}
 */
function contextFor(btn) {
  const block = btn.closest('.editor-qb-block');
  if (block) {
    // The field input is editable, so read it now rather than trusting markup
    // captured when the block was rendered.
    return {
      path: (/** @type {HTMLInputElement | null} */ (block.querySelector('.editor-qb-field-input')))?.value.trim() || '',
      type: (/** @type {HTMLSelectElement | null} */ (block.querySelector('.editor-qb-type-select')))?.value || '',
      valueText: () => (/** @type {HTMLInputElement | null} */ (block.querySelector('.editor-qb-value-input')))?.value || ''
    };
  }

  return { path: btn.dataset.path || '', type: '', valueText: () => '' };
}

/** One `<span>` carrying untrusted text. */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  // SECURITY: textContent — document field names are untrusted
  el.textContent = text;
  return el;
}

/** Path rendered as chips, so a long nested path stays readable when wrapped. */
function buildSegments(path) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-field-path-segments';
  path.split('.').forEach((part, i) => {
    if (i > 0) wrap.appendChild(span('editor-field-path-sep', '›'));
    // Array indexes read differently from keys, so mark them as such.
    const isIndex = /^\d+$/.test(part);
    wrap.appendChild(span(`editor-field-path-chip${isIndex ? ' is-index' : ''}`, part));
  });
  return wrap;
}

function buildCopyRow(ctx) {
  const actions = document.createElement('div');
  actions.className = 'editor-field-path-actions';

  const copyPath = document.createElement('button');
  copyPath.className = 'btn btn-ghost btn-sm';
  copyPath.textContent = 'Copy path';
  copyPath.addEventListener('click', () => copyToClipboard(ctx.path));

  const copyValue = document.createElement('button');
  copyValue.className = 'btn btn-ghost btn-sm';
  copyValue.textContent = 'Copy value';
  copyValue.addEventListener('click', () => copyToClipboard(ctx.valueText()));

  actions.appendChild(copyPath);
  actions.appendChild(copyValue);
  return actions;
}

/** Build and open the popover for one path button. */
function openFieldPath(btn) {
  const ctx = contextFor(btn);
  if (!ctx.path) return;

  const content = document.createElement('div');

  const head = document.createElement('div');
  head.className = 'editor-field-path-head';
  head.appendChild(span('editor-field-path-title', 'Field path'));
  head.appendChild(span('editor-field-path-type', ctx.type));
  content.appendChild(head);

  content.appendChild(buildSegments(ctx.path));
  content.appendChild(span('editor-field-path-full', ctx.path));
  content.appendChild(buildCopyRow(ctx));

  openPopover(btn, content, { className: 'editor-field-path-popover', align: 'right' });
}

document.addEventListener('click', (e) => {
  const btn = closestTarget(e, PATH_BUTTONS);
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  openFieldPath(btn);
});
