const { serializeValue } = require('./shell-serialize');

// ---------------------------------------------------------------------------
// Live cursors — kept alive between IPC calls so sequential paging streams the
// next batch (mongosh `it` semantics) instead of re-skipping from the top.
// ---------------------------------------------------------------------------

const liveCursors = new Map(); // id -> { cursor, pageSize }
let cursorSeq = 0;
/** Cap concurrent live cursors so a forgotten result can't leak them forever. */
const MAX_LIVE_CURSORS = 25;

/** Read up to `n` docs forward from a cursor; report whether more remain. */
async function readBatch(cursor, n) {
  const docs = [];
  while (docs.length < n && await cursor.hasNext()) docs.push(await cursor.next());
  const hasMore = await cursor.hasNext();
  return { docs, hasMore };
}

function storeCursor(cursor, pageSize) {
  const id = `cur-${++cursorSeq}`;
  liveCursors.set(id, { cursor, pageSize });
  while (liveCursors.size > MAX_LIVE_CURSORS) {
    closeShellCursor(liveCursors.keys().next().value); // evict oldest (insertion order)
  }
  return id;
}

/** Pull the next batch from a live cursor. Returns { expired: true } if it's gone. */
async function shellCursorNext(id) {
  const entry = liveCursors.get(id);
  if (!entry) return { expired: true };
  try {
    const { docs, hasMore } = await readBatch(entry.cursor, entry.pageSize);
    return { result: serializeValue(docs), isArray: true, hasMore };
  } catch (_) {
    await closeShellCursor(id);
    return { expired: true };
  }
}

/** Close and forget a live cursor (safe to call with an unknown/stale id). */
async function closeShellCursor(id) {
  const entry = liveCursors.get(id);
  if (!entry) return;
  liveCursors.delete(id);
  try { await entry.cursor.close(); } catch (_) { /* already closed/expired */ }
}

module.exports = {
  readBatch,
  storeCursor,
  shellCursorNext,
  closeShellCursor,
};
