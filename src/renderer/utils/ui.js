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

/**
 * Show a confirmation toast with Yes/No buttons
 * @param {string} message - The confirmation message
 * @param {Function} onConfirm - Callback when user clicks Yes
 * @param {Function} [onCancel] - Optional callback when user clicks No
 */
export function confirmToast(message, onConfirm, onCancel) {
  const el = document.createElement('div');
  el.className = 'toast confirm-toast';

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  el.appendChild(msgSpan);

  const btnWrap = document.createElement('div');
  btnWrap.className = 'confirm-toast-actions';

  const btnYes = document.createElement('button');
  btnYes.className = 'btn btn-sm confirm-toast-yes';
  btnYes.textContent = 'Yes';
  btnYes.addEventListener('click', () => {
    el.remove();
    if (onConfirm) onConfirm();
  });

  const btnNo = document.createElement('button');
  btnNo.className = 'btn btn-sm confirm-toast-no';
  btnNo.textContent = 'No';
  btnNo.addEventListener('click', () => {
    el.remove();
    if (onCancel) onCancel();
  });

  btnWrap.appendChild(btnYes);
  btnWrap.appendChild(btnNo);
  el.appendChild(btnWrap);

  elements.toastContainer.appendChild(el);
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
