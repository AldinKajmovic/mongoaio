import { $ } from '../utils/state.js';

export function buildCollectionOptions() {
  const opts = {};
  const type = document.querySelector('input[name="add-coll-type"]:checked')?.value || 'default';

  if (type === 'capped') {
    const size = parseInt($('#add-coll-capped-size')?.value, 10);
    if (!size || size <= 0) throw new Error('Capped collection requires a valid maximum size in bytes');
    opts.capped = true;
    opts.size = size;
    const max = parseInt($('#add-coll-capped-max')?.value, 10);
    if (max > 0) opts.max = max;
  }

  if (type === 'timeseries') {
    const timeField = $('#add-coll-ts-timefield')?.value.trim();
    if (!timeField) throw new Error('Time Series collection requires a Time Field');
    opts.timeseries = { timeField };
    const metaField = $('#add-coll-ts-metafield')?.value.trim();
    if (metaField) opts.timeseries.metaField = metaField;
    const granularity = $('#add-coll-ts-granularity')?.value;
    if (granularity) opts.timeseries.granularity = granularity;
    const expire = parseInt($('#add-coll-ts-expire')?.value, 10);
    if (expire > 0) opts.expireAfterSeconds = expire;
  }

  if (type === 'clustered') {
    const idxName = $('#add-coll-clustered-name')?.value.trim();
    opts.clusteredIndex = { key: { _id: 1 }, unique: true };
    if (idxName) opts.clusteredIndex.name = idxName;
  }

  // Storage Engine
  const storageJson = $('#add-coll-storage-editor')?.value.trim();
  if (storageJson && storageJson !== '{\n}' && storageJson !== '{}') {
    opts.storageEngine = JSON.parse(storageJson);
  }

  // Validator
  const validatorJson = $('#add-coll-validator-editor')?.value.trim();
  if (validatorJson && validatorJson !== '{\n}' && validatorJson !== '{}') {
    opts.validator = JSON.parse(validatorJson);
  }
  const level = $('#add-coll-validation-level')?.value;
  if (level && level !== 'strict') opts.validationLevel = level;
  const action = $('#add-coll-validation-action')?.value;
  if (action && action !== 'error') opts.validationAction = action;

  // Collation
  const collation = buildCollation();
  if (collation) opts.collation = collation;

  return opts;
}

/**
 * Read collation form fields and return a collation object, or null if not set.
 */
function buildCollation() {
  const locale = $('#add-coll-col-locale')?.value;
  if (!locale || locale === 'simple') return null;
  const coll = { locale };
  const strength = $('#add-coll-col-strength')?.value;
  if (strength) coll.strength = parseInt(strength, 10);
  const caseLevel = $('#add-coll-col-caselevel')?.value;
  if (caseLevel) coll.caseLevel = caseLevel === 'true';
  const caseFirst = $('#add-coll-col-casefirst')?.value;
  if (caseFirst) coll.caseFirst = caseFirst;
  const numeric = $('#add-coll-col-numeric')?.value;
  if (numeric) coll.numericOrdering = numeric === 'true';
  const alt = $('#add-coll-col-alternate')?.value;
  if (alt) coll.alternate = alt;
  const maxVar = $('#add-coll-col-maxvar')?.value;
  if (maxVar) coll.maxVariable = maxVar;
  const back = $('#add-coll-col-backwards')?.value;
  if (back) coll.backwards = back === 'true';
  const norm = $('#add-coll-col-normalization')?.value;
  if (norm) coll.normalization = norm === 'true';
  return coll;
}
