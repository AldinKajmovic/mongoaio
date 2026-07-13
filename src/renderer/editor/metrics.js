import { state, elements } from '../utils/state.js';
import { toast } from '../utils/ui.js';
import { OPS_SERIES, RW_SERIES, NET_SERIES, MEM_SERIES, buildDom } from './metrics-dom.js';
import { MAX_POINTS, fmtBytes, fmtMemMB, fmtNum, setText, drawChart, updateLegend } from './metrics-charts.js';
import { renderHottest, renderSlowest } from './metrics-lists.js';
import { activateView, getCurrentView } from './editor-views.js';

// ---------------------------------------------------------------------------
// Live performance dashboard. Polls window.api.serverMetrics() once a second,
// diffs successive snapshots to turn cumulative counters into per-second rates,
// and renders four sparkline charts + the hottest-collections / slowest-ops
// lists. Modelled on the realtime view in MongoDB Compass.
// ---------------------------------------------------------------------------

const POLL_MS = 1000;

let pollTimer = null;
let paused = false;
let built = false;
let prev = null;       // previous raw snapshot (for diffing cumulative counters)
let prevTime = 0;      // ms timestamp of the previous snapshot

// Per-series ring buffers of values to chart.
const history = {
  ops: {}, rw: {}, net: {}, mem: {},
};

function resetHistory() {
  prev = null;
  prevTime = 0;
  OPS_SERIES.forEach((s) => history.ops[s.key] = []);
  RW_SERIES.forEach((s) => history.rw[s.key] = []);
  NET_SERIES.forEach((s) => history.net[s.key] = []);
  MEM_SERIES.forEach((s) => history.mem[s.key] = []);
}

function push(buf, key, value) {
  const arr = buf[key];
  arr.push(value);
  if (arr.length > MAX_POINTS) arr.shift();
}

function togglePause() {
  paused = !paused;
  const btn = document.getElementById('btn-metrics-pause');
  if (btn) {
    btn.classList.toggle('metrics-paused', paused);
    const label = btn.querySelector('.metrics-pause-label');
    if (label) label.textContent = paused ? 'Resume' : 'Pause';
  }
}

// --- Snapshot processing ----------------------------------------------------

function process(snap, now) {
  const dtSec = prevTime ? Math.max((now - prevTime) / 1000, 0.001) : 1;

  // OPERATIONS — per-second rates from cumulative opcounters.
  const opsVals = {};
  OPS_SERIES.forEach((s) => {
    let rate = 0;
    if (prev && prev.opcounters) {
      rate = Math.max(0, ((snap.opcounters[s.key] || 0) - (prev.opcounters[s.key] || 0)) / dtSec);
    }
    push(history.ops, s.key, rate);
    opsVals[s.key] = fmtNum(rate);
  });

  // READ & WRITE — instantaneous gauges. Note: globalLock.activeClients was
  // removed in newer MongoDB, so these read 0 there (graceful — defaults below).
  const gl = snap.globalLock || {};
  const ac = gl.activeClients || {};
  const cq = gl.currentQueue || {};
  const rwRaw = { ar: ac.readers || 0, aw: ac.writers || 0, qr: cq.readers || 0, qw: cq.writers || 0 };
  const rwVals = {};
  RW_SERIES.forEach((s) => {
    push(history.rw, s.key, rwRaw[s.key]);
    rwVals[s.key] = fmtNum(rwRaw[s.key]);
  });

  // NETWORK — bytes are cumulative (rate); connections is a gauge.
  const net = snap.network || {};
  const conns = snap.connections || {};
  let inRate = 0;
  let outRate = 0;
  if (prev && prev.network) {
    inRate = Math.max(0, ((net.bytesIn || 0) - (prev.network.bytesIn || 0)) / dtSec);
    outRate = Math.max(0, ((net.bytesOut || 0) - (prev.network.bytesOut || 0)) / dtSec);
  }
  push(history.net, 'bytesIn', inRate);
  push(history.net, 'bytesOut', outRate);
  push(history.net, 'connections', conns.current || 0);
  const netVals = {
    bytesIn: fmtBytes(inRate),
    bytesOut: fmtBytes(outRate),
    connections: fmtNum(conns.current || 0),
  };

  // MEMORY — gauges in MB.
  const mem = snap.mem || {};
  push(history.mem, 'virtual', mem.virtual || 0);
  push(history.mem, 'resident', mem.resident || 0);
  const memVals = {
    virtual: fmtMemMB(mem.virtual || 0),
    resident: fmtMemMB(mem.resident || 0),
  };

  // Draw charts and update labels.
  const opsMax = drawChart('metrics-ops-chart', history.ops, OPS_SERIES);
  const rwMax = drawChart('metrics-rw-chart', history.rw, RW_SERIES);
  const netMax = drawChart('metrics-net-chart', history.net, NET_SERIES);
  const memMax = drawChart('metrics-mem-chart', history.mem, MEM_SERIES);

  setText('metrics-ops-max', `${fmtNum(opsMax)} ops`);
  setText('metrics-rw-max', `${fmtNum(rwMax)}`);
  setText('metrics-net-max', fmtBytes(netMax));
  setText('metrics-mem-max', fmtMemMB(memMax));

  updateLegend('metrics-ops-chart', opsVals);
  updateLegend('metrics-rw-chart', rwVals);
  updateLegend('metrics-net-chart', netVals);
  updateLegend('metrics-mem-chart', memVals);

  renderHottest(snap.top, prev && prev.top);
  renderSlowest(snap.currentOp);

  // Clock + host.
  const t = snap.localTime ? new Date(snap.localTime) : new Date();
  setText('metrics-clock', t.toLocaleTimeString());
  if (snap.host) setText('metrics-host', `${snap.host}${snap.version ? ' · v' + snap.version : ''}`);

  prev = snap;
  prevTime = now;
}

async function poll() {
  if (paused) return;
  const side = state.editor.side || 'source';
  try {
    const snap = await window.api.serverMetrics(side);
    if (!snap || snap.error) {
      // Stop hammering a disconnected/erroring server, but surface it once.
      stopMetricsPolling();
      toast(`Performance metrics unavailable: ${snap && snap.error ? snap.error : 'no data'}`, 'error');
      return;
    }
    process(snap, performance.now());
  } catch (err) {
    stopMetricsPolling();
    toast(`Performance metrics error: ${err.message}`, 'error');
  }
}

// --- Public API -------------------------------------------------------------

export function initMetricsView() {
  if (elements.btnEditorViewMetrics) {
    elements.btnEditorViewMetrics.addEventListener('click', () => showMetricsPanel());
  }
}

export function showMetricsPanel() {
  if (!built) built = buildDom(togglePause);

  // Single switch handles hiding siblings + nav active state.
  activateView('metrics');

  resetHistory();
  paused = false;
  const btn = document.getElementById('btn-metrics-pause');
  if (btn) {
    btn.classList.remove('metrics-paused');
    const label = btn.querySelector('.metrics-pause-label');
    if (label) label.textContent = 'Pause';
  }

  if (pollTimer) clearInterval(pollTimer);
  poll();
  pollTimer = setInterval(poll, POLL_MS);
}

/** Stop the polling loop (called when switching to another view). */
export function stopMetricsPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Stop polling and leave the metrics view (used if another flow needs to). */
export function hideMetricsPanel() {
  stopMetricsPolling();
  if (getCurrentView() === 'metrics') activateView('collections');
}
