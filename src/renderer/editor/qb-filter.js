/* =============================================
   Editor — Query Builder Filter Assembly
   ============================================= */

import { elements } from '../utils/state.js';
import { getQbItems } from './qb-state.js';

/** Wrap a value as MongoDB Extended JSON ObjectId so the backend revives it. */
const toOid = (v) => ({ $oid: String(v) });

/** Parse a value into an array, accepting an existing array or a JSON string. */
const parseMaybeArray = (v) => (Array.isArray(v) ? v : JSON.parse(v));

/**
 * Resolve one block's value: apply the JSON round-trip for blocks seeded with a
 * structured value, then the type dropdown's conversion.
 */
function resolveValue(it) {
  let val = it.value;
  if (it.json && typeof val === 'string' && it.type !== 'Regex') {
    const trimmed = val.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { val = JSON.parse(trimmed); } catch (_) { /* leave as text */ }
    }
  }

  if (it.type === 'Int32') val = parseInt(val, 10);
  else if (it.type === 'Double') val = parseFloat(val);
  else if (it.type === 'Boolean') val = val === 'true';
  return val;
}

/** Map one block to its MongoDB condition object. */
function toCondition(it) {
  const val = resolveValue(it);
  const key = it.field;

  const isOid = it.type === 'ObjectId';
  const eq = (v) => (isOid ? toOid(v) : v);
  const eqArray = (v) => {
    const arr = parseMaybeArray(v);
    return isOid ? arr.map(toOid) : arr;
  };
  const listCond = (op) => {
    try { return { [key]: { [op]: eqArray(val) } }; }
    catch { return { [key]: { [op]: [eq(val)] } }; }
  };

  switch (it.op) {
    case 'not_equals': return { [key]: { $ne: eq(val) } };
    case 'contains': return { [key]: { $regex: val, $options: 'i' } };
    case 'not_contains': return { [key]: { $not: { $regex: val, $options: 'i' } } };
    case 'starts_with': return { [key]: { $regex: `^${val}`, $options: 'i' } };
    case 'not_starts_with': return { [key]: { $not: { $regex: `^${val}`, $options: 'i' } } };
    case 'ends_with': return { [key]: { $regex: `${val}$`, $options: 'i' } };
    case 'not_ends_with': return { [key]: { $not: { $regex: `${val}$`, $options: 'i' } } };
    case 'is_null': return { [key]: null };
    case 'is_not_null': return { [key]: { $ne: null } };
    case 'exists': return { [key]: { $exists: true } };
    case 'not_exists': return { [key]: { $exists: false } };
    case 'in': return listCond('$in');
    case 'not_in': return listCond('$nin');
    case 'all': return listCond('$all');
    default: return { [key]: eq(val) };
  }
}

/**
 * Wrap a single field condition (`{ field: inner }`) so it matches an array
 * element via $elemMatch. A scalar `inner` (e.g. from "equals") is promoted to
 * `{ $eq: inner }` because $elemMatch requires a query object. ObjectId markers
 * ({$oid}) count as scalar values, not query objects.
 */
function toElemMatch(cond, negate) {
  const key = Object.keys(cond)[0];
  const inner = cond[key];
  const isQueryObj = inner !== null && typeof inner === 'object'
    && !Array.isArray(inner) && !('$oid' in inner);
  const em = { $elemMatch: isQueryObj ? inner : { $eq: inner } };
  return { [key]: negate ? { $not: em } : em };
}

/** Combine per-field conditions according to the panel's mode dropdown. */
function combine(conds, mode) {
  if (mode === 'any') return { $or: conds };
  if (mode === 'nor') return { $nor: conds };
  if (mode === 'elemMatch' || mode === 'notElemMatch') {
    const wrapped = conds.map(c => toElemMatch(c, mode === 'notElemMatch'));
    return wrapped.length === 1 ? wrapped[0] : { $and: wrapped };
  }
  return conds.length === 1 ? conds[0] : { $and: conds };
}

/**
 * Build a MongoDB filter object from selected fields and mode,
 * then write it into the query filter input.
 */
export function buildAndApplyFilter() {
  const modeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('editor-qb-mode'));
  const mode = modeEl ? modeEl.value : 'all';

  const activeItems = getQbItems().filter(it => it.enabled && it.field);
  if (activeItems.length === 0) {
    elements.editorQueryFilter.value = '{}';
    return;
  }

  const filter = combine(activeItems.map(toCondition), mode);
  elements.editorQueryFilter.value = JSON.stringify(filter);
}
