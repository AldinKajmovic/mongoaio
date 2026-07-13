const { getClient } = require('./connection');
const { SOCKET_TIMEOUT_MS } = require('./constants');

const MAX_DEPTH = 3;              // how deep to descend into nested objects
const MAX_SAMPLE_VALUES = 5;      // distinct example values kept per field

/** Map a runtime value to a MongoDB-ish type label for the frequency table. */
function typeOf(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'string') return 'string';
  if (t === 'boolean') return 'boolean';
  if (t === 'number') return Number.isInteger(v) ? 'int' : 'double';
  if (t === 'bigint') return 'long';
  if (v instanceof Date) return 'date';
  if (Buffer.isBuffer(v)) return 'binData';
  if (v && v._bsontype) {
    // Normalise the driver's ObjectID casing for display.
    return v._bsontype === 'ObjectID' ? 'objectId' : v._bsontype.toLowerCase();
  }
  if (t === 'object') return 'object';
  return t;
}

/** A short, display-safe stringification of a sample value. */
function preview(v) {
  const type = typeOf(v);
  if (type === 'object') return '{…}';
  if (type === 'array') return `[${v.length}]`;
  if (type === 'date') return v.toISOString();
  if (type === 'binData') return '<binary>';
  let s;
  try { s = v && v._bsontype ? v.toString() : String(v); } catch (_) { s = ''; }
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

/**
 * Accumulate one document's fields into the running stats map. Recurses into
 * nested plain objects using dot paths (Compass-style), bounded by MAX_DEPTH.
 */
function accumulate(stats, obj, prefix, depth) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    let entry = stats.get(path);
    if (!entry) {
      entry = { path, count: 0, types: new Map(), samples: [] };
      stats.set(path, entry);
    }
    entry.count += 1;
    const t = typeOf(value);
    entry.types.set(t, (entry.types.get(t) || 0) + 1);

    if (entry.samples.length < MAX_SAMPLE_VALUES && t !== 'object' && t !== 'null') {
      const p = preview(value);
      if (p !== '' && !entry.samples.includes(p)) entry.samples.push(p);
    }

    if (t === 'object' && depth < MAX_DEPTH && value) {
      accumulate(stats, value, path, depth + 1);
    }
  }
}

/**
 * Sample up to `sampleSize` documents from a collection and report, per field,
 * how often it appears and its type distribution — the data behind a Compass
 * "Schema" tab.
 *
 * @returns {Promise<{sampled, totalCount, fields}>}
 */
async function analyzeSchema(side, dbName, collName, sampleSize = 1000) {
  const coll = getClient(side).db(dbName).collection(collName);
  const size = Math.max(1, Math.min(10000, Number(sampleSize) || 1000));

  const totalCount = await coll.countDocuments({}, { maxTimeMS: SOCKET_TIMEOUT_MS });

  const docs = await coll
    .aggregate([{ $sample: { size } }], { allowDiskUse: true, maxTimeMS: SOCKET_TIMEOUT_MS })
    .toArray();

  const stats = new Map();
  for (const doc of docs) accumulate(stats, doc, '', 0);

  const sampled = docs.length;
  const fields = Array.from(stats.values()).map((e) => {
    const types = Array.from(e.types.entries())
      .map(([type, count]) => ({ type, count, percent: Math.round((count / e.count) * 100) }))
      .sort((a, b) => b.count - a.count);
    return {
      path: e.path,
      count: e.count,
      presence: sampled ? Math.round((e.count / sampled) * 100) : 0,
      types,
      samples: e.samples,
    };
  });

  // Present in most documents first, then alphabetical for stable ordering.
  fields.sort((a, b) => b.presence - a.presence || a.path.localeCompare(b.path));

  return { sampled, totalCount, fields };
}

module.exports = { analyzeSchema };
