/* =============================================
   Editor — Field Type Helpers
   ============================================= */

/**
 * Detect the BSON-like type for a field value
 */
export function getFieldType(key, val) {
  if (val === null) return 'Null';
  if (Array.isArray(val)) return 'Array';
  if (typeof val === 'number') return Number.isInteger(val) ? 'Int32' : 'Double';
  if (typeof val === 'boolean') return 'Boolean';
  if (typeof val === 'object') return 'Object';
  if (key === '_id' || (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val))) {
    return 'ObjectId';
  }
  return 'String';
}

/**
 * Check if a value is expandable (non-null object or array)
 */
export function isExpandable(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Get a short summary string for an expandable value
 */
export function valueSummary(val) {
  if (Array.isArray(val)) return `Array [${val.length}]`;
  return `Object {${Object.keys(val).length}}`;
}
