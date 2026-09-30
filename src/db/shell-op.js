// @ts-check
/* =============================================
   DB — Shell Time Limit & Cancellation
   ============================================= */

const { randomUUID } = require('crypto');
const { beginOp, cancelOp, resolveTimeout } = require('./op-registry');
const { SHELL_KILL_GRACE_MS } = require('./constants');

/** Collection method -> index of its options argument; reads also get maxTimeMS. */
const READ_OPTIONS_ARG = {
  find: 1, findOne: 1, aggregate: 1, countDocuments: 1, estimatedDocumentCount: 0,
  distinct: 2, findOneAndUpdate: 2, findOneAndReplace: 2, findOneAndDelete: 1,
};
const WRITE_OPTIONS_ARG = {
  insertOne: 1, insertMany: 1, updateOne: 2, updateMany: 2, replaceOne: 2,
  deleteOne: 1, deleteMany: 1, bulkWrite: 1, createIndex: 1, createIndexes: 1,
};
/** Methods returning a cursor, which honours an AbortSignal directly. */
const CURSOR_METHODS = new Set(['find', 'aggregate']);

function isPlainOptions(v) {
  return v === undefined || (v !== null && typeof v === 'object' && !Array.isArray(v));
}

/**
 * Merge the op's comment / maxTimeMS / signal into a driver call's options.
 * The user's own options win, so an explicit comment or maxTimeMS is kept.
 * @param {string} method
 * @param {any[]} args
 * @param {{ comment: string, maxTimeMS: number, signal: AbortSignal }} op
 */
function tagArgs(method, args, op) {
  const isRead = Object.hasOwn(READ_OPTIONS_ARG, method);
  const index = isRead ? READ_OPTIONS_ARG[method] : WRITE_OPTIONS_ARG[method];
  if (index === undefined || !isPlainOptions(args[index])) return args;

  const tagged = { comment: op.comment };
  if (isRead) tagged.maxTimeMS = op.maxTimeMS;
  if (CURSOR_METHODS.has(method)) tagged.signal = op.signal;

  const out = args.slice();
  while (out.length < index) out.push(undefined);
  out[index] = { ...tagged, ...(args[index] || {}) };
  return out;
}

/** Wrap a driver method so it refuses to run after an abort and carries the op's tags. */
function guardMethod(fn, target, method, op) {
  return (...args) => {
    op.signal.throwIfAborted();
    return fn.apply(target, tagArgs(method, args, op));
  };
}

/**
 * Register a shell evaluation as a cancellable operation.
 * @param {string|undefined} opId   Renderer-chosen id (cancel-op), or none.
 * @param {import('mongodb').MongoClient} client
 * @param {number} [maxTimeMS]      Requested limit; clamped like other queries.
 */
function beginShellOp(opId, client, maxTimeMS) {
  const id = typeof opId === 'string' && opId ? opId : `shell-${randomUUID()}`;
  const op = beginOp(id, client);
  return { id, comment: op.comment, signal: op.signal, end: op.end, maxTimeMS: resolveTimeout(maxTimeMS) };
}

/**
 * Run `work` until it settles, the op is cancelled, or its time limit passes —
 * whichever comes first. The op is always ended afterwards.
 * @template T
 * @param {ReturnType<typeof beginShellOp>} op
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function runShellOp(op, work) {
  const running = work();
  const aborted = new Promise((_, reject) => {
    op.signal.addEventListener('abort', () => reject(op.signal.reason), { once: true });
  });
  const timer = setTimeout(() => {
    const seconds = Math.round(op.maxTimeMS / 1000);
    cancelOp(op.id, new Error(`Shell script exceeded time limit (${seconds}s)`)).catch(() => { });
  }, op.maxTimeMS);
  try {
    return await Promise.race([running, aborted]);
  } catch (err) {
    // Report "stopped" only once the script has: a driver call already sent
    // (e.g. an insert) still completes, and the next one throws. Bounded, since
    // shell-host.js terminates the worker if the script never settles.
    if (op.signal.aborted) await settleWithin(running, SHELL_KILL_GRACE_MS / 2);
    throw err;
  } finally {
    clearTimeout(timer);
    op.end();
  }
}

/** Wait for `promise` to settle (either way), but no longer than `ms`. */
function settleWithin(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([promise.then(() => { }, () => { }), timeout]).finally(() => clearTimeout(timer));
}

module.exports = { beginShellOp, runShellOp, guardMethod, tagArgs };
