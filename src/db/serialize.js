const { ObjectId, BSON } = require('mongodb');

function serializeDoc(doc) {
  return JSON.parse(JSON.stringify(doc, (key, value) => {
    if (value instanceof ObjectId) return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Buffer.isBuffer(value)) return value.toString('base64');
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
  return BSON.EJSON.serialize(doc, { relaxed: true });
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
  return BSON.EJSON.deserialize(value, { relaxed: true });
}

function deepEqual(a, b) {
  return JSON.stringify(serializeDoc(a)) === JSON.stringify(serializeDoc(b));
}

function computeDiffs(sourceDoc, targetDoc) {
  const sourceSerialized = serializeDoc(sourceDoc);
  const targetSerialized = serializeDoc(targetDoc);
  return _computeDiffsRecursive(sourceSerialized, targetSerialized);
}

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

    // Recurse if both are non-null objects and not arrays
    if (
      sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal !== null && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      const nestedDiffs = _computeDiffsRecursive(sourceVal, targetVal, fieldPath);
      diffs.push(...nestedDiffs);
    } else {
      if (JSON.stringify(sourceVal) !== JSON.stringify(targetVal)) {
        diffs.push({
          field: fieldPath,
          sourceValue: sourceVal,
          targetValue: targetVal,
          type: sourceVal === undefined ? 'added_in_target' : targetVal === undefined ? 'missing_in_target' : 'modified',
        });
      } else {
        diffs.push({
          field: fieldPath,
          sourceValue: sourceVal,
          targetValue: targetVal,
          type: 'same',
        });
      }
    }
  }
  return diffs;
}

module.exports = {
  serializeDoc,
  serializeDocEJSON,
  deserializeInput,
  deepEqual,
  computeDiffs,
  _computeDiffsRecursive,
};
