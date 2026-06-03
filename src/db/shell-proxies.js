const mongodb = require('mongodb');

const {
  ObjectId, Long, Int32, Double, Decimal128, Binary, Timestamp,
  MinKey, MaxKey, BSONRegExp, UUID, Code, DBRef,
} = mongodb;

// Non-enumerable tag attached to find() cursors so the evaluator can recover
// the originating collection + filter (for server-side pagination + counts)
// without it leaking into serialized output.
const FIND_META = Symbol('mongoaioFindMeta');

// ---------------------------------------------------------------------------
// Collection wrapper — passes through to the real driver collection but adds
// mongosh aliases the Node driver doesn't expose natively.
// ---------------------------------------------------------------------------

const COLLECTION_ALIASES = {
  insert: (c) => (docs, opts) =>
    Array.isArray(docs) ? c.insertMany(docs, opts) : c.insertOne(docs, opts),

  remove: (c) => (filter, opts) => {
    const justOne = opts === true || (opts && opts.justOne);
    return justOne ? c.deleteOne(filter || {}) : c.deleteMany(filter || {});
  },

  update: (c) => (filter, update, opts = {}) => {
    const o = { upsert: !!opts.upsert };
    return opts.multi ? c.updateMany(filter, update, o) : c.updateOne(filter, update, o);
  },

  save: (c) => (doc, opts) => {
    if (doc && doc._id !== undefined && doc._id !== null) {
      return c.replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
    return c.insertOne(doc, opts);
  },

  findAndModify: (c) => (opts = {}) => {
    if (opts.remove) {
      return c.findOneAndDelete(opts.query || {}, { sort: opts.sort, projection: opts.fields });
    }
    return c.findOneAndUpdate(opts.query || {}, opts.update, {
      returnDocument: opts.new ? 'after' : 'before',
      upsert: !!opts.upsert,
      sort: opts.sort,
      projection: opts.fields,
    });
  },

  getIndexes: (c) => () => c.indexes(),
  ensureIndex: (c) => (...a) => c.createIndex(...a),
  getName: (c) => () => c.collectionName,
  getFullName: (c) => () => c.namespace,
};

const RESERVED = new Set(['then', 'catch', 'finally', 'toJSON', 'inspect', 'constructor']);

function tagFindCursor(cursor, collection, filter) {
  try {
    Object.defineProperty(cursor, FIND_META, {
      value: { collection, filter: filter || {} },
      enumerable: false,
      configurable: true,
    });
  } catch (_) { /* some cursor builds are frozen — pagination just falls back */ }
  return cursor;
}

function wrapCollection(coll) {
  return new Proxy(coll, {
    get(target, prop) {
      if (typeof prop === 'symbol' || RESERVED.has(prop)) return target[prop];
      // Tag find() cursors so server-side pagination can re-query by skip/limit
      // and count the full match set. Chained .sort()/.project() return the same
      // cursor instance, so the tag survives.
      if (prop === 'find') {
        return (filter, options) => tagFindCursor(target.find(filter, options), target, filter);
      }
      if (prop in target) {
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      }
      const alias = COLLECTION_ALIASES[prop];
      return alias ? alias(target) : undefined;
    },
  });
}

// ---------------------------------------------------------------------------
// Database proxy — `db.<name>` resolves to a collection; named helpers shim
// the mongosh `db.*` surface on top of the driver's Db object.
// ---------------------------------------------------------------------------

function buildDbProxy(client, dbName) {
  const database = client.db(dbName);

  const helpers = {
    getCollection: (name) => wrapCollection(database.collection(name)),
    getSiblingDB: (name) => buildDbProxy(client, name),
    getMongo: () => client,
    getName: () => dbName,
    runCommand: (cmd) => database.command(cmd),
    adminCommand: (cmd) => client.db('admin').command(cmd),
    getCollectionNames: async () =>
      (await database.listCollections().toArray()).map((c) => c.name).sort(),
    getCollectionInfos: (filter) => database.listCollections(filter || {}).toArray(),
    version: async () => (await client.db('admin').command({ buildInfo: 1 })).version,
    serverStatus: () => database.command({ serverStatus: 1 }),
    hostInfo: () => database.command({ hostInfo: 1 }),
    stats: (scale) => database.stats(scale ? { scale } : {}),
  };

  return new Proxy(database, {
    get(target, prop) {
      if (typeof prop === 'symbol' || RESERVED.has(prop)) return target[prop];
      if (prop in helpers) return helpers[prop];
      if (prop in target) {
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      }
      // Unknown identifier -> treat as a collection name (mongosh behaviour).
      if (typeof prop === 'string' && !prop.startsWith('_')) {
        return wrapCollection(target.collection(prop));
      }
      return undefined;
    },
  });
}

// ---------------------------------------------------------------------------
// mongosh BSON helpers exposed in the evaluation scope.
// ---------------------------------------------------------------------------

/** Wrap a BSON class so it works whether called as `Foo(x)` or `new Foo(x)` (mongosh allows both). */
function callable(Cls) {
  if (!Cls) return undefined;
  return function (...args) { return new Cls(...args); };
}

function buildBsonHelpers() {
  const oid = callable(ObjectId);
  return {
    ObjectId: oid,
    ObjectID: oid,
    ISODate: (...a) => (a.length ? new Date(...a) : new Date()),
    UUID: callable(UUID),
    NumberLong: Long ? ((v) => Long.fromValue(typeof v === 'string' ? v : Number(v))) : undefined,
    NumberInt: Int32 ? ((v) => new Int32(Number(v))) : undefined,
    NumberDecimal: Decimal128 ? ((v) => Decimal128.fromString(String(v))) : undefined,
    Double: Double ? ((v) => new Double(Number(v))) : undefined,
    Timestamp: Timestamp ? ((t, i) => new Timestamp({ t: Number(t) || 0, i: Number(i) || 0 })) : undefined,
    BinData: Binary ? ((subType, base64) => new Binary(Buffer.from(base64, 'base64'), subType)) : undefined,
    MinKey: MinKey ? (() => new MinKey()) : undefined,
    MaxKey: MaxKey ? (() => new MaxKey()) : undefined,
    DBRef: DBRef ? ((ns, oid, db) => new DBRef(ns, oid, db)) : undefined,
    BSONRegExp: BSONRegExp ? ((p, f) => new BSONRegExp(p, f)) : undefined,
    Code: Code ? ((c, s) => new Code(c, s)) : undefined,
  };
}

module.exports = {
  FIND_META,
  buildDbProxy,
  buildBsonHelpers,
};
