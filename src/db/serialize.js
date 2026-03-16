const { ObjectId } = require('mongodb');

function serializeDoc(doc) {
  return JSON.parse(JSON.stringify(doc, (key, value) => {
    if (value instanceof ObjectId) return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Buffer.isBuffer(value)) return value.toString('base64');
    return value;
  }));
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
  deepEqual,
  computeDiffs,
  _computeDiffsRecursive,
};
