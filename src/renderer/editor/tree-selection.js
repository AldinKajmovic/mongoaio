import { toast } from '../utils/ui.js';
import { escapeHtml } from '../utils/dom.js';

// --- Tagged collections state ---
const taggedCollections = new Map(); // key → { alias, db, coll, node }

function collKey(alias, db, coll) {
  return `${alias}\0${db}\0${coll}`;
}

export function getTagged() {
  return Array.from(taggedCollections.values());
}

export function clearTags() {
  taggedCollections.forEach(v => v.node.classList.remove('tagged'));
  taggedCollections.clear();
}

export function tagCollection(alias, db, coll, node) {
  const key = collKey(alias, db, coll);
  taggedCollections.set(key, { alias, db, coll, node });
  node.classList.add('tagged');
}

export function untagCollection(alias, db, coll, node) {
  const key = collKey(alias, db, coll);
  taggedCollections.delete(key);
  node.classList.remove('tagged');
}

export function isTagged(alias, db, coll) {
  return taggedCollections.has(collKey(alias, db, coll));
}

export function toggleTag(alias, db, coll, node) {
  if (isTagged(alias, db, coll)) {
    untagCollection(alias, db, coll, node);
  } else {
    tagCollection(alias, db, coll, node);
  }
}

// --- Anchor for Shift+click range selection ---
let anchorNode = null;

export function setAnchor(node) {
  anchorNode = node;
}

export function getAnchor() {
  return anchorNode;
}

/**
 * Select a contiguous range of .tree-collection nodes between
 * the current anchor and the target node (inclusive).
 * All visible collection nodes in DOM order are considered.
 */
export function tagRange(targetNode) {
  if (!anchorNode || !targetNode) return;
  const tree = document.getElementById('editor-tree');
  if (!tree) return;

  // Get all visible collection nodes in DOM order
  const allColls = Array.from(tree.querySelectorAll('.tree-collection'));
  const anchorIdx = allColls.indexOf(anchorNode);
  const targetIdx = allColls.indexOf(targetNode);
  if (anchorIdx === -1 || targetIdx === -1) return;

  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);

  clearTags();
  for (let i = start; i <= end; i++) {
    const n = allColls[i];
    const { alias, db, coll } = n.dataset;
    tagCollection(alias, db, coll, n);
  }
}

// --- Clipboard for copy/paste ---
let clipboard = []; // Array of { alias, db, coll }

export function copyTaggedToClipboard() {
  clipboard = getTagged().map(({ alias, db, coll }) => ({ alias, db, coll }));
  const n = clipboard.length;
  toast(`Copied ${n} collection${n !== 1 ? 's' : ''} to clipboard`, 'info');
}

export function getClipboard() {
  return clipboard;
}

export function setClipboard(items) {
  clipboard = items;
}

// --- Context menu ---
let menuEl = null;

function ensureMenuEl() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.className = 'tree-context-menu';
  document.body.appendChild(menuEl);
  return menuEl;
}

function hideMenu() {
  if (menuEl) menuEl.classList.remove('visible');
}

// Close menu on any outside click or Escape
document.addEventListener('click', hideMenu);
document.addEventListener('contextmenu', (e) => {
  // Only keep open if re-triggered on the tree (handled below)
  if (!e.target.closest('.editor-tree')) hideMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideMenu();
});

/**
 * Show context menu at (x, y) with given items.
 * Each item: { label, disabled?, separator?, action }
 */
export function showContextMenu(x, y, items) {
  const menu = ensureMenuEl();
  menu.innerHTML = items.map(item => {
    if (item.separator) return '<div class="tree-ctx-separator"></div>';
    const cls = item.disabled ? ' disabled' : '';
    // SECURITY: escapeHtml prevents XSS from dynamic menu labels
    return `<button class="tree-ctx-item${cls}"${item.disabled ? ' disabled' : ''}>${escapeHtml(item.label)}</button>`;
  }).join('');

  // Bind actions
  const buttons = menu.querySelectorAll('.tree-ctx-item:not([disabled])');
  let btnIdx = 0;
  items.forEach(item => {
    if (item.separator || item.disabled) {
      if (!item.separator && item.disabled) btnIdx; // skip disabled in NodeList
      return;
    }
    const btn = buttons[btnIdx++];
    if (btn && item.action) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideMenu();
        item.action();
      }, { once: true });
    }
  });

  // Position
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('visible');

  // Adjust if off-screen
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + 'px';
    }
  });
}
