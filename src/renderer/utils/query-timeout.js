/* =============================================
   Utils — Query Time Limit & Cancellation
   ============================================= */

import { showLoading, hideLoading } from './ui.js';

const STORAGE_KEY = 'query-timeout-ms';
export const QUERY_TIMEOUT_CHOICES = [
  { ms: 15000, label: '15s limit' },
  { ms: 30000, label: '30s limit' },
  { ms: 60000, label: '1m limit' },
  { ms: 120000, label: '2m limit' },
  { ms: 300000, label: '5m limit' },
];
const DEFAULT_TIMEOUT_MS = 60000;

/** The per-query server time limit the user picked (a per-viewer preference). */
export function getQueryTimeoutMs() {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (QUERY_TIMEOUT_CHOICES.some(c => c.ms === saved)) return saved;
  } catch (_) { /* storage unavailable */ }
  return DEFAULT_TIMEOUT_MS;
}

export function setQueryTimeoutMs(ms) {
  try { localStorage.setItem(STORAGE_KEY, String(ms)); } catch (_) { /* storage unavailable */ }
}

/** Fill a <select> with the time-limit choices and keep the preference in sync. */
export function bindTimeoutSelect(select) {
  if (!select) return;
  const current = getQueryTimeoutMs();
  select.innerHTML = '';
  for (const choice of QUERY_TIMEOUT_CHOICES) {
    const opt = document.createElement('option');
    opt.value = String(choice.ms);
    opt.textContent = choice.label;
    opt.selected = choice.ms === current;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => setQueryTimeoutMs(Number(select.value)));
}

/** A fresh id the main process can cancel the operation by. */
export function newOpId() {
  return crypto.randomUUID();
}

/** Options every cancellable request carries. */
export function cancellableOptions(opId) {
  return { opId, maxTimeMS: getQueryTimeoutMs() };
}

/** User-facing error text, or null for a deliberate cancel. */
export function describeQueryError(message) {
  if (/cancelled|aborted/i.test(message)) return null;
  if (/exceeded time limit|MaxTimeMSExpired|operation exceeded/i.test(message)) {
    return `Query hit the ${Math.round(getQueryTimeoutMs() / 1000)}s time limit — raise it in the toolbar or narrow the filter.`;
  }
  return message;
}

/** Run a request behind the loading overlay with a working Cancel button. */
export async function runCancellable(label, request) {
  const opId = newOpId();
  showLoading(label, () => {
    window.api.cancelOp(opId).catch(() => {});
  });
  try {
    return await request(cancellableOptions(opId));
  } finally {
    hideLoading();
  }
}
