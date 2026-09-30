import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
};
const qt = await import('../../src/renderer/utils/query-timeout.js');

test('timeout preference defaults, persists, and ignores junk', () => {
  assert.equal(qt.getQueryTimeoutMs(), 60000);
  qt.setQueryTimeoutMs(15000);
  assert.equal(qt.getQueryTimeoutMs(), 15000);
  storage.set('query-timeout-ms', '999');
  assert.equal(qt.getQueryTimeoutMs(), 60000, 'values outside the choices fall back');
});

test('timeout preference survives unavailable storage', () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(qt.getQueryTimeoutMs(), 60000);
  qt.setQueryTimeoutMs(30000);
  globalThis.localStorage = saved;
});

test('describeQueryError', () => {
  assert.equal(qt.describeQueryError('Query cancelled'), null);
  assert.equal(qt.describeQueryError('This operation was aborted'), null);
  assert.match(qt.describeQueryError('operation exceeded time limit'), /time limit/);
  assert.equal(qt.describeQueryError('E11000 duplicate key'), 'E11000 duplicate key');
});

test('cancellableOptions carries the id and the current limit', () => {
  storage.clear();
  const id = qt.newOpId();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(qt.cancellableOptions(id), { opId: id, maxTimeMS: 60000 });
});
