const test = require('node:test');
const assert = require('node:assert/strict');
const { wantsDirectConnection } = require('../../src/db/connection');

test('single host without replica set options connects directly', () => {
  assert.equal(wantsDirectConnection('mongodb://localhost:27017'), true);
  assert.equal(wantsDirectConnection('mongodb://user:p%40ss@db.example.com/app?authSource=admin'), true);
});

test('seed lists and replica-set URIs use discovery', () => {
  assert.equal(wantsDirectConnection('mongodb://h1,h2,h3/?replicaSet=rs0'), false);
  assert.equal(wantsDirectConnection('mongodb://u:p@h1:27017,h2:27017/db'), false);
  assert.equal(wantsDirectConnection('mongodb://h1/db?replicaSet=rs0'), false);
  assert.equal(wantsDirectConnection('mongodb://h1/?loadBalanced=true'), false);
});

test('an explicit directConnection option is never overridden', () => {
  assert.equal(wantsDirectConnection('mongodb://h1/?directConnection=false'), false);
  assert.equal(wantsDirectConnection('mongodb://h1/?w=1&directConnection=true'), false);
});

test('an @ in the password does not hide a comma in the host list', () => {
  assert.equal(wantsDirectConnection('mongodb://u:a@b@h1,h2/db'), false);
});
