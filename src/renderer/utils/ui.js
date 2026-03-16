import { elements } from './state.js';
import { TOAST_DURATION_MS } from './constants.js';

export function showLoading(text = 'Loading...') {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.style.display = 'flex';
}

export function hideLoading() {
  elements.loadingOverlay.style.display = 'none';
}

export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  elements.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), TOAST_DURATION_MS);
}

export function setStatus(status) {
  elements.connectionStatus.className = `status-badge ${status}`;
  elements.connectionStatus.querySelector('span:last-child').textContent =
    status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected';
}

/**
 * Hide everything then show only one view
 */
export function showView(viewId) {
  if (elements.connectionPanel) elements.connectionPanel.style.display = 'none';
  if (elements.mainContent) elements.mainContent.style.display = 'none';
  if (elements.appHeader) elements.appHeader.style.display = 'none';
  if (elements.editorView) {
    elements.editorView.classList.remove('visible');
    elements.editorView.style.display = 'none';
  }

  if (viewId === 'connection') {
    if (elements.connectionPanel) elements.connectionPanel.style.display = 'block';
  } else if (viewId === 'main') {
    if (elements.appHeader) elements.appHeader.style.display = 'flex';
    if (elements.mainContent) elements.mainContent.style.display = 'block';
  } else if (viewId === 'editor') {
    if (elements.editorView) {
      elements.editorView.classList.add('visible');
      elements.editorView.style.display = '';
    }
  }
}
