const { BSONRegExp } = require('mongodb');
const { getClient } = require('./connection');
const { serializeDoc, serializeDocEJSON, canonicalEJSON, deserializeInput } = require('./serialize');
const { buildIdQuery } = require('./id-query');
const { preserveTypes, valueAtPath } = require('./type-preserve');

/** Stored documents are read unpromoted so edits keep Double vs Int32 (see type-preserve.js). */
const RAW_READ = { promoteValues: false };

const CONFLICT = 'Document changed on the server since it was loaded (or was deleted). Re-run the query and try again.';

function collection(side, dbName, collName) {
  return getClient(side).db(dbName).collection(collName);
}

async function unsetField(side, dbName, collName, docId, fieldPath) {
  if (fieldPath === '_id') throw new Error('The _id field cannot be removed.');
  const result = await collection(side, dbName, collName)
    .updateOne(buildIdQuery(docId), { $unset: { [fieldPath]: '' } });
  return { modifiedCount: result.modifiedCount };
}

async function setField(side, dbName, collName, docId, fieldPath, value) {
  if (fieldPath === '_id') throw new Error('The _id field cannot be modified.');
  const coll = collection(side, dbName, collName);
  const stored = await coll.findOne(buildIdQuery(docId), RAW_READ);
  if (!stored) throw new Error('Document not found — it may have been deleted.');
  const revived = preserveTypes(valueAtPath(stored, fieldPath), value);
  const result = await coll.updateOne({ _id: stored._id }, { $set: { [fieldPath]: revived } });
  return { modifiedCount: result.modifiedCount, matchedCount: result.matchedCount };
}

/** Filter clause asserting a path still holds the value the editor loaded. */
function expectClause(ejsonValue) {
  const value = deserializeInput(ejsonValue);
  // A regex in a query means "matches", not "equals" — skip the check for it.
  if (value instanceof RegExp || value instanceof BSONRegExp) return null;
  return { $eq: value };
}

/**
 * Canonical EJSON of each path's value before the update (absent paths omitted),
 * so an undo can restore the exact type — relaxed EJSON turns a 5.0 double into 5.
 */
function previousValues(stored, paths) {
  const out = {};
  for (const path of paths) {
    const value = valueAtPath(stored, path);
    if (value !== undefined) out[path] = canonicalEJSON(value);
  }
  return out;
}

/** Atomic staged edits; fails as a conflict if any `expect`/`expectMissing` value changed. */
async function applyFieldChanges(side, dbName, collName, docId, changes) {
  const { set = {}, unset = [], expect = {}, expectMissing = [], exact = false } = changes;
  const coll = collection(side, dbName, collName);
  const stored = await coll.findOne(buildIdQuery(docId), RAW_READ);
  if (!stored) throw new Error(CONFLICT);

  const filter = { _id: stored._id };
  for (const [path, expected] of Object.entries(expect)) {
    if (path === '_id') continue;
    const clause = expectClause(expected);
    if (clause) filter[path] = clause;
  }
  for (const path of expectMissing) {
    if (path !== '_id') filter[path] = { $exists: false };
  }

  const update = {};
  for (const [path, value] of Object.entries(set)) {
    if (path === '_id') throw new Error('The _id field cannot be modified.');
    (update.$set ||= {})[path] = exact === true
      ? deserializeInput(value)
      : preserveTypes(valueAtPath(stored, path), value);
  }
  for (const path of unset) {
    if (path === '_id') throw new Error('The _id field cannot be removed.');
    (update.$unset ||= {})[path] = '';
  }
  const previousEJSON = previousValues(stored, [...Object.keys(set), ...unset]);
  if (!update.$set && !update.$unset) {
    return { document: serializeDoc(stored), documentEJSON: serializeDocEJSON(stored), previousEJSON };
  }

  const saved = await coll.findOneAndUpdate(filter, update, { returnDocument: 'after' });
  if (!saved) throw new Error(CONFLICT);
  return { document: serializeDoc(saved), documentEJSON: serializeDocEJSON(saved), previousEJSON };
}

module.exports = { unsetField, setField, applyFieldChanges };
