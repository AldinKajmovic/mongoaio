const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mongoaio-conn-'));
const keychain = { available: true };
const fakeElectron = {
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => keychain.available,
    encryptString: (s) => Buffer.from(`enc:${s}`),
    decryptString: (b) => {
      const s = b.toString();
      if (!s.startsWith('enc:')) throw new Error('bad');
      return s.slice(4);
    },
  },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, ...rest);
};
const store = require('../../src/main/connections-store');
const file = () => path.join(userData, 'connections.json');
const raw = () => JSON.parse(fs.readFileSync(file(), 'utf8'));

test.beforeEach(() => { fs.rmSync(file(), { force: true }); keychain.available = true; });
test.after(() => { Module._load = origLoad; fs.rmSync(userData, { recursive: true, force: true }); });

test('saved URLs are encrypted at rest and decrypted on read', () => {
  store.saveConnection('prod', 'mongodb://u:secret@h/db');
  assert.ok(!fs.readFileSync(file(), 'utf8').includes('secret'));
  assert.deepEqual(store.getConnections(), { prod: 'mongodb://u:secret@h/db' });
  assert.deepEqual(store.getStorageInfo(), { encrypted: true, plaintextEntries: 0 });
});

test('the file is owner-only', { skip: process.platform === 'win32' }, () => {
  store.saveConnection('a', 'mongodb://h');
  assert.equal(fs.statSync(file()).mode & 0o777, 0o600);
});

test('plaintext entries are migrated once a keychain is available', () => {
  keychain.available = false;
  store.saveConnection('old', 'mongodb://plain');
  assert.equal(raw().old, 'mongodb://plain');
  assert.deepEqual(store.getStorageInfo(), { encrypted: false, plaintextEntries: 1 });
  keychain.available = true;
  assert.equal(store.getConnections().old, 'mongodb://plain');
  assert.ok(raw().old.enc, 'rewritten encrypted');
});

test('an undecryptable entry is reported empty instead of throwing', () => {
  fs.writeFileSync(file(), JSON.stringify({ broken: { enc: Buffer.from('garbage').toString('base64') } }));
  assert.deepEqual(store.getConnections(), { broken: '' });
});

test('a corrupt file reads as no connections', () => {
  fs.writeFileSync(file(), '{not json');
  assert.deepEqual(store.getConnections(), {});
});

test('updateConnection renames in place and changes the URL', () => {
  store.saveConnection('a', 'mongodb://a');
  store.saveConnection('b', 'mongodb://b');
  store.saveConnection('c', 'mongodb://c');
  const out = store.updateConnection('b', 'b2', 'mongodb://b2');
  assert.deepEqual(Object.keys(out), ['a', 'b2', 'c'], 'order preserved');
  assert.equal(out.b2, 'mongodb://b2');
  assert.equal(store.updateConnection('a', 'a', 'mongodb://a2').a, 'mongodb://a2', 'URL-only edit');
});

test('updateConnection refuses duplicates and missing sources', () => {
  store.saveConnection('a', 'mongodb://a');
  store.saveConnection('b', 'mongodb://b');
  assert.throws(() => store.updateConnection('a', 'b', 'mongodb://x'), /already exists/);
  assert.throws(() => store.updateConnection('zzz', 'y', 'mongodb://x'), /no longer exists/);
  assert.equal(store.getConnections().b, 'mongodb://b');
});

test('reserved aliases are rejected', () => {
  for (const alias of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(() => store.saveConnection(alias, 'mongodb://x'), /can't be used/);
  }
  store.saveConnection('a', 'mongodb://a');
  assert.throws(() => store.updateConnection('a', '__proto__', 'mongodb://x'));
});

test('deleteConnection removes only that alias', () => {
  store.saveConnection('a', 'mongodb://a');
  store.saveConnection('b', 'mongodb://b');
  assert.deepEqual(Object.keys(store.deleteConnection('a')), ['b']);
  assert.deepEqual(Object.keys(store.deleteConnection('missing')), ['b']);
});
