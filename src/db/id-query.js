/* =============================================
   DB — _id Filters
   ============================================= */

const { ObjectId } = require('mongodb');
const { deserializeInput } = require('./serialize');

const HEX_24 = /^[0-9a-fA-F]{24}$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

/** _id filter; ambiguous text (hex or numeric) matches every type it could be. */
function buildIdQuery(docId) {
  const revived = deserializeInput(docId);
  if (typeof revived !== 'string') return { _id: revived };

  /** @type {Array<string | ObjectId | number>} */
  const candidates = [revived];
  if (HEX_24.test(revived)) candidates.push(new ObjectId(revived));
  if (NUMERIC.test(revived) && Number.isFinite(Number(revived))) candidates.push(Number(revived));
  return candidates.length === 1 ? { _id: revived } : { _id: { $in: candidates } };
}

/** _id for a new document: a bare 24-hex string becomes an ObjectId. */
function coerceNewId(id) {
  const revived = deserializeInput(id);
  return typeof revived === 'string' && HEX_24.test(revived) ? new ObjectId(revived) : revived;
}

module.exports = { buildIdQuery, coerceNewId };
