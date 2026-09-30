import { parseRelaxedJSON } from '../utils/dom.js';

// ---------------------------------------------------------------------------
// Index panel — reads the "create index" form into { keys, options } for
// window.api.createIndex. Throws Error with a user-facing message on bad input.
// ---------------------------------------------------------------------------

export function readCreateForm() {
  const rows = document.querySelectorAll('#idx-field-rows .idx-field-row');
  const keys = {};
  for (const row of rows) {
    const nameInput = /** @type {HTMLInputElement | null} */ (row.querySelector('.idx-field-name'));
    const dirSelect = /** @type {HTMLSelectElement | null} */ (row.querySelector('.idx-field-dir'));
    const field = nameInput ? nameInput.value.trim() : '';
    if (!field) continue;
    // A compound index can't list the same field twice; an object key would
    // silently overwrite, so reject it explicitly instead.
    if (Object.prototype.hasOwnProperty.call(keys, field)) {
      throw new Error(`Duplicate field "${field}" — a compound index cannot use the same field twice.`);
    }
    const dir = parseInt(dirSelect.value, 10) === -1 ? -1 : 1;
    keys[field] = dir;
  }

  const options = {};
  const uniqueEl = /** @type {HTMLInputElement | null} */ (document.getElementById('idx-opt-unique'));
  const sparseEl = /** @type {HTMLInputElement | null} */ (document.getElementById('idx-opt-sparse'));
  const ttlEl = /** @type {HTMLInputElement | null} */ (document.getElementById('idx-opt-ttl'));
  const nameEl = /** @type {HTMLInputElement | null} */ (document.getElementById('idx-opt-name'));
  const partialEl = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (document.getElementById('idx-opt-partial'));

  if (uniqueEl && uniqueEl.checked) options.unique = true;
  if (sparseEl && sparseEl.checked) options.sparse = true;
  if (ttlEl && ttlEl.value.trim() !== '') {
    const n = parseInt(ttlEl.value.trim(), 10);
    if (!Number.isNaN(n)) options.expireAfterSeconds = n;
  }
  if (nameEl && nameEl.value.trim() !== '') options.name = nameEl.value.trim();
  if (partialEl && partialEl.value.trim() !== '') {
    try {
      options.partialFilterExpression = parseRelaxedJSON(partialEl.value.trim());
    } catch (err) {
      throw new Error(`Invalid partial filter expression JSON: ${err.message}`);
    }
  }

  return { keys, options };
}
