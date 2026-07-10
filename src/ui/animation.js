// 4-phase pathway exploration animation.
//
// Phases:
//   1. Sweep       — a vertical beam crosses the tree left-to-right.
//   2. Exploration — every sampled iteration flows as a particle along its
//                    actual best path (root → terminal), landing with a
//                    terracotta flash. A live convergence card builds the
//                    EV histogram bar-by-bar with a running mean marker and
//                    iteration counter, scrubbed 0 → N over the phase.
//   3. Convergence — collapses onto the overall optimal best-EV path.
//   4. Reveal      — dashboard slides in (caller's responsibility).
//
// The Monte Carlo computes at full speed (~1s); the animation replays its
// recorded stream cinematically (~6s total). A Skip control aborts the
// choreography and jumps straight to results. prefers-reduced-motion skips
// the animation entirely.

const EXPLORE_MS  = 4300;   // phase-2 duration
const SWEEP_MS    = 480;
const CONVERGE_MS = 700;
const MAX_PARTICLES = 22;   // concurrent particles on screen
const PARTICLE_MS   = 850;  // one particle's root→terminal flight time
const CHART_BINS    = 36;

export function createAnimation(canvasWrap, mainCanvasCtl) {
  const overlay = document.createElement('div');
  overlay.className = 'anim-overlay';
  overlay.innerHTML = `
    <canvas></canvas>
    <div class="anim-stage-label"></div>
    <button class="anim-skip" type="button">Skip ▸</button>`;
  canvasWrap.appendChild(overlay);
  const canvas  = overlay.querySelector('canvas');
  const label   = overlay.querySelector('.anim-stage-label');
  const skipBtn = overlay.querySelector('.anim-skip');
  const ctx = canvas.getContext('2d');

  let aborted = false;
  skipBtn.addEventListener('click', () => { aborted = true; });

  function resize() {
    const r = canvasWrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function clearOverlay() {
    const r = canvasWrap.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
  }

  function setLabel(text) {
    label.textContent = text;
    label.classList.toggle('show', !!text);
  }

  // Run all phases.
  // opts:
  //   getPathStream()  -> array of path-id arrays accumulated so far
  //   getEvSamples()   -> { evs: Float64Array|null, count } accumulated so far
  //   totalIterations  -> N for the scrub target
  //   currency         -> '$'
  //   getBestPath()    -> final optimal path-id array (available before phase 3)
  //   getNodeById(id)  -> node lookup
  //   awaitSimulation  -> Promise that resolves when MC finishes
  async function play(opts) {
    resize();
    if (!mainCanvasCtl.getTree()) return;
    aborted = false;

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await opts.awaitSimulation;
      return;
    }

    skipBtn.classList.add('show');

    // Phase 1
    setLabel('Exploring possibilities');
    await sweep(ctx, canvasWrap.getBoundingClientRect(), () => aborted);

    // Phase 2 — cinematic replay of the iteration stream
    if (!aborted) {
      setLabel(`Simulating ${Number(opts.totalIterations || 0).toLocaleString()} futures`);
      await exploreParticles(ctx, canvasWrap.getBoundingClientRect(), opts,
                             mainCanvasCtl, () => aborted);
    }

    // The sim is faster than the choreography, but never assume.
    await opts.awaitSimulation;

    // Phase 3
    if (!aborted) {
      setLabel('Converging on optimal path');
      await converge(ctx, canvasWrap.getBoundingClientRect(),
                     opts.getBestPath(), opts.getNodeById, mainCanvasCtl, () => aborted);
    }

    skipBtn.classList.remove('show');
    setLabel('');
    clearOverlay();
  }

  return { play, clear: clearOverlay, resize };
}

const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function cssPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = name => cs.getPropertyValue(name).trim();
  return {
    accent: v('--accent'), hero: v('--hero'), text: v('--text'),
    textMuted: v('--text-muted'), panel: v('--panel'),
    line: v('--line-strong'), bg: v('--bg')
  };
}

function fmtShort(v, cur = '$') {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(0)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
}

async function sweep(ctx, rect, isAborted) {
  const { accent } = cssPalette();
  const t0 = performance.now();
  await new Promise(resolve => {
    function frame(t) {
      if (isAborted()) { resolve(); return; }
      const p = Math.min(1, (t - t0) / SWEEP_MS);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const x = p * rect.width;
      const grad = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, accent);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x - 80, 0, 160, rect.height);
      ctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  ctx.clearRect(0, 0, rect.width, rect.height);
}

// Phase 2 — particles + live convergence chart.
async function exploreParticles(ctx, rect, opts, ctl, isAborted) {
  const pal = cssPalette();
  const total = opts.totalIterations || 10000;
  const cur = opts.currency || '$';
  const elbow = ctl.getTree()?.meta?.connectorStyle === 'elbow';

  // Live-chart state — bins established from the first available samples.
  let lo = null, hi = null, span = 0;
  const counts = new Uint32Array(CHART_BINS);
  let binned = 0;         // evs consumed into bins so far
  let runningSum = 0;
  let maxCount = 1;

  // Particle state.
  const particles = [];
  let streamCursor = 0;
  let spawnCarry = 0;
  // Sample the stream so ~110 particles cover the whole run.
  const stride = Math.max(1, Math.floor(total / 110));
  const flashes = [];

  const t0 = performance.now();

  await new Promise(resolve => {
    function frame(t) {
      if (isAborted()) { resolve(); return; }
      const p = Math.min(1, (t - t0) / EXPLORE_MS);
      const eased = easeInOut(p);
      const { evs, count } = opts.getEvSamples();
      const stream = opts.getPathStream();
      const k = Math.min(count, Math.floor(eased * total));

      // Establish the chart range once enough samples exist.
      if (lo === null && count >= 200 && evs) {
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < 200; i++) { const v = evs[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
        const pad = (mx - mn) * 0.25 || 1;
        lo = mn - pad; hi = mx + pad; span = hi - lo;
      }

      // Feed newly-scrubbed EVs into the bins.
      if (lo !== null && evs) {
        for (; binned < k; binned++) {
          const v = evs[binned];
          runningSum += v;
          const b = Math.max(0, Math.min(CHART_BINS - 1, Math.floor((v - lo) / span * CHART_BINS)));
          counts[b]++;
          if (counts[b] > maxCount) maxCount = counts[b];
        }
      }

      // Spawn particles pinned to real sampled paths.
      spawnCarry += (MAX_PARTICLES / PARTICLE_MS) * 16.7;
      while (spawnCarry >= 1 && particles.length < MAX_PARTICLES) {
        spawnCarry -= 1;
        const idx = streamCursor * stride;
        if (idx >= stream.length) break;
        particles.push({ path: stream[idx], born: t });
        streamCursor++;
      }

      // ── Draw ──
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        const life = (t - pt.born) / PARTICLE_MS;
        if (life >= 1) {
          const end = pt.path[pt.path.length - 1];
          const node = opts.getNodeById(end);
          if (node) flashes.push({ x: node.x, y: node.y, born: t });
          particles.splice(i, 1);
          continue;
        }
        // Faint full-path stroke under the newest few particles.
        if (i >= particles.length - 3) {
          ctx.strokeStyle = pal.accent;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.10;
          strokePath(ctx, pt.path, ctl, opts.getNodeById, elbow);
        }
        const pos = pointAlongPath(pt.path, life, ctl, opts.getNodeById, elbow);
        if (pos) {
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = pal.accent;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Terminal landing flashes (terracotta — the payoff moment).
      ctx.globalAlpha = 1;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        const a = 1 - (t - f.born) / 420;
        if (a <= 0) { flashes.splice(i, 1); continue; }
        const s = ctl.w2s(f.x, f.y);
        ctx.fillStyle = pal.hero;
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6 + (1 - a) * 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      drawChartCard(ctx, rect, pal, {
        counts, maxCount, lo, hi, span,
        k, total, cur,
        mean: binned > 0 ? runningSum / binned : null
      });

      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// Bottom-left live convergence card: histogram + running mean + counter.
function drawChartCard(ctx, rect, pal, s) {
  const W = 300, H = 138, X = 16, Y = rect.height - H - 16;
  const plotX = X + 14, plotW = W - 28;
  const plotY = Y + 46, plotH = H - 68;

  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = pal.panel;
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  roundRect(ctx, X, Y, W, H, 10);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = '600 9px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = pal.textMuted;
  ctx.fillText('LIVE CONVERGENCE', plotX, Y + 20);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.k.toLocaleString()} / ${s.total.toLocaleString()}`, X + W - 14, Y + 20);

  if (s.lo !== null && s.maxCount > 0) {
    ctx.fillStyle = pal.hero;
    const bw = plotW / s.counts.length;
    for (let i = 0; i < s.counts.length; i++) {
      if (!s.counts[i]) continue;
      const bh = (s.counts[i] / s.maxCount) * plotH;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(plotX + i * bw, plotY + plotH - bh, Math.max(1, bw - 1), bh);
    }
    ctx.globalAlpha = 1;

    if (s.mean !== null) {
      const mx = plotX + Math.max(0, Math.min(1, (s.mean - s.lo) / s.span)) * plotW;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, plotY - 4);
      ctx.lineTo(mx, plotY + plotH + 2);
      ctx.stroke();
      ctx.fillStyle = pal.accent;
      ctx.font = '600 10px "DM Mono", ui-monospace, monospace';
      ctx.textAlign = mx > X + W - 90 ? 'right' : 'left';
      ctx.fillText('EV ' + fmtShort(s.mean, s.cur), ctx.textAlign === 'left' ? mx + 5 : mx - 5, plotY + 6);
    }
  } else {
    ctx.fillStyle = pal.textMuted;
    ctx.font = 'italic 11px "Cormorant Garamond", serif';
    ctx.textAlign = 'center';
    ctx.fillText('sampling…', X + W / 2, plotY + plotH / 2);
  }

  // Baseline + range labels.
  ctx.strokeStyle = pal.line;
  ctx.beginPath();
  ctx.moveTo(plotX, plotY + plotH + 0.5);
  ctx.lineTo(plotX + plotW, plotY + plotH + 0.5);
  ctx.stroke();
  if (s.lo !== null) {
    ctx.fillStyle = pal.textMuted;
    ctx.font = '400 8.5px "DM Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(fmtShort(s.lo, s.cur), plotX, Y + H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(fmtShort(s.hi, s.cur), plotX + plotW, Y + H - 8);
  }
  ctx.restore();
}

async function converge(ctx, rect, bestPath, getNodeById, ctl, isAborted) {
  const { hero } = cssPalette();
  const elbow = ctl.getTree()?.meta?.connectorStyle === 'elbow';
  const t0 = performance.now();
  await new Promise(resolve => {
    function frame(t) {
      if (isAborted()) { resolve(); return; }
      const p = Math.min(1, (t - t0) / CONVERGE_MS);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = hero;
      ctx.lineWidth = 2 + 2.5 * p;
      ctx.globalAlpha = 0.4 + 0.6 * p;
      strokePath(ctx, bestPath, ctl, getNodeById, elbow);
      ctx.globalAlpha = 1;
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function strokePath(ctx, pathIds, ctl, getNodeById, elbow) {
  if (!pathIds || pathIds.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < pathIds.length - 1; i++) {
    const a = getNodeById(pathIds[i]);
    const b = getNodeById(pathIds[i + 1]);
    if (!a || !b) continue;
    const sa = ctl.w2s(a.x, a.y);
    const sb = ctl.w2s(b.x, b.y);
    const midX = (sa.x + sb.x) / 2;
    if (i === 0) ctx.moveTo(sa.x, sa.y);
    if (elbow) {
      ctx.lineTo(midX, sa.y);
      ctx.lineTo(midX, sb.y);
      ctx.lineTo(sb.x, sb.y);
    } else {
      ctx.bezierCurveTo(midX, sa.y, midX, sb.y, sb.x, sb.y);
    }
  }
  ctx.stroke();
}

// Position of a particle at life t (0..1) along a multi-segment path,
// honouring the active connector geometry.
function pointAlongPath(pathIds, t, ctl, getNodeById, elbow) {
  const segs = pathIds.length - 1;
  if (segs < 1) return null;
  const st = Math.min(0.9999, t) * segs;
  const i = Math.floor(st);
  const lt = st - i;
  const a = getNodeById(pathIds[i]);
  const b = getNodeById(pathIds[i + 1]);
  if (!a || !b) return null;
  const sa = ctl.w2s(a.x, a.y);
  const sb = ctl.w2s(b.x, b.y);
  const midX = (sa.x + sb.x) / 2;
  if (elbow) {
    // Three legs: H to midX, V to sb.y, H to sb.x — walked by leg fraction.
    if (lt < 1 / 3) {
      const u = lt * 3;
      return { x: sa.x + (midX - sa.x) * u, y: sa.y };
    }
    if (lt < 2 / 3) {
      const u = (lt - 1 / 3) * 3;
      return { x: midX, y: sa.y + (sb.y - sa.y) * u };
    }
    const u = (lt - 2 / 3) * 3;
    return { x: midX + (sb.x - midX) * u, y: sb.y };
  }
  const u = 1 - lt;
  const x1 = sa.x + (sb.x - sa.x) * 0.5, x2 = sb.x - (sb.x - sa.x) * 0.5;
  return {
    x: u * u * u * sa.x + 3 * u * u * lt * x1 + 3 * u * lt * lt * x2 + lt * lt * lt * sb.x,
    y: u * u * u * sa.y + 3 * u * u * lt * sa.y + 3 * u * lt * lt * sb.y + lt * lt * lt * sb.y
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
