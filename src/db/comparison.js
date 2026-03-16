const { ObjectId } = require('mongodb');
const { getClient } = require('./connection');
const { serializeDoc, deepEqual, computeDiffs } = require('./serialize');
const { listDatabases, listCollections } = require('./query');
const { DEFAULT_QUERY_LIMIT } = require('./constants');

async function compareDatabases() {
  const sourceDbs = await listDatabases('source');
  const targetDbs = await listDatabases('target');

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
  const sourceColls = await listCollections('source', sourceDbName);
  const targetColls = await listCollections('target', targetDbName);

  const sourceSet = new Set(sourceColls);
  const targetSet = new Set(targetColls);

  const common = sourceColls.filter(c => targetSet.has(c));
  const onlyInSource = sourceColls.filter(c => !targetSet.has(c));
  const onlyInTarget = targetColls.filter(c => !sourceSet.has(c));

  return { common, onlyInSource, onlyInTarget };
}

async function compareDocuments(sourceDbName, targetDbName, collName, options = {}) {
  const { page = 1, limit = DEFAULT_QUERY_LIMIT, tab = 'common' } = options;
  const skip = (page - 1) * limit;

  const sourceClient = getClient('source');
  const targetClient = getClient('target');

  const sourceColl = sourceClient.db(sourceDbName).collection(collName);
  const targetColl = targetClient.db(targetDbName).collection(collName);

  const query = {};
  if (options.search) {
    // Escape regex special characters to prevent ReDoS
    const escapedSearch = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.$or = [
      { _id: searchRegex },
    ];
    try {
      const oid = new ObjectId(options.search);
      query.$or.push({ _id: oid });
    } catch (e) { }
  }

  const [sourceIds, targetIds] = await Promise.all([
    sourceColl.find(query, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray(),
    targetColl.find(query, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray()
  ]);

  const sIds = sourceIds.map(d => d._id.toString());
  const tIds = targetIds.map(d => d._id.toString());

  const sourceSet = new Set(sIds);
  const targetSet = new Set(tIds);

  const onlyInSourceIds = sIds.filter(id => !targetSet.has(id));
  const onlyInTargetIds = tIds.filter(id => !sourceSet.has(id));
  const commonIds = sIds.filter(id => targetSet.has(id));

  let idsToFetch = [];
  let totalCount = 0;

  if (tab === 'only-source') {
    totalCount = onlyInSourceIds.length;
    idsToFetch = onlyInSourceIds.slice(skip, skip + limit);
  } else if (tab === 'only-target') {
    totalCount = onlyInTargetIds.length;
    idsToFetch = onlyInTargetIds.slice(skip, skip + limit);
  } else {
    totalCount = commonIds.length;
    idsToFetch = commonIds.slice(skip, skip + limit);
  }

  const objectIdsToFetch = idsToFetch.map(id => {
    try { return new ObjectId(id); } catch { return id; }
  });

  const [pageSourceDocs, pageTargetDocs] = await Promise.all([
    sourceColl.find({ _id: { $in: objectIdsToFetch } }).toArray(),
    targetColl.find({ _id: { $in: objectIdsToFetch } }).toArray()
  ]);

  const sourcePageMap = new Map(pageSourceDocs.map(d => [d._id.toString(), d]));
  const targetPageMap = new Map(pageTargetDocs.map(d => [d._id.toString(), d]));

  const results = [];
  let pageIdenticalCount = 0;

  if (tab === 'only-source') {
    for (const id of idsToFetch) {
      const doc = sourcePageMap.get(id);
      if (doc) results.push(serializeDoc(doc));
    }
  } else if (tab === 'only-target') {
    for (const id of idsToFetch) {
      const doc = targetPageMap.get(id);
      if (doc) results.push(serializeDoc(doc));
    }
  } else {
    // tab === 'common'
    for (const id of idsToFetch) {
      const sDoc = sourcePageMap.get(id);
      const tDoc = targetPageMap.get(id);
      if (sDoc && tDoc) {
        const isDiff = !deepEqual(sDoc, tDoc);
        if (isDiff) {
          results.push({
            _id: id,
            source: serializeDoc(sDoc),
            target: serializeDoc(tDoc),
            diffs: computeDiffs(sDoc, tDoc),
          });
        } else {
          pageIdenticalCount++;
        }
      }
    }
  }

  return {
    items: results,
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    },
    counts: {
      onlyInSource: onlyInSourceIds.length,
      onlyInTarget: onlyInTargetIds.length,
      common: commonIds.length,
      sourceTotal: sourceIds.length,
      targetTotal: targetIds.length,
    },
    pageIdenticalCount
  };
}

module.exports = {
  compareDatabases,
  compareCollections,
  compareCollectionsCross,
  compareDocuments,
};
