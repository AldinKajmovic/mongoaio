const { ObjectId, BSON } = require('mongodb');

/** Display-only form (ObjectId/Date flattened to strings); never write it back. */
function serializeDoc(doc) {
  return JSON.parse(JSON.stringify(doc, (key, value) => {
    if (value instanceof ObjectId) return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Buffer.isBuffer(value)) return value.toString('base64');
    // A Long read without promotion (or past 2^53) would otherwise show as {low, high, unsigned}.
    if (value && value._bsontype === 'Long') {
      const n = value.toNumber();
      return Number.isSafeInteger(n) ? n : value.toString();
    }
    return value;
  }));
}

/**
 * Serialize a document to MongoDB Relaxed Extended JSON, preserving BSON type
 * markers (ObjectId -> {"$oid":...}, Date -> {"$date":...}, etc.). Unlike
 * serializeDoc (which flattens types to plain strings for display), this form
 * round-trips: copy the JSON, paste it into mongoimport, and the types survive.
 * Used only by the collection editor's JSON view / "Copy JSON" export.
 * @param {Object} doc
 * @returns {Object} plain, JSON-safe object with Extended JSON markers
 */
function serializeDocEJSON(doc) {
  return keepUnsafeLongs(doc, BSON.EJSON.serialize(doc, { relaxed: true }));
}

/** Canonical Extended JSON of one value: exact numeric types ({"$numberDouble": "5.0"}, …) survive. */
function canonicalEJSON(value) {
  return BSON.EJSON.serialize({ v: value }, { relaxed: false }).v;
}

// Relaxed EJSON writes every Long as a plain number, rounding values past 2^53.
function keepUnsafeLongs(native, out) {
  if (native === null || typeof native !== 'object') return out;
  if (native._bsontype === 'Long') {
    const n = native.toNumber();
    return Number.isSafeInteger(n) ? out : { $numberLong: native.toString() };
  }
  if (native._bsontype || native instanceof Date || Buffer.isBuffer(native)) return out;
  if (Array.isArray(native)) return out.map((v, i) => keepUnsafeLongs(native[i], v));
  for (const key of Object.keys(out)) out[key] = keepUnsafeLongs(native[key], out[key]);
  return out;
}

/**
 * Revive MongoDB Extended JSON markers ({"$oid":...}, {"$date":...}, ...) in a
 * value back into native BSON types before a write, so a document edited/pasted
 * as Extended JSON stores with the right types. Plain values (strings, numbers,
 * query operators like $gt/$in) pass through unchanged.
 * @param {*} value
 * @returns {*}
 */
function deserializeInput(value) {
  if (value === null || value === undefined) return value;
  // Canonicalise first: EJSON.deserialize would flatten already-native values.
  const canonical = BSON.EJSON.serialize(value, { relaxed: false });
  return BSON.EJSON.deserialize(canonical, { relaxed: false });
}

/** Stable JSON: object keys sorted, so field order doesn't affect equality. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Type-aware fingerprint: canonical Extended JSON keeps Date ≠ string, etc. */
function typedKey(value) {
  if (value === undefined) return 'undefined';
  return stableStringify(BSON.EJSON.serialize({ v: value }, { relaxed: false }).v);
}

/** Typed equality: a Date never equals its ISO string; key order is ignored, array order is not. */
function bsonEqual(a, b) {
  return typedKey(a) === typedKey(b);
}

function isNestedDoc(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    && !(v instanceof Date) && !v._bsontype && !Buffer.isBuffer(v);
}

function displayValue(v) {
  return v === undefined ? undefined : serializeDoc({ v }).v;
}

/** Field-level diff of two native documents. */
function _computeDiffsRecursive(sourceObj, targetObj, prefix = '') {
  const diffs = [];
  const allKeys = new Set([
    ...Object.keys(sourceObj || {}),
    ...Object.keys(targetObj || {})
  ]);

  for (const key of allKeys) {
    if (key === '_id' && !prefix) continue;

    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const sourceVal = sourceObj ? sourceObj[key] : undefined;
    const targetVal = targetObj ? targetObj[key] : undefined;

    if (isNestedDoc(sourceVal) && isNestedDoc(targetVal)) {
      diffs.push(..._computeDiffsRecursive(sourceVal, targetVal, fieldPath));
      continue;
    }
    const same = bsonEqual(sourceVal, targetVal);
    diffs.push({
      field: fieldPath,
      sourceValue: displayValue(sourceVal),
      targetValue: displayValue(targetVal),
      type: same ? 'same'
        : sourceVal === undefined ? 'added_in_target'
          : targetVal === undefined ? 'missing_in_target' : 'modified',
    });
  }
  return diffs;
}

module.exports = {
  serializeDoc,
  serializeDocEJSON,
  canonicalEJSON,
  deserializeInput,
  bsonEqual,
  typedKey,
  _computeDiffsRecursive,
};
