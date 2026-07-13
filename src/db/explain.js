const { getClient } = require('./connection');
const { serializeDoc } = require('./serialize');
const { reviveExtendedJson } = require('./query');
const { DEFAULT_QUERY_LIMIT, SOCKET_TIMEOUT_MS } = require('./constants');

async function explainQuery(side, dbName, collName, options = {}, verbosity = 'executionStats') {
  const allowed = ['queryPlanner', 'executionStats', 'allPlansExecution'];
  const mode = allowed.includes(verbosity) ? verbosity : 'executionStats';

  const { filter = {}, sort = {}, projection = {}, limit = DEFAULT_QUERY_LIMIT, skip = 0 } = options;
  const normalizedFilter = reviveExtendedJson(filter);

  const coll = getClient(side).db(dbName).collection(collName);
  const cursor = coll
    .find(normalizedFilter, { projection })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .maxTimeMS(SOCKET_TIMEOUT_MS);

  const raw = await cursor.explain(mode);

  return { summary: summarize(raw), raw: serializeDoc(raw) };
}
function collectStages(stage, acc = []) {
  if (!stage || typeof stage !== 'object') return acc;
  if (stage.stage) acc.push(stage.stage);
  if (stage.inputStage) collectStages(stage.inputStage, acc);
  if (Array.isArray(stage.inputStages)) stage.inputStages.forEach((s) => collectStages(s, acc));
  return acc;
}
function findIndexName(stage) {
  if (!stage || typeof stage !== 'object') return null;
  if (stage.indexName) return stage.indexName;
  if (stage.inputStage) return findIndexName(stage.inputStage);
  if (Array.isArray(stage.inputStages)) {
    for (const s of stage.inputStages) {
      const n = findIndexName(s);
      if (n) return n;
    }
  }
  return null;
}

/**
 * Reduce a raw explain document to the numbers users actually look at:
 * whether an index was used, docs examined vs returned, and timing.
 */
function summarize(raw) {
  const qp = raw.queryPlanner || (raw.stages && raw.stages[0] && raw.stages[0].$cursor && raw.stages[0].$cursor.queryPlanner) || {};
  const winning = qp.winningPlan || {};
  const stages = collectStages(winning);
  const indexName = findIndexName(winning);
  const usedIndex = stages.includes('IXSCAN') || !!indexName;

  const exec = raw.executionStats || {};
  const docsExamined = exec.totalDocsExamined;
  const keysExamined = exec.totalKeysExamined;
  const nReturned = exec.nReturned;

  return {
    namespace: qp.namespace || null,
    usedIndex,
    indexName: indexName || null,
    isCollScan: stages.includes('COLLSCAN'),
    stages,
    nReturned,
    docsExamined,
    keysExamined,
    executionTimeMillis: exec.executionTimeMillis,
    // A rough efficiency ratio: 1 doc examined per doc returned is ideal.
    examineRatio: (typeof docsExamined === 'number' && nReturned > 0)
      ? Number((docsExamined / nReturned).toFixed(2))
      : null,
  };
}

module.exports = { explainQuery };
