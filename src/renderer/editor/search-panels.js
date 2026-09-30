/* =============================================
   Editor — Find Bar Panel Helpers
   ============================================= */

const PANEL_IDS = ['editor-data-tree', 'editor-data-json', 'editor-data-table'];

/** The results panel currently on screen, or null when none is. */
export function activePanel() {
  for (const id of PANEL_IDS) {
    const panel = document.getElementById(id);
    if (panel && panel.style.display !== 'none') return panel;
  }
  return null;
}

/** The tree panel when it is the one on screen, else null. */
export function activeTreePanel() {
  const panel = document.getElementById('editor-data-tree');
  return panel && panel.style.display !== 'none' ? panel : null;
}

/**
 * Expand every ancestor of a match (document row + nested branches) so the
 * match becomes visible even when buried several levels deep.
 */
export function expandAncestors(el, treePanel) {
  let node = el.parentElement;
  while (node && node !== treePanel) {
    if (node.classList.contains('editor-doc-children')) {
      const parentRow = node.closest('.editor-doc-row');
      if (parentRow) parentRow.classList.add('expanded');
    } else if (node.classList.contains('editor-nested-children')) {
      const fieldRow = node.previousElementSibling;
      if (fieldRow && fieldRow.classList.contains('nested-expandable')) {
        fieldRow.classList.add('nested-expanded');
      }
    }
    node = node.parentElement;
  }
}

/** Centre a match in its scrollable panel. */
export function scrollToMatch(el) {
  requestAnimationFrame(() => {
    const scrollParent = el.closest('.editor-data-panel');
    if (!scrollParent) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetTop = elRect.top - parentRect.top + scrollParent.scrollTop;
    scrollParent.scrollTo({
      top: offsetTop - scrollParent.clientHeight / 2,
      behavior: 'smooth'
    });
  });
}
