import { state } from '../utils/state.js';
import { showLoading, hideLoading, toast } from '../utils/ui.js';
import { highlightText, escapeHtml } from '../utils/dom.js';
import { currentRenderedItems, runEditorQuery } from './query.js';

/**
 * Repaint the highlight backdrop behind an open JSON editor. A textarea's
 * native ::selection is not painted while the textarea is blurred (during a
 * search focus sits in the find bar), so matches are drawn as <mark>
 * backgrounds on a mirror layer that sits behind the transparent textarea.
 * @param {string} query Search term (case-insensitive)
 * @param {number} [activeIndex] Index of the current match to emphasise
 */
export function renderJsonEditorHighlights(query, activeIndex = -1) {
  const ta = document.querySelector('.editor-json-inline-textarea');
  if (!ta) return;
  const layer = ta.closest('.editor-json-edit-wrapper')?.querySelector('.editor-json-edit-highlights');
  if (!layer) return;
  // Preserve a trailing newline so wrapped lines stay aligned with the textarea.
  const text = ta.value.endsWith('\n') ? ta.value + ' ' : ta.value;
  layer.innerHTML = query ? highlightText(text, query) : escapeHtml(text);
  if (activeIndex >= 0) {
    const active = layer.querySelectorAll('mark.search-highlight')[activeIndex];
    if (active) {
      active.classList.remove('search-highlight');
      active.classList.add('search-highlight-active');
    }
  }
}

export function startJsonInlineEdit(event, docIndex) {
  const container = event.target.closest('.editor-json-doc-item');
  if (!container) return;
  if (container.querySelector('textarea')) return;

  const doc = currentRenderedItems[docIndex];
  if (!doc) return;

  const originalHtml = container.innerHTML;
  const originalJson = JSON.stringify(doc, null, 2);

  const textarea = document.createElement('textarea');
  textarea.className = 'editor-json-inline-textarea';
  textarea.value = originalJson;
  textarea.spellcheck = false;

  // Auto-resize
  const updateHeight = () => {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight + 5) + 'px';
  };

  // Wrap the textarea so search matches can be painted on a mirror layer
  // behind it (a textarea's own selection is invisible while it is blurred).
  const wrapper = document.createElement('div');
  wrapper.className = 'editor-json-edit-wrapper';
  const highlights = document.createElement('div');
  highlights.className = 'editor-json-edit-highlights';
  wrapper.appendChild(highlights);
  wrapper.appendChild(textarea);

  container.innerHTML = '';
  container.appendChild(wrapper);
  updateHeight();

  // Open the editor on the value the user searched for, instead of letting a
  // focused full-height textarea jump the panel to the bottom.
  const panel = container.closest('.editor-data-panel');
  const sq = document.getElementById('editor-search-input')?.value || '';
  const matchIdx = sq ? originalJson.toLowerCase().indexOf(sq.toLowerCase()) : -1;
  renderJsonEditorHighlights(sq, matchIdx >= 0 ? 0 : -1);

  textarea.focus({ preventScroll: true });
  if (matchIdx >= 0) textarea.setSelectionRange(matchIdx, matchIdx + sq.length);
  else textarea.setSelectionRange(0, 0);

  requestAnimationFrame(() => {
    if (!panel) return;
    const taTop = textarea.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    if (matchIdx >= 0) {
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 16;
      const lineNo = originalJson.slice(0, matchIdx).split('\n').length - 1;
      panel.scrollTo({ top: Math.max(0, taTop + lineNo * lineHeight - panel.clientHeight / 2), behavior: 'smooth' });
    } else {
      panel.scrollTo({ top: Math.max(0, taTop - 8), behavior: 'auto' });
    }
  });

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;

    if (save && textarea.value !== originalJson) {
      try {
        const updatedDoc = JSON.parse(textarea.value);

        // Safety check for _id
        if (String(updatedDoc._id) !== String(doc._id)) {
          throw new Error('Changing _id is not allowed.');
        }

        showLoading('Updating document...');
        const result = await window.api.updateDocument(
          state.editor.side,
          state.editor.db,
          state.editor.coll,
          doc._id,
          updatedDoc
        );
        hideLoading();

        if (result.error) throw new Error(result.error);
        toast('Document updated', 'success');
        runEditorQuery();
      } catch (err) {
        toast(err.message, 'error');
        container.innerHTML = originalHtml;
      }
    } else {
      container.innerHTML = originalHtml;
    }
  };

  textarea.onblur = (e) => {
    // Keep the editor open when focus moves to the find bar/button, so the
    // user can search within the document they're editing.
    const rt = e.relatedTarget;
    if (rt && (rt.closest('#editor-search-bar') || rt.id === 'btn-editor-search-local')) return;
    finish(true);
  };
  textarea.oninput = () => {
    updateHeight();
    renderJsonEditorHighlights(document.getElementById('editor-search-input')?.value || '');
  };
  textarea.onkeydown = (e) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter for a new line
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + "\n" + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        updateHeight();
      } else {
        // Enter only for saving
        e.preventDefault();
        finish(true);
      }
    }
    if (e.key === 'Escape') {
      finish(false);
    }
  };
};
