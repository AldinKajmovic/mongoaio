/* =============================================
   Editor — Query Builder Item State
   ============================================= */

/** @typedef {{id:number, field:string, value:any, json:boolean, type:string, op:string, enabled:boolean}} QbItem */

let qbItems = [];
let nextId = 1;

export const QB_TYPES = new Set([
  'Binary', 'Boolean', 'Date', 'Decimal128', 'Double', 'Int32', 'Int64',
  'ObjectId', 'Reference', 'Regex', 'String', 'Symbol', 'Timestamp'
]);

/** Text for the value box: objects/arrays as JSON, everything else as-is. */
export const valueText = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

/** @returns {QbItem[]} the live item list. */
export function getQbItems() {
  return qbItems;
}

/**
 * Append a new query block.
 * @param {string} fieldName - dot path from the document root (`a.b.c`)
 * @param {any} value
 * @param {string} type
 */
export function createQbItem(fieldName, value = '', type = 'String') {
  qbItems.push({
    id: nextId++,
    field: fieldName,
    value: value,
    json: value !== null && typeof value === 'object',
    type: QB_TYPES.has(type) ? type : 'String',
    op: 'equals',
    enabled: true
  });
}

/** Duplicate an existing block, placing the copy at the end. */
export function duplicateQbItem(id) {
  const item = qbItems.find(it => it.id === id);
  if (!item) return;
  qbItems.push({ ...item, id: nextId++ });
}

/** Remove a block by id. */
export function removeQbItem(id) {
  qbItems = qbItems.filter(it => it.id !== id);
}

/** Drop every block. */
export function clearQbItems() {
  qbItems = [];
}
