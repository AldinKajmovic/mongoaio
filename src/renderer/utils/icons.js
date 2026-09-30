/* =============================================
   Shared Inline SVG Icons
   ============================================= */

/** Path markup per glyph — the single place each icon's shape is defined. */
const ICON_PATHS = {
  trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  expand: '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>',
  drag: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"></path>',
  up: '<polyline points="18 15 12 9 6 15"></polyline>',
  down: '<polyline points="6 9 12 15 18 9"></polyline>',
  play: '<polygon points="5 3 19 12 5 21 5 3"></polygon>',
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  info: '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16.5"></line><line x1="12" y1="7.5" x2="12" y2="7.6"></line>'
};

/**
 * Inline SVG markup for a shared glyph.
 * @param {keyof ICON_PATHS} name
 * @param {number} [size] - width and height in pixels
 * @param {number} [strokeWidth]
 * @returns {string}
 */
export function icon(name, size = 12, strokeWidth = 2) {
  return `<svg width="${Number(size)}" height="${Number(size)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="${Number(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] ?? ''}</svg>`;
}
