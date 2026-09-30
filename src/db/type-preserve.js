/* =============================================
   DB — Type-Preserving Writes
   ============================================= */

const { ObjectId, Decimal128, Long, Double, Int32 } = require('mongodb');
const { serializeDoc, serializeDocEJSON, deserializeInput } = require('./serialize');

// Writes are reconciled with the stored document so display-form strings never replace BSON types.
// Callers read the stored document with promoteValues: false, so Double and
// Int32 are still distinguishable (a promoted 5.0 is just the number 5).

const HEX_24 = /^[0-9a-fA-F]{24}$/;
const INTEGER = /^-?\d+$/;
const NUMERIC = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

function fitsInt64(text) {
  const n = BigInt(text);
  return n >= -(2n ** 63n) && n < 2n ** 63n;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    && !(v instanceof Date) && !v._bsontype && !Buffer.isBuffer(v);
}

/** An Extended JSON type marker such as {"$oid": ...} or {"$date": ...}. */
function isMarker(v) {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.length <= 2 && keys.every(k => k.startsWith('$'));
}

function ejson(v) {
  return JSON.stringify(serializeDocEJSON({ v }));
}

function display(v) {
  return JSON.stringify(serializeDoc({ v }));
}

/** True when `incoming` is the stored value in either wire form. */
function sameAsStored(stored, incoming) {
  if (stored === undefined) return false;
  const inc = JSON.stringify({ v: incoming });
  return inc === display(stored) || inc === ejson(stored);
}

/** Coerce an edited scalar to the stored value's BSON type where it clearly fits. */
function coerceScalar(stored, incoming) {
  const text = typeof incoming === 'number' ? String(incoming) : incoming;
  if (typeof text !== 'string') return incoming;

  if (stored instanceof ObjectId && HEX_24.test(text)) return new ObjectId(text);
  if (stored instanceof Date && typeof incoming === 'string' && !Number.isNaN(Date.parse(text))) {
    return new Date(text);
  }
  if (stored instanceof Decimal128 && NUMERIC.test(text)) return Decimal128.fromString(text);
  if (stored instanceof Long && INTEGER.test(text) && fitsInt64(text)) return Long.fromString(text);
  if (stored instanceof Double && NUMERIC.test(text)) return new Double(Number(text));
  if (stored instanceof Int32 && INTEGER.test(text)) {
    const n = Number(text);
    if (n >= INT32_MIN && n <= INT32_MAX) return new Int32(n);
  }
  return incoming;
}

/** The BSON value to write for `incoming`, following the type of `stored`. */
function preserveTypes(stored, incoming) {
  if (sameAsStored(stored, incoming)) return stored;
  if (isMarker(incoming)) return deserializeInput(incoming);

  if (Array.isArray(incoming)) {
    const base = Array.isArray(stored) ? stored : [];
    return incoming.map((v, i) => preserveTypes(base[i], v));
  }
  if (isPlainObject(incoming)) {
    const base = isPlainObject(stored) ? stored : {};
    const out = {};
    for (const [k, v] of Object.entries(incoming)) out[k] = preserveTypes(base[k], v);
    return out;
  }
  return coerceScalar(stored, incoming);
}

/** Keys that can't be addressed as a dotted update path. */
function unsafeKey(k) {
  return k === '' || k.includes('.') || k.startsWith('$');
}

/** Minimal $set/$unset between a stored and an edited document; untouched fields are never rewritten. */
function diffToUpdate(stored, incoming, prefix = '', out = { $set: {}, $unset: {} }) {
  for (const key of Object.keys(stored)) {
    if (!prefix && key === '_id') continue;
    if (!(key in incoming)) out.$unset[prefix + key] = '';
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (!prefix && key === '_id') continue;
    const path = prefix + key;
    const before = stored[key];
    if (sameAsStored(before, value)) continue;
    const recurse = isPlainObject(before) && isPlainObject(value) && !isMarker(value)
      && !Object.keys(before).some(unsafeKey) && !Object.keys(value).some(unsafeKey);
    if (recurse) diffToUpdate(before, value, `${path}.`, out);
    else out.$set[path] = preserveTypes(before, value);
  }
  return out;
}

/** Read the value at a dotted path of a native document. */
function valueAtPath(doc, path) {
  return path.split('.').reduce((cur, k) => (cur === null || cur === undefined ? undefined : cur[k]), doc);
}

module.exports = { preserveTypes, diffToUpdate, valueAtPath, isPlainObject };
