const { getClient } = require('./connection');
const { serializeDoc, serializeDocEJSON, deserializeInput } = require('./serialize');
const { SOCKET_TIMEOUT_MS } = require('./constants');

const DEFAULT_PREVIEW_LIMIT = 50;

async function runAggregate(side, dbName, collName, pipeline, options = {}) {
  const coll = getClient(side).db(dbName).collection(collName);

  const revived = deserializeInput(Array.isArray(pipeline) ? pipeline : []);
  const limit = Number.isFinite(options.limit) ? options.limit : DEFAULT_PREVIEW_LIMIT;

  const hasOutput = revived.some((s) => s && (s.$out !== undefined || s.$merge !== undefined));

  const finalPipeline = revived.slice();
  // Fetch one extra doc so we can flag truncation without a separate count.
  if (!hasOutput && limit > 0) finalPipeline.push({ $limit: limit + 1 });

  const docs = await coll
    .aggregate(finalPipeline, { allowDiskUse: true, maxTimeMS: SOCKET_TIMEOUT_MS })
    .toArray();

  if (hasOutput) {
    return { items: [], itemsEJSON: [], count: 0, truncated: false, written: true };
  }

  let truncated = false;
  let out = docs;
  if (limit > 0 && docs.length > limit) {
    truncated = true;
    out = docs.slice(0, limit);
  }

  return {
    items: out.map(serializeDoc),
    itemsEJSON: out.map(serializeDocEJSON),
    count: out.length,
    truncated,
  };
}

module.exports = { runAggregate };
