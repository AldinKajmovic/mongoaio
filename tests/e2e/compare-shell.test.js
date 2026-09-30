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

const IMPORTS = `
  const base = location.href.replace(/index\\.html.*/, '');
  const load = (p) => import(base + p);
`;
const sleep = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;

test('compare view: compound _ids are editable and document data renders as text', async (t) => {
  if (!ready(t)) return;
  const HOSTILE = '<img src=x class=pwned>';
  const res = await app.evaluate(`${IMPORTS}
    const { state, elements } = await load('src/renderer/utils/state.js');
    const view = await load('src/renderer/components/document-view.js');
    const crud = await load('src/renderer/components/document-crud.js');
    const a = window.api; const out = {};
    const REF = '65f0000000000000000000dd';
    await a.connect(${JSON.stringify(mongo.uri)}, ${JSON.stringify(mongo.uri)});
    for (const db of ['e2e_cs', 'e2e_ct']) await a.dropDatabase('source', db);
    const compound = { org: { $oid: REF }, n: 1 };
    await a.insertDocument('source', 'e2e_cs', 'k', { _id: compound, v: 1, [${JSON.stringify(HOSTILE)}]: 'x' });
    await a.insertDocument('target', 'e2e_ct', 'k', { _id: compound, v: 2 });
    await a.insertDocument('source', 'e2e_cs', 'k', { _id: ${JSON.stringify(HOSTILE)}, v: 3 });

    Object.assign(state, { currentSourceDb: 'e2e_cs', currentTargetDb: 'e2e_ct', currentColl: 'k', activeDocTab: 'different', currentPage: 1, fieldSearchQuery: '' });
    await view.loadDocuments('e2e_cs', 'e2e_ct', 'k');
    out.header = elements.docContent.querySelector('.doc-id')?.textContent;
    out.hostileFieldShown = [...elements.docContent.querySelectorAll('.diff-field-name')].some(n => n.textContent.includes(${JSON.stringify(HOSTILE)}));

    crud.startEditField('source', '0', 'v');
    document.getElementById('edit-source-0-v').value = '5';
    elements.docContent.querySelector('.save-field-btn').click();
    ${sleep(600)}
    out.saved = (await a.getDocument('source', 'e2e_cs', 'k', { org: { $oid: REF }, n: 1 })).document.v;

    state.activeDocTab = 'only-source';
    await view.loadDocuments('e2e_cs', 'e2e_ct', 'k');
    out.onlyHeader = elements.docContent.querySelector('.doc-id')?.textContent;
    out.injected = !!document.querySelector('img.pwned');
    for (const db of ['e2e_cs', 'e2e_ct']) await a.dropDatabase('source', db);
    return out;`);
  assert.equal(res.header, '_id: {"org":"65f0000000000000000000dd","n":1}');
  assert.ok(res.hostileFieldShown, 'hostile field name shown as text');
  assert.equal(res.saved, 5, 'edit reached the document with a compound _id');
  assert.equal(res.onlyHeader, `_id: ${HOSTILE}`);
  assert.equal(res.injected, false, 'no markup injected from document data');
});

test('shell: Cancel stops a running script and says so', async (t) => {
  if (!ready(t)) return;
  const res = await app.evaluate(`${IMPORTS}
    const { state, elements } = await load('src/renderer/utils/state.js');
    const a = window.api; const out = {};
    await a.connectSingle(${JSON.stringify(mongo.uri)});
    await a.dropDatabase('source', 'e2e_sh');
    Object.assign(state.editor, { side: 'source', db: 'e2e_sh', coll: 'loop' });
    const box = elements.editorShellTextarea;
    box.value = 'for (;;) { await db.loop.insertOne({ at: new Date() }); }';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ${sleep(400)}
    const cancel = document.getElementById('loading-cancel');
    out.cancelVisible = getComputedStyle(cancel).display !== 'none';
    cancel.click();
    ${sleep(400)}
    out.overlayHidden = getComputedStyle(document.getElementById('loading-overlay')).display === 'none';
    out.result = elements.editorShellResults.querySelector('.shell-result-item')?.textContent || '';
    const before = (await a.shellEval('source', 'e2e_sh', 'db.loop.countDocuments({})')).result;
    ${sleep(300)}
    out.stopped = before === (await a.shellEval('source', 'e2e_sh', 'db.loop.countDocuments({})')).result;
    await a.dropDatabase('source', 'e2e_sh');
    return out;`);
  assert.ok(res.cancelVisible, 'shell run shows a Cancel button');
  assert.ok(res.overlayHidden);
  assert.match(res.result, /Cancelled/);
  assert.ok(res.stopped, 'script stopped writing after cancel');
});

test('no renderer errors were logged during the run', (t) => {
  if (!ready(t)) return;
  assert.deepEqual(app.problems, []);
});
