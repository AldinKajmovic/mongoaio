import { escapeHtml, highlightText } from '../utils/dom.js';

/**
 * Detect the BSON-like type for a field value
 */
export function getFieldType(key, val) {
  if (val === null) return 'Null';
  if (Array.isArray(val)) return 'Array';
  if (typeof val === 'number') return Number.isInteger(val) ? 'Int32' : 'Double';
  if (typeof val === 'boolean') return 'Boolean';
  if (typeof val === 'object') return 'Object';
  if (key === '_id' || (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val))) {
    return 'ObjectId';
  }
  return 'String';
}

/**
 * Check if a value is expandable (non-null object or array)
 */
export function isExpandable(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Get a short summary string for an expandable value
 */
export function valueSummary(val) {
  if (Array.isArray(val)) return `Array [${val.length}]`;
  return `Object {${Object.keys(val).length}}`;
}

/**
 * Render nested children for an expandable field value.
 * Returns HTML string of field rows at the given depth.
 */
export function renderNestedChildren(val, docIndex, depth, sq) {
  if (!isExpandable(val)) return '';

  const entries = Array.isArray(val)
    ? val.map((item, i) => [String(i), item])
    : Object.entries(val);

  return entries.map(([key, childVal]) => {
    const type = getFieldType(key, childVal);
    const expandable = isExpandable(childVal);
    const valStr = expandable
      ? valueSummary(childVal)
      : (childVal === null ? 'null' : String(childVal));

    const keyHtml = sq ? highlightText(key, sq) : escapeHtml(key);
    const valHtml = sq ? highlightText(valStr, sq) : escapeHtml(valStr);

    return `
      <div class="editor-field-row${expandable ? ' nested-expandable' : ''}" draggable="true"
           data-index="${docIndex}" data-key="${escapeHtml(key)}"
           data-field="${escapeHtml(key)}" data-type="${type}"
           data-value='${escapeHtml(JSON.stringify(childVal))}' data-depth="${depth}">
        <span class="editor-field-indent">
          ${expandable ? '<span class="tree-arrow nested-arrow">&#9654;</span>' : ''}
        </span>
        <span class="editor-field-key" data-index="${docIndex}"
              data-key="${escapeHtml(key)}" data-type="key">${keyHtml}</span>
        <span class="editor-field-value${expandable ? ' nested-summary' : ''}"
              data-index="${docIndex}" data-key="${escapeHtml(key)}"
              data-type="value">${valHtml}</span>
        <span class="editor-field-type u-text-muted u-font-xs u-ml-8">${type}</span>
      </div>
      ${expandable ? '<div class="editor-nested-children"></div>' : ''}`;
  }).join('');
}

/**
 * Toggle expansion of a nested-expandable field row.
 * Lazily renders children on first expand.
 */
export function toggleNestedField(fieldRow, sq) {
  const children = fieldRow.nextElementSibling;
  if (!children?.classList.contains('editor-nested-children')) return;

  const wasExpanded = fieldRow.classList.contains('nested-expanded');
  fieldRow.classList.toggle('nested-expanded');

  if (!wasExpanded && !children.dataset.rendered) {
    const val = JSON.parse(fieldRow.dataset.value);
    const docIndex = parseInt(fieldRow.dataset.index, 10);
    const depth = parseInt(fieldRow.dataset.depth || '0', 10) + 1;
    children.innerHTML = renderNestedChildren(val, docIndex, depth, sq);
    children.dataset.rendered = 'true';
    // Set depth-based indentation programmatically (CSP-compliant)
    applyDepthIndent(children);
  }
}

/**
 * Apply indentation to nested field rows based on data-depth
 */
function applyDepthIndent(container) {
  container.querySelectorAll('.editor-field-row').forEach(row => {
    const d = parseInt(row.dataset.depth, 10) || 0;
    row.style.paddingLeft = `${28 + d * 16}px`;
  });
}

// --- Table Value Viewer Popover ---

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

  // Handle nested expansion inside the popover
  body.addEventListener('click', (e) => {
    const arrow = e.target.closest('.nested-arrow');
    if (arrow) {
      const row = arrow.closest('.nested-expandable');
      if (row) toggleNestedField(row, '');
    }
  });

  document.body.appendChild(popover);
  activePopover = popover;

  // Position popover near the anchor cell
  const rect = anchorEl.getBoundingClientRect();
  const popH = popover.offsetHeight;
  const popW = popover.offsetWidth;
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= popH + 8 ? rect.bottom + 4 : rect.top - popH - 4;
  const left = Math.min(rect.left, window.innerWidth - popW - 8);
  popover.style.top = `${Math.max(4, top)}px`;
  popover.style.left = `${Math.max(4, left)}px`;

  // Close on outside click (deferred to avoid immediate close)
  closeHandler = (e) => {
    if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
      hideValueViewer();
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
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
