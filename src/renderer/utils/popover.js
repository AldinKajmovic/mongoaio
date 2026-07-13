
let active = null; // { el, onDown, onKey, onClose }

export function isPopoverOpen() {
  return !!active;
}

export function closePopover() {
  if (!active) return;
  const { el, onDown, onKey, onClose } = active;
  active = null; // clear first so onClose/reentrancy can't double-run
  document.removeEventListener('mousedown', onDown, true);
  document.removeEventListener('keydown', onKey, true);
  el.remove();
  if (typeof onClose === 'function') onClose();
}

/**
 * @param {HTMLElement} anchorEl element the popover is positioned against
 * @param {HTMLElement|string} content element to mount, or an HTML string
 * @param {{className?: string, align?: 'left'|'right', onClose?: () => void}} [opts]
 * @returns {HTMLElement} the popover element
 */
export function openPopover(anchorEl, content, opts = {}) {
  closePopover();

  const el = document.createElement('div');
  if (opts.className) el.className = opts.className;
  // Guarantee the inline left/top are honoured regardless of the class's CSS.
  el.style.position = 'fixed';
  if (typeof content === 'string') el.innerHTML = content;
  else el.appendChild(content);
  document.body.appendChild(el);

  const rect = anchorEl.getBoundingClientRect();
  const pr = el.getBoundingClientRect();

  const align = opts.align || 'right';
  let left = align === 'right' ? rect.right - pr.width : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));

  let top = rect.bottom + 6;
  if (top + pr.height > window.innerHeight - 8) {
    const up = rect.top - pr.height - 6;
    top = up < 8 ? 8 : up;
  }

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const onDown = (e) => {
    if (el.contains(e.target)) return;
    if (anchorEl && (e.target === anchorEl || anchorEl.contains(e.target))) return;
    closePopover();
  };
  const onKey = (e) => { if (e.key === 'Escape') closePopover(); };

  active = { el, onDown, onKey, onClose: opts.onClose };
  // Defer so the click that opened the popover doesn't immediately dismiss it.
  setTimeout(() => {
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);

  return el;
}
