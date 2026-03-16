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
 */
export function parseRelaxedJSON(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    // 1. Remove shell-like constructors: NumberInt(123) -> 123, etc.
    let fixed = str
      .replace(/NumberInt\((\d+)\)/g, '$1')
      .replace(/NumberLong\((\d+)\)/g, '$1')
      .replace(/Double\(([\d.]+)\)/g, '$1')
      .replace(/ObjectId\(['"]([0-9a-fA-F]{24})['"]\)/g, '"$1"')
      .replace(/ISODate\(['"](.+?)['"]\)/g, '"$1"')
      .replace(/new Date\(['"](.+?)['"]\)/g, '"$1"')
      .replace(/Date\(['"](.+?)['"]\)/g, '"$1"');

    // 2. Add quotes around unquoted keys: word chars and $ at start
    fixed = fixed.replace(/([{,]\s*)([$a-zA-Z_][$a-zA-Z0-9_.]*)\s*:/g, '$1"$2":');
    
    return JSON.parse(fixed);
  }
}

/**
 * Get nested value from object using dot notation
 */
export function getNestedValue(obj, path) {
  try {
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
  } catch (e) {
    return undefined;
  }
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

export function emptyState(text) {
  return `
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${text}</span>
    </div>
  `;
}

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const queryEscaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${queryEscaped})`, 'gi');
  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

/**
 * Render a placeholder for JSON that populates when visible/needed
 */
export function lazyPrettyJson(doc, containerId) {
  return `<div class="lazy-json" id="${containerId}" data-json='${JSON.stringify(doc).replace(/'/g, "&apos;")}'>
    <button class="btn btn-ghost btn-xs reveal-json-btn" data-container-id="${containerId}">Click to show full JSON</button>
  </div>`;
}

export function revealJson(id) {
  const container = document.getElementById(id);
  if (!container) return;
  const json = JSON.parse(container.dataset.json);
  container.innerHTML = `<pre>${prettyJson(json)}</pre>`;
  container.classList.add('revealed');
}

// Global delegation for revealJson
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.reveal-json-btn');
  if (btn && btn.dataset.containerId) {
    revealJson(btn.dataset.containerId);
  }
});

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    // Note: toast() must be provided by the caller or imported separately
    // to avoid circular dependencies. We use a dynamic import-free approach:
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

// No global assignment for security
