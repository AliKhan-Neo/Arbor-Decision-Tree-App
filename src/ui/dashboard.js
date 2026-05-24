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
    <div class="dash-h">EV Distribution</div>
    <div class="histogram-wrap"><canvas id="dash-hist-canvas"></canvas></div>
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

    drawHistogram(container.querySelector('#dash-hist-canvas'), result.histogram, result.percentiles, cur);
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
