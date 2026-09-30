const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const Module = require('module');

const handlers = new Map();
const fakeElectron = {
  ipcMain: {
    handle: (channel, fn) => {
      if (handlers.has(channel)) throw new Error(`second handler for ${channel}`);
      handlers.set(channel, fn);
    },
  },
  app: { getPath: () => os.tmpdir(), getVersion: () => '0.0.0' },
  safeStorage: { isEncryptionAvailable: () => false },
  dialog: {},
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, ...rest);
};
const { registerIpcHandlers } = require('../../ipc-handlers');
registerIpcHandlers(() => null);
test.after(() => { Module._load = origLoad; });

const call = (channel, ...args) => handlers.get(channel)({}, ...args);

test('every preload channel has a handler', () => {
  const preload = require('fs').readFileSync(require.resolve('../../preload.js'), 'utf8');
  const invoked = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m => m[1]);
  const updaterOnly = new Set(['get-version', 'download-update', 'install-update']);
  for (const channel of invoked) {
    if (updaterOnly.has(channel)) continue;
    assert.ok(handlers.has(channel), `missing handler: ${channel}`);
  }
  assert.ok(!handlers.has('list-databases'), 'unused channel removed');
});

test('bad arguments are rejected before touching the database', async () => {
  const cases = [
    ['get-document', 'admin', 'db', 'c', 'x'],
    ['update-document', 'source', '', 'c', 'x', {}],
    ['update-document', 'source', 'db', 'c', 'x', []],
    ['delete-document', 'source', 'db', 'c', ''],
    ['apply-field-changes', 'source', 'db', 'c', 'x', { unset: 'a' }],
    ['apply-field-changes', 'source', 'db', 'c', 'x', { expectMissing: [1] }],
    ['apply-field-changes', 'source', 'db', 'c', 'x', { set: [] }],
    ['sync-fields', 'source', 'target', 'a', 'b', 'c', 'x', []],
    ['copy-document', 'source', 'target', 'a', 'c', 'x', ''],
    ['cancel-op', ''],
    ['run-aggregate', 'source', 'db', 'c', { not: 'array' }],
    ['update-connection', 'a', '', 'mongodb://x'],
  ];
  for (const [channel, ...args] of cases) {
    const res = await call(channel, ...args);
    assert.ok(res && typeof res.error === 'string', `${channel} should fail`);
    assert.equal(res.channel, channel);
    assert.ok(!/Not connected/.test(res.error), `${channel} validated before the db call: ${res.error}`);
  }
});

test('errors from the db layer are returned, not thrown, and redact URIs', async () => {
  const res = await call('connect-single', 'mongodb://user:secret@127.0.0.1:1/?serverSelectionTimeoutMS=200&connectTimeoutMS=200');
  assert.ok(res.error);
  assert.ok(!res.error.includes('secret'));
});

test('calls while disconnected fail cleanly', async () => {
  const res = await call('execute-query', 'source', 'db', 'c', {});
  assert.match(res.error, /Not connected/);
  assert.deepEqual(await call('cancel-op', 'nothing-running'), { cancelled: false });
});
