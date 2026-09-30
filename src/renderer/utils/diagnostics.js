/* =============================================
   Renderer — Global Error Reporting
   ============================================= */

import { toast } from './ui.js';

/** Keep an error storm from burying the UI in toasts. */
const TOAST_COOLDOWN_MS = 1500;
let lastToastAt = 0;

/** Anything can be thrown or rejected; normalize it so we always get a stack. */
function toError(value) {
  if (value instanceof Error) return value;
  try {
    return new Error(typeof value === 'string' ? value : JSON.stringify(value));
  } catch (_) {
    return new Error(String(value));
  }
}

/**
 * @param {string} kind - what caught it
 * @param {*} value - the thrown/rejected value
 * @param {object} [where] - source location, when the event carries one
 */
function report(kind, value, where) {
  const err = toError(value);
  const at = where?.filename
    ? ` at ${where.filename}:${where.lineno ?? 0}:${where.colno ?? 0}`
    : '';
  // console.error carries the stack across to the main process log.
  console.error(`[${kind}] ${err.name}: ${err.message}${at}\n${err.stack || '(no stack)'}`);

  const now = Date.now();
  if (now - lastToastAt > TOAST_COOLDOWN_MS) {
    lastToastAt = now;
    toast(`${err.name}: ${err.message}`, 'error');
  }
}

window.addEventListener('error', (event) => {
  // Resource load failures (a missing script/style) have no `error` object.
  if (event.error === null && event.target !== window) {
    const el = /** @type {Partial<HTMLScriptElement & HTMLLinkElement>} */ (event.target);
    console.error(`[resource-error] failed to load ${el?.tagName || 'resource'}: `
      + `${el?.src || el?.href || '(unknown)'}`);
    return;
  }
  report('renderer-error', event.error || event.message, event);
});

window.addEventListener('unhandledrejection', (event) => {
  report('unhandled-rejection', event.reason);
});

console.log('[diagnostics] renderer error reporting active');
