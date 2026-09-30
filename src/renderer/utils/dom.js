/* =============================================
   CompareDB — Pure Utility Functions
   ============================================= */

export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Parse relaxed JSON that allows unquoted keys (MongoDB shell style).
 * e.g. {polNum: "value", $gt: 5} -> {"polNum": "value", "$gt": 5}
 *
 * mongosh constructors become Extended JSON markers ({"$oid"}, {"$date"},
 * {"$numberLong"}, {"$numberDecimal"}) so the backend queries real BSON types.
 * Values are captured verbatim; validity is enforced by the backend.
 */
export function parseRelaxedJSON(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    let fixed = str
      .replace(/NumberInt\(\s*['"]?(-?\d+)['"]?\s*\)/g, '$1')
      .replace(/NumberLong\(\s*['"]?(-?\d+)['"]?\s*\)/g, '{"$$numberLong":"$1"}')
      .replace(/NumberDecimal\(\s*['"]?([-\d.eE+]+)['"]?\s*\)/g, '{"$$numberDecimal":"$1"}')
      .replace(/Double\(\s*(-?[\d.]+)\s*\)/g, '$1')
      .replace(/ObjectId\(\s*['"]([^'"]*)['"]\s*\)/g, '{"$$oid":"$1"}')
      .replace(/(?:new\s+)?(?:ISODate|Date)\(\s*['"](.+?)['"]\s*\)/g, '{"$$date":"$1"}');

    fixed = fixed.replace(/([{,]\s*)([$a-zA-Z_][$a-zA-Z0-9_.]*)\s*:/g, '$1"$2":');
    
    return JSON.parse(fixed);
  }
}

/**
 * Get nested value from object using dot notation. Returns undefined if the
 * path touches an unsafe prototype key (see UNSAFE_KEYS).
 */
export function getNestedValue(obj, path) {
  try {
    const parts = path.split('.');
    if (parts.some(p => UNSAFE_KEYS.has(p))) return undefined;
    return parts.reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
  } catch (e) {
    return undefined;
  }
}

// SECURITY: Document field names are untrusted (a compared DB could contain a
export const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Set a nested value using dot notation, creating intermediate objects as
 * needed. Array indices work because arrays accept string keys (e.g. arr['4']).
 * No-ops if any path segment is an unsafe prototype key.
 */
export function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  if (parts.some(p => UNSAFE_KEYS.has(p))) return;
  const last = parts.pop();
  let cur = obj;
  for (const part of parts) {
    if (cur[part] === null || typeof cur[part] !== 'object') cur[part] = {};
    cur = cur[part];
  }
  cur[last] = value;
}

export function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url.substring(0, 30);
  }
}

export function prettyJson(obj) {
  return JSON.stringify(obj, null, 2);
}

export function formatValue(val) {
  if (val === undefined) return '<em class="u-text-muted">missing</em>';
  if (val === null) return '<em class="u-text-muted">null</em>';
  if (typeof val === 'object') return escapeHtml(JSON.stringify(val));
  return escapeHtml(String(val));
}

/** Empty-state block; `text` is plain text (it often echoes the user's search) and is escaped. */
export function emptyState(text) {
  return `
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

/**
 * Escape a string for both HTML text and attribute values. `'` must be escaped
 * too: values are embedded in single-quoted attributes (e.g. data-value='...'),
 * so an apostrophe in the data (`"Rider's list"`) would close the attribute
 * early and truncate whatever follows.
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const queryEscaped = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${queryEscaped})`, 'gi');
  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

/**
 * querySelectorAll typed as HTML elements — the renderer's selectors only ever
 * match HTML elements (never SVG), so their style/dataset are available.
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {NodeListOf<HTMLElement>}
 */
export function queryAllHtml(selector, root = document) {
  return /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(selector));
}

/**
 * Closest ancestor of an event's target matching `selector` (the target itself included).
 * @param {Event} e
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
export function closestTarget(e, selector) {
  return e.target instanceof Element ? /** @type {HTMLElement | null} */ (e.target.closest(selector)) : null;
}

/**
 * Render a placeholder for JSON that populates when visible/needed
 */
export function lazyPrettyJson(doc, containerId) {
  const id = escapeHtml(containerId);
  return `<div class="lazy-json" id="${id}" data-json='${escapeHtml(JSON.stringify(doc))}'>
    <button class="btn btn-ghost btn-xs reveal-json-btn" data-container-id="${id}">Click to show full JSON</button>
  </div>`;
}

export function revealJson(id) {
  const container = document.getElementById(id);
  if (!container) return;
  const json = JSON.parse(container.dataset.json);
  container.innerHTML = `<pre>${prettyJson(json)}</pre>`;
  container.classList.add('revealed');
}

document.addEventListener('click', (e) => {
  const btn = closestTarget(e, '.reveal-json-btn');
  if (btn && btn.dataset.containerId) {
    revealJson(btn.dataset.containerId);
  }
});

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    const el = document.createElement('div');
    el.className = 'toast success';
    el.textContent = 'Copied to clipboard';
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3000);
  } catch (err) {
    console.error('Failed to copy: ', err);
    const el = document.createElement('div');
    el.className = 'toast error';
    el.textContent = 'Failed to copy';
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

