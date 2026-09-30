import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = new EventTarget();
const store = await import('../../src/renderer/editor/pending-edits.js');

beforeEach(() => store.discardAll());

test('docKeyFor distinguishes types and compound ids', () => {
  const keys = new Set([
    store.docKeyFor(1), store.docKeyFor('1'),
    store.docKeyFor({ k: 1 }), store.docKeyFor({ k: 2 }),
  ]);
  assert.equal(keys.size, 4);
});

test('compound _ids get separate groups', () => {
  store.stageChange({ k: 1 }, 0, 'n', 'set', 1, 2);
  store.stageChange({ k: 2 }, 1, 'n', 'set', 1, 3);
  assert.equal(store.pendingDocCount(), 2);
  assert.equal(store.pendingCount(), 2);
});

test('re-staging keeps the original stored value; editing back un-stages', () => {
  store.stageChange('a', 0, 'x', 'set', 'orig', 'v1');
  const c = store.stageChange('a', 0, 'x', 'set', 'v1', 'v2');
  assert.equal(c.oldValue, 'orig');
  assert.equal(store.stageChange('a', 0, 'x', 'set', 'v2', 'orig'), null);
  assert.equal(store.hasPending(), false);
});

test('a typed value is compared by its display form', () => {
  const hex = '65f000000000000000000001';
  assert.equal(store.stageChange('a', 0, 'id', 'set', hex, { $oid: hex }, hex), null);
  const c = store.stageChange('a', 0, 'when', 'set', 'x', { $date: '2024-01-01T00:00:00.000Z' }, '2024-01-01T00:00:00.000Z');
  assert.equal(c.display, '2024-01-01T00:00:00.000Z');
});

test('revert, clearGroup and change events', () => {
  let events = 0;
  document.addEventListener('editor-pending-changed', () => { events++; });
  store.stageChange('a', 0, 'x', 'set', 1, 2);
  store.stageChange('a', 0, 'y', 'unset', 1, undefined);
  assert.equal(store.getChange('a', 'y').kind, 'unset');
  assert.ok(store.revertChange('a', 'x'));
  assert.equal(store.revertChange('a', 'x'), null);
  store.clearGroup(store.docKeyFor('a'));
  assert.equal(store.hasPending(), false);
  assert.ok(events >= 4);
});

test('pendingGroups is a snapshot safe to iterate while clearing', () => {
  store.stageChange('a', 0, 'x', 'set', 1, 2);
  store.stageChange('b', 1, 'x', 'set', 1, 2);
  for (const g of store.pendingGroups()) store.clearGroup(g.docKey);
  assert.equal(store.pendingDocCount(), 0);
});
