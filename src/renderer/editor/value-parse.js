/* =============================================
   Editor — Inline Value Parsing
   ============================================= */

export function parseInlineValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;

  if (!Number.isNaN(Number(raw)) && raw.trim() !== '') {
    const zeroPadded = raw.length > 1 && raw.startsWith('0') && !raw.includes('.');
    return zeroPadded ? raw : Number(raw);
  }

  const looksStructured = (raw.startsWith('{') && raw.endsWith('}'))
    || (raw.startsWith('[') && raw.endsWith(']'));
  if (looksStructured) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  }

  return raw;
}

const QUOTED = String.raw`\s*["']([^"']*)["']\s*`;
const OBJECT_ID_RE = new RegExp(`^ObjectId\\(${QUOTED}\\)$`);
const DATE_RE = new RegExp(`^(?:ISODate|new Date|Date)\\(${QUOTED}\\)$`);
const LONG_RE = /^NumberLong\(\s*["']?(-?\d+)["']?\s*\)$/;
const DECIMAL_RE = /^NumberDecimal\(\s*["']?(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)["']?\s*\)$/;
const BIG_INT_RE = /^-?\d{16,}$/;

/** Parse typed text into a value to write plus, for BSON types, how it should read in the tree. */
export function parseTypedInline(raw) {
  const text = raw.trim();
  let m = text.match(OBJECT_ID_RE);
  if (m && /^[0-9a-fA-F]{24}$/.test(m[1])) return { value: { $oid: m[1] }, display: m[1] };

  m = text.match(DATE_RE);
  if (m && !Number.isNaN(Date.parse(m[1]))) {
    const iso = new Date(m[1]).toISOString();
    return { value: { $date: iso }, display: iso };
  }

  m = text.match(LONG_RE) || (BIG_INT_RE.test(text) && !Number.isSafeInteger(Number(text)) ? [text, text] : null);
  if (m) return { value: { $numberLong: m[1] }, display: m[1] };

  m = text.match(DECIMAL_RE);
  if (m) return { value: { $numberDecimal: m[1] }, display: m[1] };

  return { value: parseInlineValue(raw) };
}
