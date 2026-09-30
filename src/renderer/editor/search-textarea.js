/* =============================================
   Editor — Find Inside an Open JSON Editor
   ============================================= */

import { renderJsonEditorHighlights } from './json-edit.js';

let matches = [];
let index = -1;

/** The open JSON-view edit textarea, if any. When present, find operates on it. */
export function getActiveJsonEditTextarea() {
  return document.querySelector('.editor-json-inline-textarea');
}

/** True when the textarea find currently owns the match list. */
export function hasTextareaMatches() {
  return matches.length > 0;
}

/** Forget any collected matches (find bar closed, or results re-rendered). */
export function resetTextareaMatches() {
  matches = [];
  index = -1;
}

/**
 * Find matches within an open JSON editor textarea and select the first one.
 * Focus stays in the search input so Enter/Shift+Enter can step through them.
 * @returns {number} the number of matches found
 */
export function searchInTextarea(ta, query, countEl) {
  matches = [];
  if (query) {
    const hay = ta.value.toLowerCase();
    let i = hay.indexOf(query);
    while (i !== -1) {
      matches.push(i);
      i = hay.indexOf(query, i + query.length);
    }
  }
  index = matches.length ? 0 : -1;
  if (index >= 0) selectMatch(ta, 0, query);
  updateCount(countEl, query);
  renderJsonEditorHighlights(query, index);
  return matches.length;
}

/**
 * Step to the next/previous textarea match.
 * @returns {boolean} true when the step was handled here
 */
export function navigateTextarea(ta, direction, query, countEl) {
  if (!matches.length) return false;
  index = (index + direction + matches.length) % matches.length;
  selectMatch(ta, index, query);
  updateCount(countEl, query);
  renderJsonEditorHighlights(query, index);
  return true;
}

/** Select one match and scroll its line into the middle of the panel. */
function selectMatch(ta, at, query) {
  const start = matches[at];
  ta.setSelectionRange(start, start + query.length);

  const panel = ta.closest('.editor-data-panel');
  if (!panel) return;
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 16;
  const lineNo = ta.value.slice(0, start).split('\n').length - 1;
  const taTop = ta.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  panel.scrollTo({
    top: Math.max(0, taTop + lineNo * lineHeight - panel.clientHeight / 2),
    behavior: 'smooth'
  });
}

function updateCount(countEl, query) {
  if (!countEl) return;
  countEl.textContent = matches.length === 0
    ? (query ? 'No results' : '')
    : `${index + 1} of ${matches.length}`;
}
