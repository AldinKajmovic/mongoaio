
const { compareIds } = require('./bson-order');
const { typedKey } = require('./serialize');
const ID_BATCH_SIZE = 1000;

const TAB_OF_SIDE = { source: 'onlyInSource', target: 'onlyInTarget', both: 'common' };

class UnorderedIdsError extends Error { }

/** Forward reader over an _id cursor that rejects out-of-order or unorderable ids. */
function orderedReader(cursor) {
  let prev;
  let started = false;
  return async () => {
    const doc = await cursor.next();
    if (!doc) return null;
    if (started && !(compareIds(prev, doc._id) < 0)) throw new UnorderedIdsError('ids are not in comparable order');
    started = true;
    prev = doc._id;
    return doc._id;
  };
}

/**
 * Walk both _id streams in order, calling `visit(side, id)` once per distinct id.
 * @param {(side: 'source'|'target'|'both', id: any) => void} visit
 */
async function mergeIds(sourceColl, targetColl, query, visit) {
  const open = (coll) => coll.find(query, { projection: { _id: 1 }, batchSize: ID_BATCH_SIZE }).sort({ _id: 1 });
  const sourceCursor = open(sourceColl);
  const targetCursor = open(targetColl);
  const nextSource = orderedReader(sourceCursor);
  const nextTarget = orderedReader(targetCursor);
  try {
    let [s, t] = await Promise.all([nextSource(), nextTarget()]);
    while (s !== null || t !== null) {
      const order = s === null ? 1 : t === null ? -1 : compareIds(s, t);
      if (order === null) throw new UnorderedIdsError('ids cannot be compared');
      if (order < 0) {
        visit('source', s);
        s = await nextSource();
      } else if (order > 0) {
        visit('target', t);
        t = await nextTarget();
      } else {
        visit('both', s);
        [s, t] = await Promise.all([nextSource(), nextTarget()]);
      }
    }
  } finally {
    await Promise.all([sourceCursor.close(), targetCursor.close()]).catch(() => { });
  }
}

/**
 * One page of a compare tab plus the counts of every tab, in a single pass.
 * @param {'onlyInSource'|'onlyInTarget'|'common'} tab
 * @returns {Promise<{ pageIds: any[], counts: Record<string, number> }>}
 */
async function streamIdPage(sourceColl, targetColl, query, tab, skip, limit) {
  const counts = { onlyInSource: 0, onlyInTarget: 0, common: 0 };
  const pageIds = [];
  await mergeIds(sourceColl, targetColl, query, (side, id) => {
    const name = TAB_OF_SIDE[side];
    const position = counts[name]++;
    if (name === tab && position >= skip && pageIds.length < limit) pageIds.push(id);
  });
  return { pageIds, counts: withTotals(counts) };
}

/**
 * Stream `from`'s ids and report, batch by batch, which of them `other` also
 * holds. $in may over-match (numeric equality across types, a collation's
 * case-folding), so every hit is confirmed by typed key.
 * @param {(id: any, inOther: boolean) => void} visit
 */
async function scanAgainst(from, other, query, visit) {
  const cursor = from.find(query, { projection: { _id: 1 }, batchSize: ID_BATCH_SIZE }).sort({ _id: 1 });
  let batch = [];
  const flush = async () => {
    const found = await other.find({ _id: { $in: batch } }, { projection: { _id: 1 } }).toArray();
    const held = new Set(found.map(d => typedKey(d._id)));
    for (const id of batch) visit(id, held.has(typedKey(id)));
    batch = [];
  };
  try {
    for await (const doc of cursor) {
      batch.push(doc._id);
      if (batch.length >= ID_BATCH_SIZE) await flush();
    }
    if (batch.length > 0) await flush();
  } finally {
    await cursor.close().catch(() => { });
  }
}

/** Order-free page + counts: each side is checked against the other in bounded batches. */
async function lookupIdPage(sourceColl, targetColl, query, tab, skip, limit) {
  const counts = { onlyInSource: 0, onlyInTarget: 0, common: 0 };
  const pageIds = [];
  const take = (name, id) => {
    const position = counts[name]++;
    if (name === tab && position >= skip && pageIds.length < limit) pageIds.push(id);
  };
  await Promise.all([
    scanAgainst(sourceColl, targetColl, query, (id, inTarget) => take(inTarget ? 'common' : 'onlyInSource', id)),
    scanAgainst(targetColl, sourceColl, query, (id, inSource) => { if (!inSource) take('onlyInTarget', id); }),
  ]);
  return { pageIds, counts: withTotals(counts) };
}

/** A collection whose default collation is not binary sorts strings in an order compareIds cannot follow. */
async function hasSimpleOrder(coll) {
  try {
    const { collation } = await coll.options();
    return !collation || collation.locale === 'simple';
  } catch (_) {
    return true; // missing collection: nothing to order
  }
}

function withTotals(counts) {
  return { ...counts, sourceTotal: counts.onlyInSource + counts.common, targetTotal: counts.onlyInTarget + counts.common };
}

/** Page of ids for a compare tab: merged when the ids are orderable, otherwise looked up in batches. */
async function idPage(sourceColl, targetColl, query, tab, skip, limit) {
  const [sourceSimple, targetSimple] = await Promise.all([hasSimpleOrder(sourceColl), hasSimpleOrder(targetColl)]);
  if (!sourceSimple || !targetSimple) return lookupIdPage(sourceColl, targetColl, query, tab, skip, limit);
  try {
    return await streamIdPage(sourceColl, targetColl, query, tab, skip, limit);
  } catch (err) {
    if (!(err instanceof UnorderedIdsError)) throw err;
    return lookupIdPage(sourceColl, targetColl, query, tab, skip, limit);
  }
}

module.exports = { idPage, streamIdPage, lookupIdPage, UnorderedIdsError };
