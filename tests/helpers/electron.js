const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '../..');

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Why the app can't be launched here, or null. */
function e2eUnavailable() {
  if (process.platform !== 'linux') return 'e2e suite isolates app data via XDG_CONFIG_HOME (Linux only)';
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return 'no display available';
  return null;
}

/** Launch the app with remote debugging and an isolated config dir. */
async function launchApp() {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mongoaio-e2e-'));
  const port = await freePort();
  const proc = spawn(require('electron'), [ROOT, '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`], {
    env: { ...process.env, XDG_CONFIG_HOME: configHome, ELECTRON_DISABLE_SANDBOX: '1', ELECTRON_RUN_AS_NODE: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });

  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(t => t.type === 'page' && t.url.endsWith('index.html'));
    } catch (_) { /* not up yet */ }
    if (!target) await new Promise(r => setTimeout(r, 200));
  }
  if (!target) throw new Error(`app did not start:\n${stderr}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const problems = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') problems.push(msg.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');

  /** Evaluate an async function body in the renderer and return its value. */
  const evaluate = async (body) => {
    const res = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'evaluation failed');
    return res.result?.result?.value;
  };

  // The page loads before renderer.js has built the UI; wait for it.
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`return !!document.getElementById('connection-list') && !!document.getElementById('editor-tree-rows');`)) break;
    await new Promise(r => setTimeout(r, 100));
  }

  const close = async () => {
    ws.close();
    proc.kill('SIGTERM');
    await new Promise(r => { proc.once('exit', r); setTimeout(r, 5000); });
    fs.rmSync(configHome, { recursive: true, force: true });
  };

  const screenshot = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');

  return { evaluate, problems, close, configHome, screenshot };
}

module.exports = { launchApp, e2eUnavailable };
