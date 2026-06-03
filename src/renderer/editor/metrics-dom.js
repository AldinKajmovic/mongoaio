import { elements } from '../utils/state.js';

// ---------------------------------------------------------------------------
// Metrics dashboard — series definitions + static DOM scaffold.
// ---------------------------------------------------------------------------

// Series colors mirror the legend swatches in the design. `color` drives the
// canvas stroke (JS, not CSP-restricted); the swatch background comes from a
// CSS class (see `editor-metrics.css`) so we never emit an inline `style=`.
export const OPS_SERIES = [
  { key: 'insert', label: 'INSERT', color: '#10b981' },
  { key: 'query', label: 'QUERY', color: '#06b6d4' },
  { key: 'update', label: 'UPDATE', color: '#3b82f6' },
  { key: 'delete', label: 'DELETE', color: '#ef4444' },
  { key: 'command', label: 'COMMAND', color: '#a855f7' },
  { key: 'getmore', label: 'GETMORE', color: '#f59e0b' },
];
export const RW_SERIES = [
  { key: 'ar', label: 'AREADS', color: '#10b981' },
  { key: 'aw', label: 'AWRITES', color: '#3b82f6' },
  { key: 'qr', label: 'QREADS', color: '#06b6d4' },
  { key: 'qw', label: 'QWRITES', color: '#ef4444' },
];
export const NET_SERIES = [
  { key: 'bytesIn', label: 'BYTESIN', color: '#10b981' },
  { key: 'bytesOut', label: 'BYTESOUT', color: '#3b82f6' },
  { key: 'connections', label: 'CONNECTIONS', color: '#06b6d4' },
];
export const MEM_SERIES = [
  { key: 'virtual', label: 'VIRTUAL', color: '#10b981' },
  { key: 'resident', label: 'RESIDENT', color: '#3b82f6' },
];

// Map a series color to its CSS swatch class. Keeps swatch coloring in the
// stylesheet (CSP: style-src 'self', no 'unsafe-inline').
const SWATCH_CLASS = {
  '#10b981': 'metrics-swatch--green',
  '#06b6d4': 'metrics-swatch--cyan',
  '#3b82f6': 'metrics-swatch--blue',
  '#ef4444': 'metrics-swatch--red',
  '#a855f7': 'metrics-swatch--purple',
  '#f59e0b': 'metrics-swatch--amber',
};

function legendHtml(series) {
  return series.map((s) =>
    `<span class="metrics-legend-item">
       <span class="metrics-swatch ${SWATCH_CLASS[s.color] || ''}"></span>
       <span class="metrics-legend-label">${s.label}</span>
       <span class="metrics-legend-val" data-val="${s.key}">0</span>
     </span>`
  ).join('');
}

function chartCard(title, canvasId, series, maxId) {
  return `
    <section class="metrics-card">
      <h3 class="metrics-card-title">${title}</h3>
      <div class="metrics-chart-wrap">
        <span class="metrics-chart-max" id="${maxId}"></span>
        <canvas id="${canvasId}" class="metrics-canvas"></canvas>
      </div>
      <div class="metrics-legend">${legendHtml(series)}</div>
    </section>`;
}

/**
 * Render the static dashboard scaffold into the metrics view and wire the
 * pause button to `onPause`. Returns true when the root element was present.
 */
export function buildDom(onPause) {
  const root = elements.editorViewMetricsContent;
  if (!root) return false;
  root.innerHTML = `
    <div class="metrics-dashboard">
      <div class="metrics-toolbar">
        <button id="btn-metrics-pause" class="btn btn-ghost btn-sm metrics-pause">
          <span class="metrics-pause-icon">&#10074;&#10074;</span>
          <span class="metrics-pause-label">Pause</span>
        </button>
        <span id="metrics-clock" class="metrics-clock">--:--:--</span>
        <span id="metrics-host" class="metrics-host u-text-muted"></span>
      </div>
      <div class="metrics-grid">
        <div class="metrics-col">
          ${chartCard('OPERATIONS', 'metrics-ops-chart', OPS_SERIES, 'metrics-ops-max')}
          ${chartCard('READ &amp; WRITE', 'metrics-rw-chart', RW_SERIES, 'metrics-rw-max')}
          ${chartCard('NETWORK', 'metrics-net-chart', NET_SERIES, 'metrics-net-max')}
          ${chartCard('MEMORY', 'metrics-mem-chart', MEM_SERIES, 'metrics-mem-max')}
        </div>
        <div class="metrics-col">
          <section class="metrics-card metrics-card-grow">
            <h3 class="metrics-card-title">HOTTEST COLLECTIONS</h3>
            <div id="metrics-hottest" class="metrics-list"></div>
          </section>
          <section class="metrics-card metrics-card-grow">
            <h3 class="metrics-card-title">SLOWEST OPERATIONS</h3>
            <div id="metrics-slowest" class="metrics-list"></div>
          </section>
        </div>
      </div>
    </div>
  `;

  const pauseBtn = document.getElementById('btn-metrics-pause');
  if (pauseBtn) pauseBtn.addEventListener('click', onPause);
  return true;
}
