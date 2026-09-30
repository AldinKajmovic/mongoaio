/* =============================================
   Editor — Table Value Viewer Popover
   ============================================= */

import { renderNestedChildren, toggleNestedField, applyDepthIndent } from './nested-rows.js';

export { getFieldType, isExpandable, valueSummary } from './field-types.js';
export {
  subtreeMatchesSearch, countMatches, claimAutoExpand,
  resetAutoExpandBudget, allocAutoExpandBudget, wasAutoExpandTruncated,
  MAX_AUTO_EXPANDED_ROWS
} from './tree-search.js';
import { closestTarget } from '../utils/dom.js';
export { renderNestedChildren, toggleNestedField, applyDepthIndent };

let activePopover = null;
let closeHandler = null;

/**
 * Show a value viewer popover anchored to a table cell.
 * Renders nested objects as an expandable tree.
 */
export function showValueViewer(val, anchorEl) {
  hideValueViewer();

  const popover = document.createElement('div');
  popover.className = 'value-viewer-popover';

  const header = document.createElement('div');
  header.className = 'value-viewer-header';
  // SECURITY: using textContent to prevent XSS
  header.textContent = Array.isArray(val) ? `Array [${val.length}]` : `Object {${Object.keys(val).length}}`;
  popover.appendChild(header);

  const body = document.createElement('div');
  body.className = 'value-viewer-body';
  body.innerHTML = renderNestedChildren(val, -1, 0, '');
  applyDepthIndent(body);
  popover.appendChild(body);

  body.addEventListener('click', (e) => {
    const arrow = closestTarget(e, '.nested-arrow');
    if (arrow) {
      const row = arrow.closest('.nested-expandable');
      if (row) toggleNestedField(row, '');
    }
  });

  document.body.appendChild(popover);
  activePopover = popover;

  positionPopover(popover, anchorEl);

  closeHandler = (e) => {
    if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
      hideValueViewer();
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

/** Place the popover just below its anchor, flipping up when it would overflow. */
function positionPopover(popover, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const popH = popover.offsetHeight;
  const popW = popover.offsetWidth;
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= popH + 8 ? rect.bottom + 4 : rect.top - popH - 4;
  const left = Math.min(rect.left, window.innerWidth - popW - 8);
  popover.style.top = `${Math.max(4, top)}px`;
  popover.style.left = `${Math.max(4, left)}px`;
}

/**
 * Hide the active value viewer popover
 */
export function hideValueViewer() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  if (closeHandler) {
    document.removeEventListener('click', closeHandler);
    closeHandler = null;
  }
}
