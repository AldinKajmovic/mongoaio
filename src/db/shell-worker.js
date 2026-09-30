/* =============================================
   DB — Shell Worker (worker thread entry)
   ============================================= */

// Runs the mongosh-style evaluator (shell.js) off the main thread with its own
// client, so shell-host.js can terminate it when a script never yields — a
// synchronous loop would otherwise freeze the whole main process. Messages:
//   { reqId, type: 'eval', dbName, code, options }  -> evaluateShell result
//   { reqId, type: 'next' | 'close', cursorId }     -> live cursor paging
//   { reqId, type: 'cancel', opId, reason }         -> cooperative cancel
//   { reqId, type: 'shutdown' }                     -> close the client and exit

const { parentPort, workerData } = require('worker_threads');
const { connect } = require('./connection');
const { evaluateShell, shellCursorNext, closeShellCursor } = require('./shell');
const { cancelOp } = require('./op-registry');

/** @type {Promise<import('mongodb').MongoClient> | null} */
let clientPromise = null;

/** The worker's client; a failed connect is retried on the next request. */
function client() {
  if (!clientPromise) {
    clientPromise = connect(workerData.url).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

async function shutdown() {
  if (clientPromise) await (await clientPromise.catch(() => null))?.close().catch(() => {});
  process.exit(0);
}

const HANDLERS = {
  eval: async (msg) => evaluateShell(await client(), msg.dbName, msg.code, msg.options),
  next: (msg) => shellCursorNext(msg.cursorId),
  close: (msg) => closeShellCursor(msg.cursorId),
  cancel: (msg) => cancelOp(msg.opId, new Error(msg.reason)),
};

parentPort.on('message', async (msg) => {
  if (msg.type === 'shutdown') return shutdown();
  try {
    const value = await HANDLERS[msg.type](msg);
    parentPort.postMessage({ reqId: msg.reqId, value });
  } catch (err) {
    parentPort.postMessage({ reqId: msg.reqId, error: { name: err.name, message: err.message } });
  }
});
