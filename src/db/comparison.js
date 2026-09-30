const { ObjectId } = require('mongodb');
const { getClient } = require('./connection');
const { serializeDoc, canonicalEJSON, bsonEqual, typedKey, _computeDiffsRecursive } = require('./serialize');
const { getCached, setCached } = require('./compare-cache');
const { idPage } = require('./id-merge');
const { listDatabases, listCollections } = require('./query');
const { DEFAULT_QUERY_LIMIT } = require('./constants');

async function compareDatabases() {
  const [sourceDbs, targetDbs] = await Promise.all([
    listDatabases('source'),
    listDatabases('target')
  ]);

  const sourceSet = new Set(sourceDbs);
  const targetSet = new Set(targetDbs);

  const common = sourceDbs.filter(db => targetSet.has(db));
  const onlyInSource = sourceDbs.filter(db => !targetSet.has(db));
  const onlyInTarget = targetDbs.filter(db => !sourceSet.has(db));

  return { common, onlyInSource, onlyInTarget };
}

async function compareCollections(dbName) {
  return compareCollectionsCross(dbName, dbName);
}

async function compareCollectionsCross(sourceDbName, targetDbName) {
  const [sourceColls, targetColls] = await Promise.all([
    listCollections('source', sourceDbName),
    listCollections('target', targetDbName)
  ]);

  const sourceSet = new Set(sourceColls);
  const targetSet = new Set(targetColls);

  const common = sourceColls.filter(c => targetSet.has(c));
  const onlyInSource = sourceColls.filter(c => !targetSet.has(c));
  const onlyInTarget = targetColls.filter(c => !sourceSet.has(c));

  return { common, onlyInSource, onlyInTarget };
}

/** Escape a user search term for use inside a RegExp. */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchQuery(search) {
  if (!search) return {};
  /** @type {{ $or: Array<{ _id: RegExp | ObjectId | number }> }} */
  const query = { $or: [{ _id: new RegExp(escapeRegex(search), 'i') }] };
  if (ObjectId.isValid(search) && /^[0-9a-fA-F]{24}$/.test(search)) query.$or.push({ _id: new ObjectId(search) });
  const asNumber = Number(search);
  if (search.trim() !== '' && Number.isFinite(asNumber)) query.$or.push({ _id: asNumber });
  return query;
}

/** Cached id page + counts for one compare request (cleared by any write made through the app). */
async function cachedIdPage(sourceColl, targetColl, cacheKey, query, tab, skip, limit) {
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const page = await idPage(sourceColl, targetColl, query, tab, skip, limit);
  setCached(cacheKey, page);
  return page;
}

/** The _id as shown to the user (a hex string for an ObjectId). */
function displayId(id) {
  const v = serializeDoc({ v: id }).v;
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/**
 * How the renderer shows and writes back one compared document's _id. The
 * display form flattens nested ObjectIds, so writes use canonical EJSON instead
 * (buildIdQuery revives it) — compound ids stay addressable.
 */
function idRef(id) {
  return { label: displayId(id), writeId: canonicalEJSON(id) };
}

async function compareDocuments(sourceDbName, targetDbName, collName, options = {}) {
  const { page = 1, limit = DEFAULT_QUERY_LIMIT, tab = 'common' } = options;
  const skip = (page - 1) * limit;

  const sourceColl = getClient('source').db(sourceDbName).collection(collName);
  const targetColl = getClient('target').db(targetDbName).collection(collName);

  const tabName = tab === 'only-source' ? 'onlyInSource' : tab === 'only-target' ? 'onlyInTarget' : 'common';
  const cacheKey = JSON.stringify([sourceDbName, targetDbName, collName, options.search || '', tabName, skip, limit]);
  const { pageIds, counts } = await cachedIdPage(
    sourceColl, targetColl, cacheKey, buildSearchQuery(options.search), tabName, skip, limit);
  const pageKeys = pageIds.map(typedKey);

  const fetchPage = (coll) => coll.find({ _id: { $in: pageIds } }).toArray();
  const [pageSourceDocs, pageTargetDocs] = await Promise.all([
    tab === 'only-target' ? [] : fetchPage(sourceColl),
    tab === 'only-source' ? [] : fetchPage(targetColl),
  ]);
  const byKey = (docs) => new Map(docs.map(d => [typedKey(d._id), d]));
  const sourcePageMap = byKey(pageSourceDocs);
  const targetPageMap = byKey(pageTargetDocs);

  const results = [];
  const itemIds = []; // parallel to results
  let pageIdenticalCount = 0;

  for (const key of pageKeys) {
    const sDoc = sourcePageMap.get(key);
    const tDoc = targetPageMap.get(key);
    const only = tab === 'only-source' ? sDoc : tab === 'only-target' ? tDoc : undefined;
    if (tab === 'only-source' || tab === 'only-target') {
      if (only) {
        results.push(serializeDoc(only));
        itemIds.push(idRef(only._id));
      }
    } else if (sDoc && tDoc) {
      // Type-aware, key-order-insensitive: a Date vs its ISO string differs,
      // the same fields in another order do not.
      if (bsonEqual(sDoc, tDoc)) {
        pageIdenticalCount++;
      } else {
        results.push({
          _id: displayId(sDoc._id),
          source: serializeDoc(sDoc),
          target: serializeDoc(tDoc),
          diffs: _computeDiffsRecursive(sDoc, tDoc),
        });
        itemIds.push(idRef(sDoc._id));
      }
    }
  }

  return {
    items: results,
    itemIds,
    pagination: {
      page,
      limit,
      total: counts[tabName],
      totalPages: Math.ceil(counts[tabName] / limit)
    },
    counts,
    pageIdenticalCount
  };
}

module.exports = {
  compareDatabases,
  compareCollections,
  compareCollectionsCross,
  compareDocuments,
};
