// @ts-check
/* =============================================
   DB — Cancellable Operations
   ============================================= */

const { QUERY_TIMEOUT_DEFAULT_MS, QUERY_TIMEOUT_MAX_MS } = require('./constants');

// Cancelling aborts the driver call and kills the server op found by its comment tag.

/** @type {Map<string, { controller: AbortController, client: import('mongodb').MongoClient, comment: string }>} */
const running = new Map();

const NOOP_OP = { signal: undefined, comment: undefined, end() {} };

/** Clamp a requested per-query time limit to the supported range. */
function resolveTimeout(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return QUERY_TIMEOUT_DEFAULT_MS;
  return Math.min(n, QUERY_TIMEOUT_MAX_MS);
}

/** Register an operation; spread { signal, comment } into driver options and call end() when done. */
function beginOp(opId, client) {
  if (typeof opId !== 'string' || !opId) return NOOP_OP;
  const controller = new AbortController();
  const comment = `mongoaio:${opId}`;
  running.set(opId, { controller, client, comment });
  return { signal: controller.signal, comment, end: () => running.delete(opId) };
}

/** Kill every server op tagged with `comment` (best effort — needs no special role for own ops). */
async function killServerOps(client, comment) {
  const admin = client.db('admin');
  const res = await admin.command({
    currentOp: 1,
    $ownOps: true,
    $or: [{ 'command.comment': comment }, { 'cursor.originatingCommand.comment': comment }],
  });
  await Promise.all((res.inprog || []).map(op =>
    admin.command({ killOp: 1, op: op.opid }).catch(() => {})));
  return (res.inprog || []).length;
}

/**
 * Cancel a running operation.
 * @param {string} opId
 * @param {Error} [reason] What the aborted call rejects with (default: a user cancel).
 */
async function cancelOp(opId, reason = new Error('Query cancelled')) {
  const op = running.get(opId);
  if (!op) return { cancelled: false };
  running.delete(opId);
  op.controller.abort(reason);
  let killed = 0;
  try { killed = await killServerOps(op.client, op.comment); } catch (_) { /* no privilege / not supported */ }
  return { cancelled: true, killed };
}

module.exports = { beginOp, cancelOp, resolveTimeout, killServerOps };
