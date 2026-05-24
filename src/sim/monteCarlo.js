// Monte Carlo aggregator.
//
// Runs N iterations of /sim/rollback.js, then aggregates:
//   - EV percentiles + summary stats (BRIEF §1(d))
//   - Optimal-path stability table (BRIEF §1(e))
//   - Tornado driver table (BRIEF §1(f))
//
// Phase 1 runs on the main thread in chunked setTimeout slices so the UI
// stays interactive. Phase 2 moves the loop into a Web Worker.

import { makeRng } from './rng.js';
import { rollbackOnce, rollbackMean, listDistributionInputs } from './rollback.js';
import { meanOfInput, stdevOfInput } from './distributions.js';

const CHUNK = 500;

// Run a synchronous Monte Carlo. Returns the full result object. For UI use,
// see runMonteCarloChunked() below which yields progress on a rAF loop.
export function runMonteCarlo(tree, opts = {}) {
  const seed = opts.seed ?? tree.meta?.seed ?? 42;
  const iterations = opts.iterations ?? tree.meta?.iterations ?? 10000;
  const rng = makeRng(seed);

  const evs = new Float64Array(iterations);
  const pathCounts = new Map();

  for (let i = 0; i < iterations; i++) {
    const { ev, optimalPath } = rollbackOnce(tree, rng);
    evs[i] = ev;
    const pathKey = optimalPath.join(' → ') || '(none)';
    pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
  }

  return aggregate(tree, evs, pathCounts, seed, iterations);
}

// Chunked runner. Invokes onProgress({iterations, total, sample}) at most every
// CHUNK iterations and resolves with the same result object.
//
// `sample` is the running array of EVs sampled so far — used by the exploration
// animation (BRIEF Phase 2 will move this into a worker stream).
export function runMonteCarloChunked(tree, opts = {}) {
  const seed = opts.seed ?? tree.meta?.seed ?? 42;
  const iterations = opts.iterations ?? tree.meta?.iterations ?? 10000;
  const onProgress = opts.onProgress || (() => {});
  const rng = makeRng(seed);
  const evs = new Float64Array(iterations);
  const pathCounts = new Map();

  return new Promise(resolve => {
    let i = 0;
    function step() {
      const limit = Math.min(i + CHUNK, iterations);
      for (; i < limit; i++) {
        const { ev, optimalPath } = rollbackOnce(tree, rng);
        evs[i] = ev;
        const pathKey = optimalPath.join(' → ') || '(none)';
        pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
      }
      onProgress({ iterations: i, total: iterations, evs });
      if (i < iterations) {
        // Use setTimeout(0) to yield to the rAF loop driving the animation.
        setTimeout(step, 0);
      } else {
        resolve(aggregate(tree, evs, pathCounts, seed, iterations));
      }
    }
    step();
  });
}

function aggregate(tree, evs, pathCounts, seed, iterations) {
  const sorted = Float64Array.from(evs).sort();

  // Summary stats.
  let mean = 0;
  for (let i = 0; i < sorted.length; i++) mean += sorted[i];
  mean /= sorted.length;
  let variance = 0;
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i] - mean;
    variance += d * d;
  }
  variance /= sorted.length;
  const stdev = Math.sqrt(variance);

  const percentiles = {
    p5:  percentile(sorted, 0.05),
    p10: percentile(sorted, 0.10),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.50),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.90),
    p95: percentile(sorted, 0.95)
  };

  const summary = {
    mean,
    stdev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    var5: percentiles.p5
  };

  // Histogram (50 bins between p1 and p99 to avoid extreme outliers eating the
  // viewport).
  const lo = percentile(sorted, 0.01);
  const hi = percentile(sorted, 0.99);
  const histogram = buildHistogram(sorted, lo, hi, 50);

  // Stability table.
  const stability = [...pathCounts.entries()]
    .map(([path, count]) => ({ path, count, pct: count / iterations }))
    .sort((a, b) => b.count - a.count);

  // Tornado.
  const tornado = buildTornado(tree);

  return {
    seed,
    iterations,
    evs: sorted,            // keep the sorted samples for CDF (Phase 2)
    evsUnsorted: evs,       // original order, for iteration-sample export
    summary,
    percentiles,
    histogram,
    stability,
    tornado
  };
}

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function buildHistogram(sorted, lo, hi, bins) {
  if (hi <= lo) return { bins, lo, hi, counts: new Uint32Array(bins) };
  const counts = new Uint32Array(bins);
  const span = hi - lo;
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    if (v < lo || v > hi) continue;
    const b = Math.min(bins - 1, Math.floor((v - lo) / span * bins));
    counts[b]++;
  }
  return { bins, lo, hi, counts };
}

// Tornado: ±1σ perturbation per distribution input, one-at-a-time, around
// the mean-state rollback. BRIEF §1(f).
function buildTornado(tree) {
  const baseline = rollbackMean(tree).ev;
  const inputs = listDistributionInputs(tree);
  const out = [];
  for (const inp of inputs) {
    const mu = meanOfInput(inp.input);
    const sd = stdevOfInput(inp.input);
    if (sd === 0) continue;
    const lo = new Map([[inp.key, mu - sd]]);
    const hi = new Map([[inp.key, mu + sd]]);
    const loEv = rollbackMean(tree, lo).ev;
    const hiEv = rollbackMean(tree, hi).ev;
    out.push({
      key: inp.key,
      label: inp.label,
      kind: inp.kind,
      baseline,
      lo: loEv,
      hi: hiEv,
      delta: Math.abs(hiEv - loEv)
    });
  }
  out.sort((a, b) => b.delta - a.delta);
  return { baseline, drivers: out };
}
