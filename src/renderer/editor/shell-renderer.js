import { elements } from '../utils/state.js';
import { escapeHtml } from '../utils/dom.js';
import { pushResult } from './shell-tabs.js';

/**
 * Append a result item to the shell results area and persist in active tab.
 */
export function appendShellResult(query, content, type = 'success', meta = {}) {
  const container = elements.editorShellResults;
  if (!container) return;

  // Persist into active tab state
  pushResult(query, content, type, meta);

  // Clear placeholder if it exists
  if (container.querySelector('.u-italic')) {
    container.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'shell-result-item';

  const time = new Date().toLocaleTimeString();
  const displayContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
  const countInfo = meta.total !== undefined ? `<span class="u-text-muted">(${meta.total} docs)</span>` : '';

  item.innerHTML = `
    <div class="shell-result-header">
      <div class="shell-result-query">${escapeHtml(query)} ${countInfo}</div>
      <div class="shell-result-time">${time}</div>
    </div>
    <div class="shell-result-content ${type === 'error' ? 'u-text-error' : ''}">${escapeHtml(displayContent)}</div>
  `;

  // Prepend so latest is on top
  container.insertBefore(item, container.firstChild);
}
