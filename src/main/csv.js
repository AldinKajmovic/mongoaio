/* =============================================
   Main Process — CSV Encoding for Import/Export
   ============================================= */

const { BSON } = require('mongodb');
const { serializeDocEJSON } = require('../db/serialize');

// CSV injection guard: such text cells get a leading apostrophe, stripped again on import.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value) {
  let s;
  if (value === null || value === undefined) s = '';
  else if (typeof value === 'object') s = JSON.stringify(serializeDocEJSON(value));
  else s = String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Flatten a document to dot-path scalar cells for CSV export. */
function flatten(doc, prefix, out) {
  for (const [key, value] of Object.entries(doc)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)
      && !(value instanceof Date) && !value._bsontype && !Buffer.isBuffer(value)) {
      flatten(value, p, out);
    } else {
      out[p] = value;
    }
  }
  return out;
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (ch === '\r') {
      // swallow — handled with the following \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Coerce a CSV string cell into a number/boolean/JSON where it clearly is one. */
function coerceCell(raw) {
  if (raw === '') return undefined;
  // An apostrophe-guarded cell written by csvCell is always text.
  if (raw.startsWith("'") && FORMULA_START.test(raw.slice(1))) return raw.slice(1);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    // Zero-padded values ("00123", ZIP codes, ids) are identifiers, not numbers.
    if (/^-?0\d/.test(raw)) return raw;
    const n = Number(raw);
    if (Number.isInteger(n) && !Number.isSafeInteger(n)) return BSON.Long.fromString(raw);
    return n;
  }
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try { return BSON.EJSON.parse(raw, { relaxed: true }); } catch (_) { /* keep string */ }
  }
  return raw;
}

module.exports = { csvCell, flatten, parseCsv, coerceCell };
