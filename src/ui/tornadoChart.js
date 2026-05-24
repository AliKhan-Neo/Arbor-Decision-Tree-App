// Canonical horizontal-bar tornado chart.
//
// Each driver becomes a horizontal bar centred on the baseline EV.
//   Low-EV side  : extends LEFT from baseline (drawn in --rust).
//   High-EV side : extends RIGHT from baseline (drawn in --positive).
// Bars are sorted top-to-bottom by |Δ| (largest impact at top).
//
// Renders into a canvas element. Theme-aware via CSS variables.

const ROW_H = 28;       // px per driver
const PAD_L = 10;       // left padding for label column
const PAD_R = 10;
const PAD_T = 18;       // baseline EV label
const PAD_B = 18;       // axis labels
const LABEL_COL = 200;  // px reserved for driver labels (configurable below)

const fmt = (v, cur = '$') => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${cur}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${cur}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${cur}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${cur}${a.toFixed(0)}`;
};

export function drawTornado(canvas, tornado, opts = {}) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  canvas.width  = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!tornado || !tornado.drivers || tornado.drivers.length === 0) return;

  const cs = getComputedStyle(document.documentElement);
  const text  = cs.getPropertyValue('--text').trim();
  const muted = cs.getPropertyValue('--text-muted').trim();
  const line  = cs.getPropertyValue('--line-strong').trim();
  const rust  = cs.getPropertyValue('--rust').trim();
  const pos   = cs.getPropertyValue('--positive').trim();
  const accent = cs.getPropertyValue('--accent').trim();
  const cur   = opts.currency || '$';

  const drivers = tornado.drivers.slice(0, opts.max || 12);
  const baseline = tornado.baseline;

  // Domain bounds.
  let minVal = baseline, maxVal = baseline;
  for (const d of drivers) {
    if (d.lo < minVal) minVal = d.lo;
    if (d.hi > maxVal) maxVal = d.hi;
  }
  if (maxVal === minVal) { maxVal = baseline + 1; minVal = baseline - 1; }

  const labelCol = opts.labelCol || LABEL_COL;
  const plotL = PAD_L + labelCol + 8;
  const plotR = rect.width - PAD_R;
  const plotW = plotR - plotL;
  const baselineX = plotL + (baseline - minVal) / (maxVal - minVal) * plotW;

  // Baseline vertical line + label.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(baselineX, PAD_T);
  ctx.lineTo(baselineX, PAD_T + drivers.length * ROW_H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = accent;
  ctx.font = '600 10px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`baseline · ${fmt(baseline, cur)}`, baselineX, PAD_T - 6);

  // Bars.
  ctx.font = '500 11px Inter, system-ui, sans-serif';
  for (let i = 0; i < drivers.length; i++) {
    const d = drivers[i];
    const y = PAD_T + i * ROW_H;
    const cy = y + ROW_H / 2;

    // Label column.
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillText(truncate(d.label, 26), PAD_L, cy);

    // Bars to the left (low side) and right (high side) of baseline.
    const xLo = plotL + (d.lo - minVal) / (maxVal - minVal) * plotW;
    const xHi = plotL + (d.hi - minVal) / (maxVal - minVal) * plotW;
    const barH = 12;
    const barY = cy - barH / 2;

    // Low side
    if (xLo < baselineX) {
      ctx.fillStyle = rust;
      ctx.fillRect(xLo, barY, baselineX - xLo, barH);
    }
    // High side
    if (xHi > baselineX) {
      ctx.fillStyle = pos;
      ctx.fillRect(baselineX, barY, xHi - baselineX, barH);
    }

    // Mono labels at bar ends with the actual EV values.
    ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
    ctx.fillStyle = muted;
    ctx.textBaseline = 'middle';
    if (xLo < baselineX) {
      ctx.textAlign = 'right';
      ctx.fillText(fmt(d.lo, cur), xLo - 4, cy);
    }
    if (xHi > baselineX) {
      ctx.textAlign = 'left';
      ctx.fillText(fmt(d.hi, cur), xHi + 4, cy);
    }
  }

  // X-axis labels (min, baseline, max).
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  const axisY = PAD_T + drivers.length * ROW_H + 2;
  ctx.beginPath();
  ctx.moveTo(plotL, axisY);
  ctx.lineTo(plotR, axisY);
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = '500 9px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(fmt(minVal, cur), plotL, axisY + 11);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(maxVal, cur), plotR, axisY + 11);
}

function truncate(s, n) {
  s = s || '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Return the natural height needed to render N drivers + axis + baseline labels.
// Useful for sizing canvas containers programmatically.
export function tornadoHeightFor(driverCount) {
  return PAD_T + driverCount * ROW_H + PAD_B + 8;
}
