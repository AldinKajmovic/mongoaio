const mongodb = require('mongodb');

const {
  ObjectId, Long, Int32, Double, Decimal128, Binary, Timestamp,
  MinKey, MaxKey, BSONRegExp, UUID, Code, BSONSymbol, Collection, Db,
} = mongodb;

// ---------------------------------------------------------------------------
// Serialization — convert BSON/driver values into JSON-friendly output that
// reads the way mongosh prints, while staying safe to JSON.stringify.
// ---------------------------------------------------------------------------

function serializeValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (t === 'bigint') return value.toString();
  if (t === 'function') return undefined;

  // BSON / native special types (guard each in case a build omits one).
  if (ObjectId && value instanceof ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (UUID && value instanceof UUID) return value.toString();
  if (Decimal128 && value instanceof Decimal128) return value.toString();
  // Timestamp extends Long, so it must be checked before Long.
  if (Timestamp && value instanceof Timestamp) {
    return { $timestamp: { t: value.high, i: value.low } };
  }
  if (Long && value instanceof Long) {
    const n = value.toNumber();
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  if (Int32 && value instanceof Int32) return value.valueOf();
  if (Double && value instanceof Double) return value.valueOf();
  if (Binary && value instanceof Binary) {
    return { $binary: { base64: value.buffer.toString('base64'), subType: value.sub_type } };
  }
  if (BSONRegExp && value instanceof BSONRegExp) return `/${value.pattern}/${value.options}`;
  if (value instanceof RegExp) return value.toString();
  if (MinKey && value instanceof MinKey) return { $minKey: 1 };
  if (MaxKey && value instanceof MaxKey) return { $maxKey: 1 };
  if (Code && value instanceof Code) {
    return value.scope ? { code: value.code, scope: serializeValue(value.scope, seen) } : value.code;
  }
  if (BSONSymbol && value instanceof BSONSymbol) return value.toString();
  if (Buffer.isBuffer(value)) return { $binary: { base64: value.toString('base64'), subType: 0 } };

  // Driver handles returned by ops like createCollection — summarize, don't dump internals.
  if (Collection && value instanceof Collection) return { ok: 1, collection: value.namespace };
  if (Db && value instanceof Db) return { ok: 1, db: value.databaseName };

  if (Array.isArray(value)) return value.map((v) => serializeValue(v, seen));

  if (t === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out = {};
    for (const key of Object.keys(value)) {
      const sv = serializeValue(value[key], seen);
      if (sv !== undefined) out[key] = sv;
    }
    seen.delete(value);
    return out;
  }

  return value;
}

module.exports = { serializeValue };
