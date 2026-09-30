/* =============================================
   DB — Shell Host (main side of the shell worker)
   ============================================= */

const path = require('path');
const { randomUUID } = require('crypto');
const { Worker } = require('worker_threads');
const { connectionUrl, getClient } = require('./connection');
const { killServerOps, resolveTimeout } = require('./op-registry');
const { SHELL_KILL_GRACE_MS } = require('./constants');

const WORKER_FILE = path.join(__dirname, 'shell-worker.js');
const ERROR_TYPES = { SyntaxError, TypeError, RangeError, ReferenceError };

/** @type {Map<string, { worker: Worker, pending: Map<number, { resolve: Function, reject: Function }> }>} */
const workers = new Map();
/** @type {Map<string, { side: string, stop: (reason: Error) => void }>} */
const runs = new Map();
let reqSeq = 0;

function rebuildError({ name, message }) {
  const err = new (ERROR_TYPES[name] || Error)(message);
  if (!ERROR_TYPES[name]) err.name = name;
  return err;
}

function dropWorker(side, entry, reason) {
  if (workers.get(side) === entry) workers.delete(side);
  for (const { reject } of entry.pending.values()) reject(reason);
  entry.pending.clear();
}

function spawn(side) {
  const worker = new Worker(WORKER_FILE, { workerData: { url: connectionUrl(side) } });
  worker.unref(); // an idle shell never keeps the process alive
  const entry = { worker, pending: new Map() };
  worker.on('message', ({ reqId, value, error }) => {
    const waiter = entry.pending.get(reqId);
    if (!waiter) return;
    entry.pending.delete(reqId);
    if (error) waiter.reject(rebuildError(error));
    else waiter.resolve(value);
  });
  worker.on('error', (err) => dropWorker(side, entry, err));
  worker.on('exit', () => dropWorker(side, entry, new Error('The shell was restarted; run the command again.')));
  workers.set(side, entry);
  return entry;
}

/** Send one request to a side's worker (starting it if needed). */
function request(side, message) {
  const entry = workers.get(side) || spawn(side);
  const reqId = ++reqSeq;
  return new Promise((resolve, reject) => {
    entry.pending.set(reqId, { resolve, reject });
    entry.worker.postMessage({ ...message, reqId });
  });
}

/** Terminate a side's worker; every request in flight on it rejects, and the next one starts afresh. */
async function terminate(side) {
  const entry = workers.get(side);
  if (!entry) return;
  workers.delete(side); // detach now, before 'exit' fires, so no new request lands on it
  await entry.worker.terminate();
}

/** Ask the worker to stop the run; terminate it if the script hasn't settled in time. */
function stopRun(opId, reason) {
  const run = runs.get(opId);
  if (!run) return false;
  request(run.side, { type: 'cancel', opId, reason: reason.message }).catch(() => { });
  setTimeout(() => {
    if (!runs.has(opId)) return;
    run.stop(reason);
    terminate(run.side).catch(() => { });
    Promise.resolve().then(() => killServerOps(getClient(run.side), `mongoaio:${opId}`)).catch(() => { });
  }, SHELL_KILL_GRACE_MS).unref();
  return true;
}

/**
 * Evaluate a mongosh-style script on `side` in its worker.
 * @param {'source'|'target'} side
 * @param {string} dbName
 * @param {string} code
 * @param {{ page?: number, pageSize?: number, opId?: string, maxTimeMS?: number }} [options]
 */
async function evaluateShell(side, dbName, code, options = {}) {
  const opId = typeof options.opId === 'string' && options.opId ? options.opId : `shell-${randomUUID()}`;
  const maxTimeMS = resolveTimeout(options.maxTimeMS);
  let stop;
  const stopped = new Promise((_, reject) => { stop = reject; });
  runs.set(opId, { side, stop });
  const limit = setTimeout(() => {
    stopRun(opId, new Error(`Shell script exceeded time limit (${Math.round(maxTimeMS / 1000)}s)`));
  }, maxTimeMS);
  try {
    const res = await Promise.race([
      request(side, { type: 'eval', dbName, code, options: { ...options, opId, maxTimeMS } }),
      stopped,
    ]);
    return res.cursorId ? { ...res, cursorId: `${side}:${res.cursorId}` } : res;
  } finally {
    clearTimeout(limit);
    runs.delete(opId);
  }
}

/** Cancel a running shell script; false when `opId` isn't one. */
async function cancelShell(opId) {
  return stopRun(opId, new Error('Query cancelled')) ? { cancelled: true } : { cancelled: false };
}

function splitCursorId(cursorId) {
  const at = cursorId.indexOf(':');
  return { side: cursorId.slice(0, at), id: cursorId.slice(at + 1) };
}

/** Next batch of a live cursor; a cursor whose worker is gone has expired. */
async function shellCursorNext(cursorId) {
  const { side, id } = splitCursorId(cursorId);
  if (!workers.has(side)) return { expired: true };
  return request(side, { type: 'next', cursorId: id }).catch(() => ({ expired: true }));
}

async function closeShellCursor(cursorId) {
  const { side, id } = splitCursorId(cursorId);
  if (workers.has(side)) await request(side, { type: 'close', cursorId: id }).catch(() => { });
}

/** Let a worker close its client and exit; terminate it if it doesn't within the grace period. */
function shutdown(entry) {
  return new Promise((resolve) => {
    const force = setTimeout(() => entry.worker.terminate().then(resolve, resolve), SHELL_KILL_GRACE_MS);
    entry.worker.once('exit', () => { clearTimeout(force); resolve(); });
    entry.worker.postMessage({ type: 'shutdown' });
  });
}

/** Stop every worker (connections changed or the app is quitting); they restart on demand. */
async function resetShell() {
  const entries = [...workers.values()];
  workers.clear();
  await Promise.all(entries.map(shutdown));
}

module.exports = { evaluateShell, cancelShell, shellCursorNext, closeShellCursor, resetShell };
