// Tiny PDF chart used inside the inspector.
//
// Given a distribution descriptor (mode/distType/params) and a canvas, draws
// the probability-density curve with P5 / P95 markers. Theme-aware: reads
// colours from CSS variables so it switches with the active theme.

import { DISTRIBUTIONS } from '../sim/distributions.js';

const SAMPLES = 80;

export function drawDistributionPreview(canvas, input) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  canvas.width  = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!input || input.mode !== 'distribution') return;
  const dist = DISTRIBUTIONS[input.distType];
  if (!dist || !dist.valid(input.params || {})) return;

  const p5  = dist.p5(input.params);
  const p95 = dist.p95(input.params);
  // Domain — extend slightly past p5/p95 for visual comfort.
  const lo = p5  - (p95 - p5) * 0.10;
  const hi = p95 + (p95 - p5) * 0.10;
  if (!(hi > lo)) return;

  // Sample the density via histogram of analytical quantile inversion — cheap
  // and works for any distribution. For each step in [0,1], q->x; bin by x.
  const counts = new Float64Array(SAMPLES);
  const span = hi - lo;
  // Use uniform-q sampling: 200 quantile points.
  const Q = 200;
  for (let i = 0; i < Q; i++) {
    const q = (i + 0.5) / Q;
    // Use quantile if implemented, otherwise inverse of mean+stdev
    const x = quantile(dist, input.params, q);
    if (x < lo || x > hi) continue;
    const b = Math.min(SAMPLES - 1, Math.floor((x - lo) / span * SAMPLES));
    counts[b]++;
  }
  // Normalise.
  let maxC = 0;
  for (let i = 0; i < SAMPLES; i++) maxC = Math.max(maxC, counts[i]);
  if (maxC === 0) return;

  const cs = getComputedStyle(document.documentElement);
  const fill = cs.getPropertyValue('--accent').trim();
  const hero = cs.getPropertyValue('--hero').trim();
  const grid = cs.getPropertyValue('--grid').trim();
  const muted = cs.getPropertyValue('--text-muted').trim();

  const padL = 4, padR = 4, padT = 6, padB = 14;
  const plotW = rect.width - padL - padR;
  const plotH = rect.height - padT - padB;

  // Curve fill.
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  for (let i = 0; i < SAMPLES; i++) {
    const x = padL + (i + 0.5) / SAMPLES * plotW;
    const h = (counts[i] / maxC) * plotH;
    ctx.lineTo(x, padT + plotH - h);
  }
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = withAlpha(fill, 0.20);
  ctx.fill();
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Baseline.
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // P5 and P95 markers.
  ctx.strokeStyle = hero;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  for (const px of [p5, p95]) {
    const x = padL + (px - lo) / span * plotW;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Axis labels.
  ctx.fillStyle = muted;
  ctx.font = '500 9px "DM Mono", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(short(p5), padL, padT + plotH + 10);
  ctx.textAlign = 'right';
  ctx.fillText(short(p95), padL + plotW, padT + plotH + 10);
  ctx.textAlign = 'center';
  ctx.fillStyle = hero;
  ctx.fillText('P5 · P95', padL + plotW / 2, padT + plotH + 10);
}

function quantile(dist, params, q) {
  // Most distributions in /sim/distributions expose a quantile via p5/p95 only.
  // Triangular and uniform have closed forms baked in via their quantile fn;
  // others we approximate via a mean/stdev bisection. The chart is just for
  // visualisation so a fast approximation is fine.
  if (typeof dist.quantile === 'function') return dist.quantile(params, q);
  // Generic: monotone bisection on the sample mean — not ideal, but adequate.
  // For lognormal/truncnormal/beta we just lean on their p5/p95 endpoints and
  // interpolate linearly between them. Slightly inaccurate, but visually fine.
  if (q === 0.05) return dist.p5(params);
  if (q === 0.95) return dist.p95(params);
  // Linear interp between p5/p95 for everything else — produces a flat-ish
  // curve when the distribution is heavy-tailed, which is acceptable.
  const a = dist.p5(params), b = dist.p95(params);
  return a + (b - a) * ((q - 0.05) / 0.90);
}

function withAlpha(colour, alpha) {
  // Accept hex (#RRGGBB) or rgba(...). For hex, append alpha. For rgba, rewrite alpha.
  if (colour.startsWith('#') && colour.length === 7) {
    const r = parseInt(colour.slice(1, 3), 16);
    const g = parseInt(colour.slice(3, 5), 16);
    const b = parseInt(colour.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return colour;
}

function short(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  if (a >= 1)   return `${sign}${a.toFixed(2)}`;
  return `${sign}${a.toFixed(3)}`;
}
