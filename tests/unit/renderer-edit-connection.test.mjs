import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };
const { describeUri } = await import('../../src/renderer/modals/edit-connection.js');

test('describeUri splits an SRV string and masks the password', () => {
  assert.deepEqual(describeUri('mongodb+srv://aldin:s3cr%40t@c.mongodb.net/app?retryWrites=true&w=majority'), {
    scheme: 'mongodb+srv', user: 'aldin (password set)', hosts: ['c.mongodb.net'], database: 'app', options: ['retryWrites=true', 'w=majority'],
  });
});

test('describeUri handles seed lists, no credentials and no database', () => {
  const info = describeUri('mongodb://h1:27017,h2:27017/?replicaSet=rs0');
  assert.deepEqual(info.hosts, ['h1:27017', 'h2:27017']);
  assert.equal(info.user, '');
  assert.equal(info.database, '');
  assert.deepEqual(info.options, ['replicaSet=rs0']);
  assert.equal(describeUri('mongodb://user@h').user, 'user');
});

test('describeUri rejects non-MongoDB strings', () => {
  assert.equal(describeUri('postgres://x'), null);
  assert.equal(describeUri('localhost:27017'), null);
});
