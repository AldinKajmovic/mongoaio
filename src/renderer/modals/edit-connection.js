/* =============================================
   Modal — Edit Saved Connection
   ============================================= */

import { elements } from '../utils/state.js';

/** @type {((alias: string, url: string) => Promise<string|null>) | null} */
let onSubmit = null;

/** Split a MongoDB URI for display; the password is masked. */
export function describeUri(uri) {
  const m = uri.match(/^(mongodb(?:\+srv)?):\/\/(?:([^@/]*)@)?([^/?]*)(?:\/([^?]*))?(?:\?(.*))?$/i);
  if (!m) return null;
  const [, scheme, credentials, hosts, database, query] = m;
  const user = credentials ? decodeURIComponent(credentials.split(':')[0]) : '';
  const hasPassword = !!credentials && credentials.includes(':');
  return {
    scheme,
    user: user ? `${user}${hasPassword ? ' (password set)' : ''}` : '',
    hosts: hosts.split(',').filter(Boolean),
    database: database ? decodeURIComponent(database) : '',
    options: query ? query.split('&').filter(Boolean) : [],
  };
}

function renderSummary() {
  const dl = elements.editConnSummary;
  dl.replaceChildren();
  const url = elements.editConnUrl.value.trim();
  if (!url) return;
  const info = describeUri(url);
  const rows = info
    ? [['Scheme', info.scheme], ['User', info.user || '—'], ['Hosts', info.hosts.join('\n') || '—'],
      ['Database', info.database || '(default)'], ['Options', info.options.join('\n') || '—']]
    : [['Warning', 'Not a mongodb:// or mongodb+srv:// connection string']];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
}

function showError(message) {
  elements.editConnError.textContent = message || '';
  elements.editConnError.style.display = message ? 'block' : 'none';
}

export function closeEditConnectionModal() {
  elements.editConnOverlay.style.display = 'none';
  onSubmit = null;
}

async function submit() {
  if (!onSubmit) return;
  const alias = elements.editConnAlias.value.trim();
  // A pasted URI may wrap across lines; whitespace is never part of one.
  const url = elements.editConnUrl.value.replace(/\s+/g, '');
  if (!alias || !url) return showError('Name and connection string are both required.');
  elements.editConnSave.disabled = true;
  const error = await onSubmit(alias, url);
  elements.editConnSave.disabled = false;
  if (error) showError(error);
  else closeEditConnectionModal();
}

/**
 * Open the popup for one saved connection.
 * @param {(alias: string, url: string) => Promise<string|null>} save - resolves to an error message, or null on success
 */
export function openEditConnectionModal(alias, url, save) {
  onSubmit = save;
  elements.editConnAlias.value = alias;
  elements.editConnUrl.value = url;
  showError('');
  renderSummary();
  elements.editConnOverlay.style.display = 'flex';
  elements.editConnUrl.focus();
}

if (elements.editConnOverlay) {
  elements.editConnUrl.addEventListener('input', renderSummary);
  elements.editConnSave.addEventListener('click', submit);
  elements.editConnCancel.addEventListener('click', closeEditConnectionModal);
  elements.editConnClose.addEventListener('click', closeEditConnectionModal);
  elements.editConnOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditConnectionModal();
    else if (e.key === 'Enter' && (e.target === elements.editConnAlias || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  });
}
