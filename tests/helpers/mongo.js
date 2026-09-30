const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

// Uses MONGOAIO_TEST_URI if set, otherwise a throwaway `mongod` from PATH.

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const sock = net.connect(port, '127.0.0.1', () => { sock.end(); resolve(true); });
      sock.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`mongod did not start on port ${port}`);
}

function hasMongod() {
  return spawnSync('mongod', ['--version'], { stdio: 'ignore' }).status === 0;
}

/** @returns {Promise<{ uri: string, stop: () => Promise<void> } | null>} null when no MongoDB is available */
async function startMongo() {
  if (process.env.MONGOAIO_TEST_URI) {
    return { uri: process.env.MONGOAIO_TEST_URI, stop: async () => {} };
  }
  if (!hasMongod()) return null;

  const dbpath = fs.mkdtempSync(path.join(os.tmpdir(), 'mongoaio-test-'));
  const port = await freePort();
  const proc = spawn('mongod', ['--dbpath', dbpath, '--port', String(port), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore' });
  await waitForPort(port, 20000);

  return {
    uri: `mongodb://127.0.0.1:${port}`,
    stop: async () => {
      proc.kill('SIGTERM');
      await new Promise(r => proc.once('exit', r));
      fs.rmSync(dbpath, { recursive: true, force: true });
    },
  };
}

module.exports = { startMongo };
