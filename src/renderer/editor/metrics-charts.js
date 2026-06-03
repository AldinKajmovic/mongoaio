// ---------------------------------------------------------------------------
// Metrics dashboard — canvas sparkline rendering + value formatting helpers.
// Pure presentation: no polling/state lives here.
// ---------------------------------------------------------------------------

export const MAX_POINTS = 60; // ~1 minute of history at 1s resolution

// --- Formatting helpers -----------------------------------------------------

export function fmtBytes(bytes) {
  if (!bytes || bytes < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function fmtMemMB(mb) {
  if (!mb) return '0 MB';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

export function fmtNum(n) {
  if (n >= 1000) return Math.round(n).toLocaleString();
  return Math.round(n).toString();
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// --- Canvas rendering -------------------------------------------------------

export function drawChart(canvasId, buf, series) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return 0;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return 0;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Baseline.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(w, h - 0.5);
  ctx.stroke();

  let max = 0;
  let len = 0;
  for (const s of series) {
    const arr = buf[s.key] || [];
    len = Math.max(len, arr.length);
    for (const v of arr) if (v > max) max = v;
  }
  if (max <= 0) max = 1;
  if (len < 2) return max;

  const stepX = w / (MAX_POINTS - 1);
  const padTop = h * 0.08;
  const usable = h - padTop;

  for (const s of series) {
    const arr = buf[s.key] || [];
    if (arr.length < 2) continue;
    // Right-align the series so the newest point sits at the right edge.
    const offset = MAX_POINTS - arr.length;
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    arr.forEach((v, i) => {
      const x = (offset + i) * stepX;
      const y = padTop + usable - (v / max) * usable;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  return max;
}

// Legend values live in the card following the canvas — walk up to the card.
export function updateLegend(canvasId, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const card = canvas.closest('.metrics-card');
  if (!card) return;
  for (const [key, val] of Object.entries(values)) {
    const el = card.querySelector(`[data-val="${key}"]`);
    if (el) el.textContent = val;
  }
}
