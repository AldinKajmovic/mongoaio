const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startMongo } = require('../helpers/mongo');
const { launchApp, e2eUnavailable } = require('../helpers/electron');

const skipReason = e2eUnavailable();
let app;
let mongo;

before(async () => {
  if (skipReason) return;
  mongo = await startMongo();
  if (mongo) app = await launchApp();
});

after(async () => {
  if (app) await app.close();
  if (mongo) await mongo.stop();
});

function ready(t) {
  if (skipReason) { t.skip(skipReason); return false; }
  if (!mongo) { t.skip('mongod not found'); return false; }
  return true;
}

// Shared snippets evaluated inside the renderer.
const IMPORTS = `
  const base = location.href.replace(/index\\.html.*/, '');
  const load = (p) => import(base + p);
`;
const sleep = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;
const lastToast = `[...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).pop()`;

test('boots without renderer errors, with Node isolated and the API exposed', async (t) => {
  if (!ready(t)) return;
  const res = await app.evaluate(`return {
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
    nodeRequire: typeof require, nodeProcess: typeof process,
    api: Object.keys(window.api).length,
    listDatabases: typeof window.api.listDatabases,
  };`);
  assert.match(res.csp, /script-src 'self'/);
  assert.equal(res.nodeRequire, 'undefined');
  assert.equal(res.nodeProcess, 'undefined');
  assert.ok(res.api > 40);
  assert.equal(res.listDatabases, 'undefined');
  assert.deepEqual(app.problems, []);
});

test('the window cannot open popups or navigate away', async (t) => {
  if (!ready(t)) return;
  const res = await app.evaluate(`
    const popup = window.open('https://example.com');
    const a = document.createElement('a'); a.href = 'https://example.com'; document.body.appendChild(a); a.click(); a.remove();
    ${sleep(500)}
    return { popup: popup === null, href: location.href };`);
  assert.ok(res.popup);
  assert.match(res.href, /index\.html$/);
});

test('saved connections: add, edit in a popup (rename + URL), reject duplicates, remove', async (t) => {
  if (!ready(t)) return;
  const WEIRD = '<b>"x\'</b>';
  const WRAPPED = 'mongodb://beta-host:27017/\n  app';
  const LONG = 'mongodb+srv://aldin:p%40ss@afba-cluster.abcde.mongodb.net/afba?retryWrites=true&w=majority&appName=Cluster0';
  const res = await app.evaluate(`
    const $ = (s) => document.querySelector(s);
    const save = async (alias, url) => { $('#new-conn-alias').value = alias; $('#new-conn-url').value = url; $('#btn-save-conn').click(); ${sleep(300)} };
    const names = () => [...document.querySelectorAll('#connection-list .open-editor-btn')].map(b => b.textContent.trim());
    const visible = (s) => getComputedStyle($(s)).display !== 'none';
    const out = {};
    out.hiddenAtStart = !visible('#edit-conn-overlay');
    await save('alpha', ${JSON.stringify(LONG)});
    await save(${JSON.stringify(WEIRD)}, 'mongodb://weird');
    out.afterAdd = names();
    out.injected = !!document.querySelector('#connection-list b');

    document.querySelector('.conn-edit-btn[data-edit-alias="alpha"]').click();
    out.popupOpen = visible('#edit-conn-overlay');
    out.prefilled = [$('#edit-conn-alias').value, $('#edit-conn-url').value];
    out.summary = [...document.querySelectorAll('#edit-conn-summary dd')].map(d => d.textContent);
    out.passwordHidden = !$('#edit-conn-summary').textContent.includes('p%40ss');

    $('#edit-conn-alias').value = ${JSON.stringify(WEIRD)};
    $('#edit-conn-save').click();
    ${sleep(300)}
    out.dupError = visible('#edit-conn-error') ? $('#edit-conn-error').textContent : null;
    out.stillOpen = visible('#edit-conn-overlay');

    $('#edit-conn-alias').value = 'beta';
    $('#edit-conn-url').value = ${JSON.stringify(WRAPPED)};
    $('#edit-conn-save').click();
    ${sleep(300)}
    out.closedAfterSave = !visible('#edit-conn-overlay');
    out.afterEdit = names();
    out.betaUrl = (await window.api.getConnections()).beta;
    out.dropdown = [...document.querySelectorAll('#select-source-saved option')].map(o => o.value);

    document.querySelector('.conn-edit-btn[data-edit-alias="beta"]').click();
    $('#edit-conn-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.escapeCloses = !visible('#edit-conn-overlay');

    document.querySelector('.conn-remove-btn[data-remove-alias="beta"]').click();
    ${sleep(100)}
    $('#confirm-ok').click();
    ${sleep(300)}
    out.afterRemove = names();
    out.connections = await window.api.getConnections();
    return out;`);
  assert.ok(res.hiddenAtStart);
  assert.deepEqual(res.afterAdd, ['alpha', '<b>"x\'</b>']);
  assert.equal(res.injected, false, 'alias rendered as text');
  assert.ok(res.popupOpen);
  assert.deepEqual(res.prefilled, ['alpha', LONG], 'full connection string shown');
  assert.deepEqual(res.summary, ['mongodb+srv', 'aldin (password set)', 'afba-cluster.abcde.mongodb.net', 'afba', 'retryWrites=true\nw=majority\nappName=Cluster0']);
  assert.ok(res.passwordHidden);
  assert.match(res.dupError, /already exists/);
  assert.ok(res.stillOpen, 'popup stays open on error');
  assert.ok(res.closedAfterSave);
  assert.equal(res.betaUrl, 'mongodb://beta-host:27017/app', 'line breaks in a pasted URI are removed');
  assert.deepEqual(res.afterEdit, ['beta', '<b>"x\'</b>'], 'renamed in place');
  assert.ok(res.dropdown.includes('beta') && !res.dropdown.includes('alpha'));
  assert.ok(res.escapeCloses);
  assert.deepEqual(res.afterRemove, ['<b>"x\'</b>']);
  assert.deepEqual(res.connections, { '<b>"x\'</b>': 'mongodb://weird' });
});

test('query time limit, cancel button and friendly errors', async (t) => {
  if (!ready(t)) return;
  const res = await app.evaluate(`${IMPORTS}
    const { state } = await load('src/renderer/utils/state.js');
    const q = await load('src/renderer/editor/query.js');
    const a = window.api; const out = {};
    await a.connectSingle(${JSON.stringify(mongo.uri)});
    await a.dropDatabase('source', 'e2e_q');
    await a.insertDocument('source', 'e2e_q', 'c', { i: 1 });
    await a.insertDocument('source', 'e2e_q', 'c', { i: 2 });
    Object.assign(state.editor, { side: 'source', db: 'e2e_q', coll: 'c', dataView: 'tree' });
    const select = document.getElementById('editor-query-timeout-select');
    out.choices = select.options.length;
    select.value = '15000'; select.dispatchEvent(new Event('change'));
    out.saved = localStorage.getItem('query-timeout-ms');

    const filter = document.getElementById('editor-query-filter');
    filter.value = '{}';
    await q.runEditorQuery();
    out.items = q.currentRenderedItems.length;

    filter.value = JSON.stringify({ $expr: { $function: { body: 'function(){ sleep(2000); return true; }', args: [], lang: 'js' } } });
    const run = q.runEditorQuery();
    ${sleep(300)}
    const cancel = document.getElementById('loading-cancel');
    out.cancelVisible = getComputedStyle(cancel).display !== 'none';
    const t0 = Date.now();
    cancel.click();
    await run;
    out.cancelMs = Date.now() - t0;
    out.cancelToast = ${lastToast};
    out.overlayHidden = getComputedStyle(document.getElementById('loading-overlay')).display === 'none';
    out.cancelHiddenAfter = getComputedStyle(cancel).display === 'none';
    filter.value = '{}';
    await a.dropDatabase('source', 'e2e_q');
    return out;`);
  assert.equal(res.choices, 5);
  assert.equal(res.saved, '15000');
  assert.equal(res.items, 2);
  assert.ok(res.cancelVisible);
  assert.ok(res.cancelMs < 1500, `cancel took ${res.cancelMs}ms`);
  assert.equal(res.cancelToast, 'Query cancelled');
  assert.ok(res.overlayHidden && res.cancelHiddenAfter);
});

test('staged tree edits: typed apply, compound ids, undo, conflict, unload guard', async (t) => {
  if (!ready(t)) return;
  const res = await app.evaluate(`${IMPORTS}
    const { state } = await load('src/renderer/utils/state.js');
    const q = await load('src/renderer/editor/query.js');
    const stage = await load('src/renderer/editor/pending-stage.js');
    const commit = await load('src/renderer/editor/pending-commit.js');
    const undo = await load('src/renderer/editor/pending-undo.js');
    const edits = await load('src/renderer/editor/pending-edits.js');
    const a = window.api; const out = {};
    const HEX = '65f0000000000000000000aa', REF = '65f0000000000000000000bb';
    await a.connectSingle(${JSON.stringify(mongo.uri)});
    await a.dropDatabase('source', 'e2e_p');
    await a.insertDocument('source', 'e2e_p', 'c', { _id: { $oid: HEX }, when: { $date: '2024-01-01T00:00:00Z' }, n: 1, s: 'a' });
    await a.insertDocument('source', 'e2e_p', 'c', { _id: { k: 1, r: { $oid: REF } }, n: 10 });
    await a.insertDocument('source', 'e2e_p', 'c', { _id: { k: 2, r: { $oid: REF } }, n: 20 });
    Object.assign(state.editor, { side: 'source', db: 'e2e_p', coll: 'c', dataView: 'tree' });
    document.getElementById('editor-query-filter').value = '{}';
    await q.runEditorQuery();
    const row = (idx, path) => {
      const found = document.querySelector('#editor-tree-rows .editor-field-row[data-index="' + idx + '"][data-path="' + path + '"]');
      if (found) return found;
      const el = document.createElement('div');
      el.className = 'editor-field-row'; el.dataset.index = String(idx); el.dataset.path = path; el.dataset.key = path;
      el.innerHTML = '<span class="editor-field-value"></span><span class="editor-field-type"></span>';
      document.getElementById('editor-tree-rows').appendChild(el);
      return el;
    };
    const idx = (pred) => q.currentRenderedItems.findIndex(pred);
    const iO = idx(d => d._id === HEX), i1 = idx(d => d._id?.k === 1), i2 = idx(d => d._id?.k === 2);
    stage.stageValueEdit(row(iO, 'when'), iO, 'when', '2030-05-05T00:00:00.000Z');
    stage.stageValueEdit(row(iO, 's'), iO, 's', 'ObjectId("65f0000000000000000000cc")');
    stage.stageValueEdit(row(i1, 'n'), i1, 'n', '11');
    stage.stageValueEdit(row(i2, 'n'), i2, 'n', '21');
    out.staged = [edits.pendingDocCount(), edits.pendingCount()];
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    out.unloadVetoed = unload.defaultPrevented;

    await commit.applyPendingChanges();
    const get = async (id) => (await a.getDocument('source', 'e2e_p', 'c', id)).document;
    const d = await get(HEX);
    out.applied = { when: d.when, s: d.s, c1: (await get({ k: 1, r: { $oid: REF } })).n, c2: (await get({ k: 2, r: { $oid: REF } })).n };
    out.bar = document.querySelector('.editor-pending-label')?.textContent.trim();
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    out.unloadAllowed = !cleanUnload.defaultPrevented;

    await undo.undoLastBatch();
    const u = await get(HEX);
    out.undone = { when: u.when, s: u.s, c1: (await get({ k: 1, r: { $oid: REF } })).n };
    out.barHidden = document.getElementById('editor-pending-bar').classList.contains('u-hidden');

    await q.runEditorQuery();
    const j = idx(d => d._id === HEX);
    stage.stageValueEdit(row(j, 'n'), j, 'n', '99');
    await a.patchDocument('source', 'e2e_p', 'c', HEX, { n: 50 });
    await commit.applyPendingChanges();
    out.conflict = { pending: edits.pendingCount(), server: (await get(HEX)).n, toast: ${lastToast} };
    commit.discardPendingChanges(true);
    await a.dropDatabase('source', 'e2e_p');
    return out;`);
  assert.deepEqual(res.staged, [3, 4]);
  assert.ok(res.unloadVetoed);
  assert.deepEqual(res.applied, { when: { $date: '2030-05-05T00:00:00Z' }, s: { $oid: '65f0000000000000000000cc' }, c1: 11, c2: 21 });
  assert.match(res.bar, /4 changes saved in 3 documents/);
  assert.ok(res.unloadAllowed);
  assert.deepEqual(res.undone, { when: { $date: '2024-01-01T00:00:00Z' }, s: 'a', c1: 10 });
  assert.ok(res.barHidden);
  assert.equal(res.conflict.pending, 1, 'conflicting edit stays staged');
  assert.equal(res.conflict.server, 50, 'server value not overwritten');
  assert.match(res.conflict.toast, /changed on the server/);
});

test('no renderer errors were logged during the run', (t) => {
  if (!ready(t)) return;
  assert.deepEqual(app.problems, []);
});
