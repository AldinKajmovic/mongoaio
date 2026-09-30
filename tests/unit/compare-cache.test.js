const test = require('node:test');
const assert = require('node:assert/strict');
const { getCached, setCached, invalidateCompareCache } = require('../../src/db/compare-cache');

test('stores, evicts oldest past capacity, and invalidates', () => {
  invalidateCompareCache();
  for (let i = 0; i < 6; i++) setCached(`k${i}`, i);
  assert.equal(getCached('k0'), undefined, 'oldest evicted');
  assert.equal(getCached('k5'), 5);
  invalidateCompareCache();
  assert.equal(getCached('k5'), undefined);
});

test('entries expire after the TTL', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  setCached('ttl', 1);
  assert.equal(getCached('ttl'), 1);
  t.mock.timers.tick(31000);
  assert.equal(getCached('ttl'), undefined);
});
