// Bottom dashboard: EV summary | Histogram | Stability | Tornado.
//
// Phase 1: PDF view only. Phase 2 adds PDF/CDF tab toggle on the histogram.

import { drawTornado } from './tornadoChart.js';

const fmt = (v, cur = '$') => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(1)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
};

const PANELS_HTML = `
  <div class="dash-panel" id="dash-summary">
    <div class="dash-h">Expected Value</div>
    <div class="summary-grid" id="dash-summary-grid">
      <div class="sum-cell hero"><div class="l">Mean</div><div class="v">—</div></div>
      <div class="sum-cell"><div class="l">P50</div><div class="v">—</div></div>
      <div class="sum-cell"><div class="l">Stdev</div><div class="v">—</div></div>
      <div class="sum-cell"><div class="l">VaR 5%</div><div class="v">—</div></div>
      <div class="sum-cell"><div class="l">P10</div><div class="v">—</div></div>
      <div class="sum-cell"><div class="l">P90</div><div class="v">—</div></div>
    </div>
  </div>
  <div class="dash-panel" id="dash-hist">
    <div class="dash-h-row">
      <div class="dash-h">EV Distribution</div>
      <div class="dash-tabs" role="tablist">
        <button class="dash-tab on" data-tab="pdf"  type="button">PDF</button>
        <button class="dash-tab"     data-tab="cdf"  type="button">CDF</button>
      </div>
    </div>
    <div class="histogram-wrap">
      <canvas id="dash-hist-canvas"></canvas>
      <div class="hist-readout" id="dash-hist-readout"></div>
    </div>
  </div>
  <div class="dash-panel" id="dash-stab">
    <div class="dash-h">Optimal-Path Stability</div>
    <div id="dash-stab-list"></div>
  </div>
  <div class="dash-panel" id="dash-tor">
    <div class="dash-h">Tornado · Drivers</div>
    <div class="tornado-canvas-wrap"><canvas id="dash-tor-canvas"></canvas></div>
  </div>
`;

export function createDashboard(container) {
  // Insert panels WITHOUT wiping the existing children (rail toggle + handle
  // are already in the HTML and panels.js owns them).
  container.insertAdjacentHTML('beforeend', PANELS_HTML);

  // PDF | CDF tab state for the histogram panel.
  let histView = 'pdf';
  let lastHistResult = null;
  let lastHistCurrency = '$';

  container.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.dash-tab').forEach(b => b.classList.toggle('on', b === btn));
      histView = btn.dataset.tab;
      if (lastHistResult) drawHistView();
    });
  });

  // Hover-readout for the histogram canvas (works in both PDF and CDF views).
  const histCanvas = container.querySelector('#dash-hist-canvas');
  const histReadout = container.querySelector('#dash-hist-readout');
  histCanvas.addEventListener('mousemove', e => {
    if (!lastHistResult) return;
    const rect = histCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padL = 8, padR = 8;
    const plotW = rect.width - padL - padR;
    const t = (x - padL) / plotW;
    if (t < 0 || t > 1) { histReadout.classList.remove('show'); return; }
    const hist = lastHistResult.histogram;
    const val = hist.lo + t * (hist.hi - hist.lo);
    const cdf = empiricalCdf(lastHistResult.evs, val);
    histReadout.textContent = `P(EV ≤ ${shortFmt(val, lastHistCurrency)}) = ${(cdf * 100).toFixed(1)}%`;
    histReadout.style.left = Math.min(rect.width - 180, Math.max(4, x + 12)) + 'px';
    histReadout.classList.add('show');
  });
  histCanvas.addEventListener('mouseleave', () => histReadout.classList.remove('show'));

  function drawHistView() {
    if (!lastHistResult) return;
    if (histView === 'cdf') {
      drawCdf(histCanvas, lastHistResult, lastHistCurrency);
    } else {
      drawHistogram(histCanvas, lastHistResult.histogram, lastHistResult.percentiles, lastHistCurrency);
    }
  }

  function render(result, currency) {
    if (!result) return;
    const cur = currency || '$';
    const grid = container.querySelector('#dash-summary-grid');
    const cells = grid.querySelectorAll('.sum-cell .v');
    cells[0].textContent = fmt(result.summary.mean, cur);
    cells[1].textContent = fmt(result.percentiles.p50, cur);
    cells[2].textContent = fmt(result.summary.stdev, cur);
    cells[3].textContent = fmt(result.summary.var5, cur);
    cells[4].textContent = fmt(result.percentiles.p10, cur);
    cells[5].textContent = fmt(result.percentiles.p90, cur);

    lastHistResult = result;
    lastHistCurrency = cur;
    drawHistView();
    renderStability(container.querySelector('#dash-stab-list'), result.stability);
    drawTornado(container.querySelector('#dash-tor-canvas'), result.tornado, { currency: cur, max: 6, labelCol: 130 });
  }

  function clear() {
    const grid = container.querySelector('#dash-summary-grid');
    grid.querySelectorAll('.sum-cell .v').forEach(c => (c.textContent = '—'));
    container.querySelector('#dash-stab-list').innerHTML = '';
    const tc = container.querySelector('#dash-tor-canvas');
    if (tc) {
      const ctx = tc.getContext('2d');
      ctx.clearRect(0, 0, tc.width, tc.height);
    }
    const c = container.querySelector('#dash-hist-canvas');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  }

  return { render, clear };
}

function drawHistogram(canvas, hist, percentiles, currency) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const cs = getComputedStyle(document.documentElement);
  const fill = cs.getPropertyValue('--histogram-fill').trim();
  const grid = cs.getPropertyValue('--grid').trim();
  const text = cs.getPropertyValue('--text-muted').trim();
  const accent = cs.getPropertyValue('--accent').trim();

  if (!hist || !hist.counts || hist.counts.length === 0) return;
  const counts = hist.counts;
  const maxCount = counts.reduce((a, b) => Math.max(a, b), 0) || 1;

  const padL = 8, padR = 8, padT = 8, padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const barW = plotW / counts.length;

  // baseline
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  for (let i = 0; i < counts.length; i++) {
    const bh = (counts[i] / maxCount) * plotH;
    ctx.fillStyle = fill;
    ctx.fillRect(padL + i * barW + 0.5, padT + plotH - bh, Math.max(1, barW - 1), bh);
  }

  // P50 marker
  const span = hist.hi - hist.lo;
  if (span > 0) {
    const x = padL + ((percentiles.p50 - hist.lo) / span) * plotW;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.font = '500 9px "DM Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('P50', x, padT + plotH + 12);
  }

  // axis labels
  ctx.fillStyle = text;
  ctx.font = '500 9px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(fmt(hist.lo, currency), padL, padT + plotH + 12);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(hist.hi, currency), padL + plotW, padT + plotH + 12);
}

function renderStability(el, stability) {
  if (!stability || !stability.length) { el.innerHTML = ''; return; }
  const top = stability.slice(0, 6);
  el.innerHTML = top.map(s => `
    <div class="stab-row">
      <span class="lbl" title="${escAttr(s.path)}">${escText(s.path)}</span>
      <span class="pct">${(s.pct * 100).toFixed(1)}%</span>
    </div>
  `).join('');
}

function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
function escText(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

// Empirical CDF: fraction of (sorted) evs ≤ x.
function empiricalCdf(sortedEvs, x) {
  if (!sortedEvs || sortedEvs.length === 0) return 0;
  // Binary search for first index where sortedEvs[i] > x.
  let lo = 0, hi = sortedEvs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedEvs[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedEvs.length;
}

function shortFmt(v, cur = '$') {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v); const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(0)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
}

function drawCdf(canvas, result, currency) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const cs = getComputedStyle(document.documentElement);
  const hero  = cs.getPropertyValue('--histogram-fill').trim();
  const grid  = cs.getPropertyValue('--grid').trim();
  const text  = cs.getPropertyValue('--text-muted').trim();
  const accent = cs.getPropertyValue('--accent').trim();

  const sorted = result.evs;
  if (!sorted || !sorted.length) return;
  const hist = result.histogram;
  const padL = 8, padR = 8, padT = 8, padB = 22;
  const plotW = rect.width - padL - padR;
  const plotH = rect.height - padT - padB;

  // CDF samples — uniform x-grid over hist domain.
  const N = 120;
  const span = hist.hi - hist.lo;
  const pts = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const x = hist.lo + (i / N) * span;
    const y = empiricalCdf(sorted, x);
    pts[i] = { x, y };
  }

  // Filled curve under CDF.
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  for (const p of pts) {
    const sx = padL + ((p.x - hist.lo) / span) * plotW;
    const sy = padT + plotH - p.y * plotH;
    ctx.lineTo(sx, sy);
  }
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = withAlpha(hero, 0.18);
  ctx.fill();
  // Line on top.
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const sx = padL + ((p.x - hist.lo) / span) * plotW;
    const sy = padT + plotH - p.y * plotH;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = hero;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Baseline + horizontal grid lines at 10/50/90%.
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  for (const q of [0.1, 0.5, 0.9]) {
    const y = padT + plotH - q * plotH;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // P10 / P50 / P90 vertical callouts.
  ctx.font = '500 9px "DM Mono", ui-monospace, monospace';
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  for (const [val, label] of [
    [result.percentiles.p10, 'P10'],
    [result.percentiles.p50, 'P50'],
    [result.percentiles.p90, 'P90']
  ]) {
    if (val < hist.lo || val > hist.hi) continue;
    const sx = padL + ((val - hist.lo) / span) * plotW;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.moveTo(sx, padT);
    ctx.lineTo(sx, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.fillText(label, sx, padT - 1);
  }

  // Axis labels.
  ctx.fillStyle = text;
  ctx.font = '500 9px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(shortFmt(hist.lo, currency), padL, padT + plotH + 12);
  ctx.textAlign = 'right';
  ctx.fillText(shortFmt(hist.hi, currency), padL + plotW, padT + plotH + 12);
}

function withAlpha(colour, alpha) {
  if (colour.startsWith('#') && colour.length === 7) {
    const r = parseInt(colour.slice(1, 3), 16);
    const g = parseInt(colour.slice(3, 5), 16);
    const b = parseInt(colour.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return colour;
}
