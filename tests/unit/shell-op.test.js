const test = require('node:test');
const assert = require('node:assert/strict');
const { tagArgs, guardMethod } = require('../../src/db/shell-op');

const signal = new AbortController().signal;
const op = { comment: 'mongoaio:x', maxTimeMS: 5000, signal };

test('reads get comment + maxTimeMS in their options slot', () => {
  assert.deepEqual(tagArgs('countDocuments', [{ a: 1 }], op), [{ a: 1 }, { comment: 'mongoaio:x', maxTimeMS: 5000 }]);
  assert.deepEqual(tagArgs('distinct', ['k'], op), ['k', undefined, { comment: 'mongoaio:x', maxTimeMS: 5000 }]);
  assert.deepEqual(tagArgs('estimatedDocumentCount', [], op), [{ comment: 'mongoaio:x', maxTimeMS: 5000 }]);
});

test('cursor methods also carry the abort signal', () => {
  const [, opts] = tagArgs('find', [{}], op);
  assert.equal(opts.signal, signal);
  assert.equal(opts.maxTimeMS, 5000);
});

test('writes get the comment but no maxTimeMS', () => {
  assert.deepEqual(tagArgs('updateMany', [{}, { $set: { a: 1 } }], op), [{}, { $set: { a: 1 } }, { comment: 'mongoaio:x' }]);
});

test('user options win and unusual signatures are left alone', () => {
  const [, opts] = tagArgs('find', [{}, { maxTimeMS: 10, comment: 'mine' }], op);
  assert.equal(opts.maxTimeMS, 10);
  assert.equal(opts.comment, 'mine');
  assert.deepEqual(tagArgs('deleteOne', [{}, true], op), [{}, true]);
  assert.deepEqual(tagArgs('watch', [[]], op), [[]]);
});

test('guarded methods refuse to run once the op is aborted', () => {
  const controller = new AbortController();
  const calls = [];
  const target = { insertOne(...args) { calls.push(args); return 'ok'; } };
  const insert = guardMethod(target.insertOne, target, 'insertOne', { ...op, signal: controller.signal });
  assert.equal(insert({ a: 1 }), 'ok');
  assert.deepEqual(calls[0], [{ a: 1 }, { comment: 'mongoaio:x' }]);
  controller.abort(new Error('Query cancelled'));
  assert.throws(() => insert({ a: 2 }), /cancelled/);
  assert.equal(calls.length, 1);
});
