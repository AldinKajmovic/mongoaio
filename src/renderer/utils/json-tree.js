import { escapeHtml } from './dom.js';

// Keys preferred as a human-readable label for an object node, in priority order.
const LABEL_KEYS = ['_id', 'id', 'name', 'label', 'title', 'key'];
const MAX_LABEL_LEN = 40;

function truncate(str) {
  return str.length > MAX_LABEL_LEN ? `${str.slice(0, MAX_LABEL_LEN)}…` : str;
}

// Values are already serialized to plain JSON, so a string compare is sufficient.
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function renderPrimitive(value) {
  if (value === undefined) return '<span class="jt-empty">missing</span>';
  if (value === null) return '<span class="jt-null">null</span>';
  const type = typeof value;
  if (type === 'string') return `<span class="jt-string">"${escapeHtml(value)}"</span>`;
  if (type === 'number') return `<span class="jt-number">${escapeHtml(String(value))}</span>`;
  if (type === 'boolean') return `<span class="jt-boolean">${value}</span>`;
  return `<span class="jt-value">${escapeHtml(String(value))}</span>`;
}

/**
 * Build a short summary for an object: identifying field(s) + field count,
 * so a collapsed node can be scanned (e.g. a `cards` array item by its id/name).
 */
function objectSummary(obj) {
  const keys = Object.keys(obj);
  const parts = [];
  for (const k of LABEL_KEYS) {
    if (k in obj && obj[k] !== null && typeof obj[k] !== 'object') {
      parts.push(`${k}: ${truncate(String(obj[k]))}`);
    }
    if (parts.length === 2) break;
  }
  const count = `${keys.length} field${keys.length !== 1 ? 's' : ''}`;
  return parts.length ? `{ ${parts.join(' · ')} } · ${count}` : `{ ${count} }`;
}

// Resolve the counterpart child value on the opposite side, for diff marking.
function counterpart(other, key, isArray) {
  if (other === null || typeof other !== 'object') return undefined;
  if (isArray && !Array.isArray(other)) return undefined;
  return other[key];
}

/**
 * Recursively render a JSON value as a collapsible tree.
 * When `compare` is true, each node is checked against `other` (the value at
 * the same path on the opposite side) and marked `jt-diff` when it differs;
 * differing nodes are auto-expanded so the changed path is revealed.
 * @param {*} value - the value to render
 * @param {string|number|null} key - the key/label for this node
 * @param {number} depth - current nesting depth
 * @param {number} autoOpenDepth - nodes shallower than this start expanded
 * @param {*} other - counterpart value on the opposite side
 * @param {boolean} compare - whether to compute/mark diffs against `other`
 * @param {{path:string, docId:string}|null} ctx - when present, leaves become
 *   editable (carry `data-leaf-path`) and differing nested nodes get a sync
 *   checkbox. `path` is this node's dot-path from the document root.
 */
export function renderJsonTree(value, key = null, depth = 0, autoOpenDepth = 1, other = undefined, compare = false, ctx = null) {
  const differs = compare && !deepEqual(value, other);
  const diffClass = differs ? ' jt-diff' : '';
  const keyHtml = key !== null ? `<span class="jt-key">${escapeHtml(String(key))}:</span> ` : '';
  const isObject = value !== null && typeof value === 'object';
  const path = ctx ? ctx.path : null;

  // A sync checkbox for each differing node (both sides — the checkbox just
  // marks the path; the Sync buttons choose direction). Never on the root, which
  // the field-level checkbox already covers.
  const syncCell = (differs && ctx && key !== null)
    ? `<input type="checkbox" class="field-sync-checkbox jt-sync" data-doc-id="${escapeHtml(String(ctx.docId))}" data-field="${escapeHtml(path)}" title="Select this path to sync">`
    : '';

  if (!isObject) {
    const editBtn = path !== null ? '<span class="jt-edit-leaf" title="Edit this value">✎</span>' : '';
    const pathAttr = path !== null ? ` data-leaf-path="${escapeHtml(path)}"` : '';
    return `<div class="jt-node jt-leaf${diffClass}"${pathAttr}>${syncCell}${keyHtml}<span class="jt-leaf-val">${renderPrimitive(value)}</span>${editBtn}</div>`;
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);

  if (entries.length === 0) {
    return `<div class="jt-node jt-leaf${diffClass}">${syncCell}${keyHtml}<span class="jt-empty">${isArray ? '[ ]' : '{ }'}</span></div>`;
  }

  const open = depth < autoOpenDepth || differs;
  const summary = isArray
    ? `Array(${value.length})`
    : objectSummary(value);

  const children = entries
    .map(([k, v]) => renderJsonTree(
      v, k, depth + 1, autoOpenDepth,
      counterpart(other, k, isArray), compare,
      ctx ? { path: `${path}.${k}`, docId: ctx.docId } : null
    ))
    .join('');

  const branchPathAttr = path !== null ? ` data-path="${escapeHtml(path)}"` : '';
  return `
    <div class="jt-node">
      <div class="jt-toggle ${open ? 'expanded' : ''}${diffClass}"${branchPathAttr}>
        <span class="jt-caret">›</span>${syncCell}${keyHtml}<span class="jt-summary">${escapeHtml(summary)}</span>
      </div>
      <div class="jt-children ${open ? '' : 'collapsed'}">${children}</div>
    </div>`;
}

// Serialized values larger than this are deferred behind a reveal button so a
// single huge field (e.g. a `cards` array) cannot stall the initial render by
// forcing the whole tree's HTML to be built and parsed up front.
const LAZY_THRESHOLD = 2000;

/**
 * Display helper for a single field value. Objects/arrays render as a
 * collapsible tree; primitives fall back to plain text. When `compare` is
 * true, nested differences against `other` are highlighted.
 *
 * @param {Object} [opts]
 * @param {string|null} [opts.lazyId] - when set, large object/array values are
 *   deferred behind a reveal button (rendered on demand) to keep load fast.
 * @param {string|null} [opts.path] - this field's dot-path from the doc root;
 *   enables in-place leaf editing and nested sync.
 * @param {string|null} [opts.docId] - owning document id (for sync checkboxes).
 */
export function formatFieldValue(val, other = undefined, compare = false, opts = {}) {
  const { lazyId = null, path = null, docId = null } = opts;
  if (val === undefined) return '<em class="u-text-muted">missing</em>';
  if (val === null) return '<em class="u-text-muted">null</em>';
  if (typeof val === 'object') {
    const ctx = path !== null ? { path, docId } : null;
    if (lazyId) {
      const json = JSON.stringify(val);
      if (json.length > LAZY_THRESHOLD) {
        const summary = Array.isArray(val)
          ? `Array(${val.length})`
          : `{ ${Object.keys(val).length} field${Object.keys(val).length !== 1 ? 's' : ''} }`;
        const sizeKb = Math.max(1, Math.round(json.length / 1024));
        // Values (and their counterpart, for diffing) live in data attributes —
        // cheap strings — until revealed, so DOM nodes are built only on demand.
        const otherAttr = (compare && other !== undefined)
          ? ` data-other='${JSON.stringify(other).replace(/'/g, '&apos;')}'` : '';
        const ctxAttr = ctx
          ? ` data-base-path="${escapeHtml(path)}" data-doc-id="${escapeHtml(String(docId))}"` : '';
        return `<div class="lazy-field" id="${lazyId}" data-json='${json.replace(/'/g, '&apos;')}' data-compare="${compare ? '1' : '0'}"${otherAttr}${ctxAttr}>
          <button class="btn btn-ghost btn-xs reveal-field-btn" data-field-id="${lazyId}">Show value · ${summary} · ~${sizeKb} KB</button>
        </div>`;
      }
    }
    return `<div class="json-tree">${renderJsonTree(val, null, 0, 1, other, compare, ctx)}</div>`;
  }
  return escapeHtml(String(val));
}

/**
 * Render a deferred large field value (see formatFieldValue) into its tree on
 * demand, restoring the diff/edit context that was stashed on the placeholder.
 */
export function revealFieldValue(id) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains('revealed')) return;
  const val = JSON.parse(el.dataset.json);
  const other = el.dataset.other !== undefined ? JSON.parse(el.dataset.other) : undefined;
  const compare = el.dataset.compare === '1';
  const ctx = el.dataset.basePath !== undefined
    ? { path: el.dataset.basePath, docId: el.dataset.docId }
    : null;
  el.innerHTML = `<div class="json-tree">${renderJsonTree(val, null, 0, 1, other, compare, ctx)}</div>`;
  el.classList.add('revealed');
}
