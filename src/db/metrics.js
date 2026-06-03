const { getClient } = require('./connection');

// ---------------------------------------------------------------------------
// Server performance metrics — a single trimmed snapshot the renderer polls
// once per second to drive the live dashboard (operations, read/write,
// network, memory, hottest collections, slowest operations).
//
// The heavy lifting (rates, percentages) is done in the renderer by diffing
// successive snapshots; here we only collect and normalize the raw counters
// so the IPC payload stays small and JSON-safe.
// ---------------------------------------------------------------------------

/** Coerce BSON numerics (Long/Int32/Double) and plain values into a JS number. */
function num(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v.toNumber === 'function') {
    try { return v.toNumber(); } catch (_) { /* fall through */ }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapNum(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) out[k] = num(v);
  }
  return out;
}

/**
 * Collect a trimmed server-status snapshot for the given side ('source' /
 * 'target'). `top` and `currentOp` are best-effort: they require admin rights
 * and don't exist on every topology (e.g. `top` is unavailable on mongos), so
 * a failure there degrades gracefully to null rather than failing the call.
 */
async function getServerMetrics(side) {
  const client = getClient(side);
  const admin = client.db().admin();

  const ss = await admin.serverStatus();

  const snapshot = {
    ok: true,
    localTime: ss.localTime ? new Date(ss.localTime).toISOString() : null,
    host: ss.host || null,
    version: ss.version || null,
    uptime: num(ss.uptime),
    opcounters: mapNum(ss.opcounters),
    network: ss.network ? {
      bytesIn: num(ss.network.bytesIn),
      bytesOut: num(ss.network.bytesOut),
      numRequests: num(ss.network.numRequests),
    } : {},
    connections: ss.connections ? {
      current: num(ss.connections.current),
      available: num(ss.connections.available),
      totalCreated: num(ss.connections.totalCreated),
    } : {},
    mem: ss.mem ? {
      virtual: num(ss.mem.virtual),
      resident: num(ss.mem.resident),
    } : {},
    globalLock: {
      activeClients: mapNum(ss.globalLock && ss.globalLock.activeClients),
      currentQueue: mapNum(ss.globalLock && ss.globalLock.currentQueue),
    },
  };

  // Hottest collections — `top` returns cumulative per-namespace timings.
  try {
    const top = await admin.command({ top: 1 });
    const totals = top && top.totals ? top.totals : {};
    const out = {};
    for (const [ns, stats] of Object.entries(totals)) {
      if (ns === 'note' || !stats || typeof stats !== 'object') continue;
      out[ns] = {
        total: stats.total ? num(stats.total.time) : 0,
        readLock: stats.readLock ? num(stats.readLock.time) : 0,
        writeLock: stats.writeLock ? num(stats.writeLock.time) : 0,
      };
    }
    snapshot.top = out;
  } catch (_) {
    snapshot.top = null;
  }

  // Slowest / currently-running operations.
  try {
    const co = await admin.command({ currentOp: 1, active: true });
    const inprog = (co && co.inprog) ? co.inprog : [];
    snapshot.currentOp = inprog
      .filter((op) => op && op.op !== 'none')
      .map((op) => ({
        ns: op.ns || '',
        op: op.op || '',
        desc: op.desc || '',
        microsecs_running: num(op.microsecs_running),
        secs_running: num(op.secs_running),
        command: op.command ? Object.keys(op.command)[0] : '',
      }));
  } catch (_) {
    snapshot.currentOp = null;
  }

  return snapshot;
}

module.exports = {
  getServerMetrics,
};
