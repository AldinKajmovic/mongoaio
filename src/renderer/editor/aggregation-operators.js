import { parseRelaxedJSON } from '../utils/dom.js';

// Stage operators, templates and pure pipeline logic for the aggregation
// builder. No DOM and no module state — everything here takes its inputs as
// arguments so it can be unit-reasoned in isolation from the view.

// Operators offered in the stage selector. `body` is the prefilled template
// snippet; `scalar` marks stages whose body is a number/string rather than an
// object (handled by parseRelaxedJSON, which accepts bare literals too).
export const OPERATORS = [
  { op: '$match', body: '{\n  \n}' },
  { op: '$group', body: '{\n  "_id": null\n}' },
  { op: '$project', body: '{\n  \n}' },
  { op: '$sort', body: '{ "field": -1 }' },
  { op: '$limit', body: '10', scalar: true },
  { op: '$skip', body: '0', scalar: true },
  { op: '$unwind', body: '"$arrayField"', scalar: true },
  { op: '$lookup', body: '{\n  "from": "",\n  "localField": "",\n  "foreignField": "",\n  "as": ""\n}' },
  { op: '$count', body: '"count"', scalar: true },
  { op: '$addFields', body: '{\n  \n}' },
  { op: '$set', body: '{\n  \n}' },
  { op: '$unset', body: '"field"', scalar: true },
  { op: '$facet', body: '{\n  \n}' },
  { op: '$sample', body: '{ "size": 10 }' },
  { op: '$replaceRoot', body: '{ "newRoot": "$field" }' },
  { op: '$out', body: '"collectionName"', scalar: true },
  { op: '$merge', body: '{ "into": "" }' },
];

export const TEMPLATES = Object.fromEntries(OPERATORS.map((o) => [o.op, o.body]));
export const TEMPLATE_SET = new Set(Object.values(TEMPLATES));

// Body+operator signature last previewed, used for the staleness check.
export function stageSignature(stage) {
  return `${stage.operator}::${stage.body}`;
}

// Parse one stage body into its value. Throws Error(message) on failure.
export function parseStageBody(stage) {
  const raw = (stage.body || '').trim();
  if (raw === '') throw new Error('Stage body is empty');
  try {
    return parseRelaxedJSON(raw);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
}

// Assemble the pipeline from enabled stages with index <= upTo. When
// `forceIndex` is provided that stage is always included (used so you can
// preview a stage even while it is toggled off). Throws an Error with
// { stageId, stageNum } attached identifying the offending stage.
export function assemble(stages, upTo, forceIndex) {
  const pipeline = [];
  const end = upTo === undefined ? stages.length - 1 : upTo;
  for (let i = 0; i <= end; i++) {
    const stage = stages[i];
    if (!stage.enabled && i !== forceIndex) continue;
    let value;
    try {
      value = parseStageBody(stage);
    } catch (e) {
      const err = new Error(e.message);
      err.stageId = stage.id;
      err.stageNum = i + 1;
      throw err;
    }
    pipeline.push({ [stage.operator]: value });
  }
  return pipeline;
}
