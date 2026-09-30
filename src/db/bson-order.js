const { typedKey } = require('./serialize');


/** Server type ranks: MinKey < null < numbers < strings < objects < … < MaxKey. */
const RANK = {
  MinKey: 1, null: 2, number: 3, string: 4, object: 5,
  Binary: 7, ObjectId: 8, boolean: 9, Date: 10, Timestamp: 11, MaxKey: 13,
};
const NUMERIC_BSON = new Set(['Long', 'Int32', 'Double', 'Decimal128']);

/** @returns {string|null} Key into RANK, or null for a type this module cannot order. */
function kindOf(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  if (v instanceof Date) return 'Date';
  if (Array.isArray(v) || Buffer.isBuffer(v) || v instanceof RegExp) return null;
  const bsonType = v._bsontype;
  if (NUMERIC_BSON.has(bsonType)) return 'number';
  if (bsonType === 'BSONSymbol') return 'string';
  if (bsonType) return Object.hasOwn(RANK, bsonType) ? bsonType : null;
  return typeof v === 'object' ? 'object' : null;
}

const sign = (n) => (n < 0 ? -1 : n > 0 ? 1 : 0);

/** Exact integer value of a number/Long/Int32/Double, or null when it has a fraction (or is Decimal128). */
function exactInteger(v) {
  if (v && v._bsontype === 'Long') return v.toBigInt();
  if (v && v._bsontype === 'Decimal128') return null;
  const n = typeof v === 'number' ? v : Number(v.valueOf());
  return Number.isInteger(n) ? BigInt(n) : null;
}

/**
 * Numbers compare by value; NaN sorts below every other number, as on the server.
 * Integers (including Longs past 2^53) compare exactly as BigInts.
 */
function compareNumbers(a, b) {
  const ia = exactInteger(a), ib = exactInteger(b);
  if (ia !== null && ib !== null) return ia < ib ? -1 : ia > ib ? 1 : 0;
  const x = Number(typeof a === 'number' ? a : a.toString());
  const y = Number(typeof b === 'number' ? b : b.toString());
  if (Number.isNaN(x) || Number.isNaN(y)) return Number(Number.isNaN(y)) - Number(Number.isNaN(x));
  return sign(x - y);
}

/** Simple collation: strings compare by their UTF-8 bytes. */
function compareUtf8(a, b) {
  return a === b ? 0 : Buffer.compare(Buffer.from(String(a), 'utf8'), Buffer.from(String(b), 'utf8'));
}

/** Binary data compares by length, then subtype, then bytes. */
function compareBinary(a, b) {
  const x = a.buffer.subarray(0, a.position), y = b.buffer.subarray(0, b.position);
  return sign(x.length - y.length) || sign(a.sub_type - b.sub_type) || Buffer.compare(x, y);
}

/** Embedded documents compare element by element: type, then field name, then value. */
function compareDocs(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
    const va = a[ka[i]], vb = b[kb[i]];
    const byType = compareRanks(va, vb);
    if (byType !== 0) return byType;
    const byName = compareUtf8(ka[i], kb[i]);
    if (byName !== 0) return byName;
    const byValue = compareValues(va, vb);
    if (byValue !== 0) return byValue;
  }
  return sign(ka.length - kb.length);
}

/** @returns {number|null} */
function compareRanks(a, b) {
  const ka = kindOf(a), kb = kindOf(b);
  if (ka === null || kb === null) return null;
  return sign(RANK[ka] - RANK[kb]);
}

/** Same-rank comparison; null when the pair cannot be ordered. */
function compareSameKind(a, b) {
  switch (kindOf(a)) {
    case 'number': return compareNumbers(a, b);
    case 'string': return compareUtf8(a.valueOf(), b.valueOf());
    case 'object': return compareDocs(a, b);
    case 'Binary': return compareBinary(a, b);
    case 'ObjectId': return compareUtf8(a.toHexString(), b.toHexString());
    case 'boolean': return Number(a) - Number(b);
    case 'Date': return sign(a.getTime() - b.getTime());
    case 'Timestamp': return a.compare(b);
    default: return 0; // MinKey / null / MaxKey: one value per rank
  }
}

/** @returns {number|null} Server-order comparison ignoring exact numeric type. */
function compareValues(a, b) {
  const byType = compareRanks(a, b);
  if (byType === null) return null;
  if (byType !== 0) return byType;
  return compareSameKind(a, b);
}

/**
 * Total order over _id values that follows the server's sort order and is 0
 * only when the typed keys match (so a number and an equal Decimal128 still differ).
 * @returns {number|null} negative / 0 / positive, or null if unorderable.
 */
function compareIds(a, b) {
  const byValue = compareValues(a, b);
  if (byValue !== 0) return byValue;
  const ka = typedKey(a), kb = typedKey(b);
  return ka === kb ? 0 : (ka < kb ? -1 : 1);
}

module.exports = { compareIds };
