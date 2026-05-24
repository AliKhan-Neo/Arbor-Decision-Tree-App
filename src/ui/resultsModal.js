// "Results" deep-dive modal.
//
// Triggered from a header button. Renders the full simulation result at large
// scale: percentiles table, summary stats, full-size histogram, full-size
// tornado, complete stability table, and an iteration-sample preview.

import { drawTornado, tornadoHeightFor } from './tornadoChart.js';

const fmt = (v, cur = '$') => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${cur}${(a / 1e9).toFixed(3)}B`;
  if (a >= 1e6) return `${sign}${cur}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${cur}${(a / 1e3).toFixed(2)}K`;
  return `${sign}${cur}${a.toFixed(0)}`;
};

const TPL = `
  <div class="modal-overlay results-modal" id="results-modal" role="dialog" aria-modal="true">
    <div class="modal results-modal-inner">
      <button class="modal-close" id="results-modal-close" aria-label="Close">×</button>
      <div class="modal-eyebrow">Simulation Results</div>
      <h2 class="results-title" id="results-title">—</h2>

      <div class="results-grid">

        <div class="results-block results-block-summary">
          <div class="results-h">Summary</div>
          <div class="kv">
            <div class="k">Mean</div>            <div class="v hero" id="r-mean">—</div>
            <div class="k">Median (P50)</div>    <div class="v" id="r-p50">—</div>
            <div class="k">Stdev</div>           <div class="v" id="r-stdev">—</div>
            <div class="k">VaR 5%</div>          <div class="v" id="r-var">—</div>
            <div class="k">Min · Max</div>       <div class="v" id="r-mnmx">—</div>
            <div class="k">Iterations</div>      <div class="v" id="r-iter">—</div>
            <div class="k">Seed</div>            <div class="v" id="r-seed">—</div>
          </div>
        </div>

        <div class="results-block results-block-percentiles">
          <div class="results-h">Percentiles</div>
          <div class="kv">
            <div class="k">P5</div>  <div class="v" id="r-p5">—</div>
            <div class="k">P10</div> <div class="v" id="r-p10">—</div>
            <div class="k">P25</div> <div class="v" id="r-p25">—</div>
            <div class="k">P50</div> <div class="v" id="r-p50b">—</div>
            <div class="k">P75</div> <div class="v" id="r-p75">—</div>
            <div class="k">P90</div> <div class="v" id="r-p90">—</div>
            <div class="k">P95</div> <div class="v" id="r-p95">—</div>
          </div>
        </div>

        <div class="results-block results-block-tornado">
          <div class="results-h">Tornado · One-at-a-time ±1σ around mean-state</div>
          <div class="tornado-canvas-wrap"><canvas id="r-tornado"></canvas></div>
        </div>

        <div class="results-block results-block-stability">
          <div class="results-h">Optimal-Path Stability</div>
          <div class="stab-table" id="r-stab">—</div>
        </div>

        <div class="results-block results-block-histogram">
          <div class="results-h">EV Distribution (10k iterations)</div>
          <div class="histogram-wrap"><canvas id="r-hist"></canvas></div>
        </div>

        <div class="results-block results-block-sample">
          <div class="results-h">Iteration Sample · first 20</div>
          <div class="sample-table" id="r-sample">—</div>
        </div>

      </div>
    </div>
  </div>
`;

export function createResultsModal() {
  const wrap = document.createElement('div');
  wrap.innerHTML = TPL;
  document.body.appendChild(wrap.firstElementChild);

  const overlay = document.getElementById('results-modal');
  document.getElementById('results-modal-close').addEventListener('click', hide);
  overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  function hide() { overlay.classList.remove('show'); }

  function show(result, tree) {
    if (!result) { alert('Run a simulation first to view full results.'); return; }
    const cur = tree?.meta?.currency || '$';
    document.getElementById('results-title').textContent = tree?.meta?.title || 'Simulation Results';

    // Summary
    document.getElementById('r-mean').textContent  = fmt(result.summary.mean, cur);
    document.getElementById('r-p50').textContent   = fmt(result.percentiles.p50, cur);
    document.getElementById('r-stdev').textContent = fmt(result.summary.stdev, cur);
    document.getElementById('r-var').textContent   = fmt(result.summary.var5, cur);
    document.getElementById('r-mnmx').textContent  = `${fmt(result.summary.min, cur)} · ${fmt(result.summary.max, cur)}`;
    document.getElementById('r-iter').textContent  = result.iterations.toLocaleString();
    document.getElementById('r-seed').textContent  = String(result.seed);

    // Percentiles
    document.getElementById('r-p5').textContent  = fmt(result.percentiles.p5,  cur);
    document.getElementById('r-p10').textContent = fmt(result.percentiles.p10, cur);
    document.getElementById('r-p25').textContent = fmt(result.percentiles.p25, cur);
    document.getElementById('r-p50b').textContent = fmt(result.percentiles.p50, cur);
    document.getElementById('r-p75').textContent = fmt(result.percentiles.p75, cur);
    document.getElementById('r-p90').textContent = fmt(result.percentiles.p90, cur);
    document.getElementById('r-p95').textContent = fmt(result.percentiles.p95, cur);

    // Stability — full table
    const stab = result.stability || [];
    document.getElementById('r-stab').innerHTML = stab.map(s => `
      <div class="stab-row">
        <span class="lbl" title="${esc(s.path)}">${esc(s.path)}</span>
        <span class="pct">${(s.pct * 100).toFixed(2)}%</span>
      </div>
    `).join('') || '<span class="results-empty">No paths recorded.</span>';

    // Sample — first 20 iterations of EV (unsorted)
    const sample = result.evsUnsorted ? Array.from(result.evsUnsorted.slice(0, 20)) : [];
    document.getElementById('r-sample').innerHTML = sample.map((v, i) => `
      <div class="sample-row">
        <span class="ix">#${i + 1}</span>
        <span class="ev">${fmt(v, cur)}</span>
      </div>
    `).join('') || '<span class="results-empty">No samples available.</span>';

    overlay.classList.add('show');

    // Charts — render after the modal is visible so canvases have non-zero size.
    requestAnimationFrame(() => {
      const torCanvas = document.getElementById('r-tornado');
      // Allow more drivers in the deep-dive — up to 14.
      drawTornado(torCanvas, result.tornado, { currency: cur, max: 14, labelCol: 220 });

      const histCanvas = document.getElementById('r-hist');
      drawFullHistogram(histCanvas, result.histogram, result.percentiles, cur);
    });
  }

  return { show, hide };
}

function drawFullHistogram(canvas, hist, percentiles, currency) {
  if (!canvas || !hist) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const cs = getComputedStyle(document.documentElement);
  const fill   = cs.getPropertyValue('--histogram-fill').trim();
  const grid   = cs.getPropertyValue('--grid').trim();
  const muted  = cs.getPropertyValue('--text-muted').trim();
  const accent = cs.getPropertyValue('--accent').trim();

  const counts = hist.counts;
  let maxC = 0;
  for (let i = 0; i < counts.length; i++) maxC = Math.max(maxC, counts[i]);
  if (maxC === 0) return;

  const padL = 36, padR = 16, padT = 12, padB = 28;
  const plotW = rect.width - padL - padR;
  const plotH = rect.height - padT - padB;
  const barW = plotW / counts.length;

  // Baseline
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // Bars
  ctx.fillStyle = fill;
  for (let i = 0; i < counts.length; i++) {
    const bh = (counts[i] / maxC) * plotH;
    ctx.fillRect(padL + i * barW + 0.5, padT + plotH - bh, Math.max(1, barW - 1), bh);
  }

  // P10 / P50 / P90 markers
  const span = hist.hi - hist.lo;
  if (span > 0) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.2;
    ctx.font = '600 10px "DM Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (const [q, label] of [[percentiles.p10, 'P10'], [percentiles.p50, 'P50'], [percentiles.p90, 'P90']]) {
      const x = padL + (q - hist.lo) / span * plotW;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillText(label, x, padT + plotH + 14);
    }
    ctx.setLineDash([]);
  }

  // Axis labels
  ctx.fillStyle = muted;
  ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(short(hist.lo, currency), padL, padT + plotH + 14);
  ctx.textAlign = 'right';
  ctx.fillText(short(hist.hi, currency), padL + plotW, padT + plotH + 14);
}

function short(v, cur = '$') {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(0)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
