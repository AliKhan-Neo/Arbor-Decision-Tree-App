// Audit-ready Excel export.
//
// Generates a six-sheet workbook via SheetJS Community Edition (loaded as
// `window.XLSX` from a CDN <script> tag in app.html):
//
//   1. Cover            — IC-memo style title page with hero stats
//   2. Tree Structure   — flat table of every node/branch (the source of truth)
//   3. Iteration Sample — 10,001 rows: each iteration's sampled inputs + EV
//   4. Rollback Trace   — iteration 0 step-by-step rollback for audit reconciliation
//   5. Results          — percentiles, summary, stability, tornado tables
//   6. Visual Tree      — indented hierarchical text representation (Community
//                         Edition can't insert programmatic shapes; the
//                         indented layout reads cleanly for an audit reader)
//
// The Iteration Sample sheet needs per-iteration captured inputs, so we
// re-run the simulation with `recordSamples: true` rather than relying on
// `lastResult`. Determinism (same seed → byte-identical results) guarantees
// the re-run reconciles perfectly.

import { runMonteCarlo } from '../sim/monteCarlo.js';
import { rollbackMean, listDistributionInputs } from '../sim/rollback.js';
import { meanOfInput, DISTRIBUTIONS } from '../sim/distributions.js';
import { rootOf, childrenOf } from '../model/tree.js';
import { slugFile, triggerDownload } from './svgExport.js';

const fmt = (v, cur = '$') => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(1)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
};

export async function exportExcel(tree, opts = {}) {
  if (!window.XLSX) {
    alert('Excel library still loading — try again in a moment.');
    return;
  }
  const XLSX = window.XLSX;

  // Re-run with recordSamples so we have iteration-level data for Sheets 3+4.
  const result = runMonteCarlo(tree, {
    seed: tree.meta?.seed ?? 42,
    iterations: tree.meta?.iterations ?? 10000,
    recordSamples: true
  });

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildCoverSheet(XLSX, tree, result),         'Cover');
  XLSX.utils.book_append_sheet(wb, buildStructureSheet(XLSX, tree),              'Tree Structure');
  XLSX.utils.book_append_sheet(wb, buildIterationSampleSheet(XLSX, tree, result), 'Iteration Sample');
  XLSX.utils.book_append_sheet(wb, buildRollbackTraceSheet(XLSX, tree, result),   'Rollback Trace');
  XLSX.utils.book_append_sheet(wb, buildResultsSheet(XLSX, tree, result),         'Results');
  XLSX.utils.book_append_sheet(wb, buildVisualTreeSheet(XLSX, tree, result),      'Visual Tree');

  XLSX.writeFile(wb, slugFile(tree, 'xlsx'));
}

// ── 1. Cover ──────────────────────────────────────────────────────────────
function buildCoverSheet(XLSX, tree, result) {
  const cur = tree.meta?.currency || '$';
  const title = tree.meta?.title || 'Decision Analysis';
  const top = result.stability?.[0];
  const aoa = [
    ['ARBOR · DECISION INTELLIGENCE'],
    [],
    [title],
    [`Generated ${new Date().toLocaleString()}`],
    [],
    ['EXPECTED VALUE'],
    ['Mean',           result.summary.mean],
    ['Median (P50)',   result.percentiles.p50],
    ['Stdev',          result.summary.stdev],
    ['VaR(5%)',        result.summary.var5],
    ['P10',            result.percentiles.p10],
    ['P90',            result.percentiles.p90],
    ['Iterations',     result.iterations],
    ['Seed',           result.seed],
    ['Currency',       cur],
    [],
    ['OPTIMAL PATH'],
    ['Recommendation', top?.path || '(none)'],
    ['Stability',      top ? (top.pct) : 0],
    [],
    ['METHODOLOGY'],
    ['1', 'Probability distributions are sampled per iteration on chance-node branches and terminal payoffs only.'],
    ['2', 'Sibling probabilities normalise to 1 per-iteration. No pre-normalisation on the model.'],
    ['3', 'Expected value computed per iteration, then aggregated. Optimal decision can vary across iterations.'],
    [],
    ['Arbor is a decision-intelligence tool. Not financial advice.']
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 24 }, { wch: 70 }];
  // Format the stability cell as a percentage.
  if (ws['B19']) ws['B19'].z = '0.00%';
  // Currency-tag the hero numerics.
  for (const cell of ['B7', 'B8', 'B9', 'B10', 'B11', 'B12']) {
    if (ws[cell]) ws[cell].z = `"${cur}"#,##0`;
  }
  return ws;
}

// ── 2. Tree Structure ─────────────────────────────────────────────────────
function buildStructureSheet(XLSX, tree) {
  const rows = [['NodeID', 'ParentID', 'Type', 'Label', 'BranchLabel',
                 'ProbabilityMode', 'ProbabilityDistType', 'ProbabilityValue/Params',
                 'PayoffMode', 'PayoffDistType', 'PayoffValue/Params']];
  for (const n of tree.nodes) {
    rows.push([
      n.id,
      n.parentId || '',
      n.type,
      n.label,
      n.branchLabel || '',
      n.branchProb?.mode || '',
      n.branchProb?.distType || '',
      describeInput(n.branchProb),
      n.payoff?.mode || '',
      n.payoff?.distType || '',
      describeInput(n.payoff)
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 22 },
    { wch: 12 }, { wch: 14 }, { wch: 38 },
    { wch: 12 }, { wch: 14 }, { wch: 38 }
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function describeInput(input) {
  if (!input) return '';
  if (input.mode === 'fixed') return `fixed = ${input.fixed}`;
  const p = input.params || {};
  switch (input.distType) {
    case 'triangular':  return `min=${p.min}, mode=${p.mode}, max=${p.max}`;
    case 'uniform':     return `min=${p.min}, max=${p.max}`;
    case 'beta':        return `alpha=${p.alpha}, beta=${p.beta}`;
    case 'lognormal':   return `mu=${p.mu}, sigma=${p.sigma}`;
    case 'truncnormal': return `mu=${p.mu}, sigma=${p.sigma}, min=${p.min}, max=${p.max}`;
    default:            return JSON.stringify(p);
  }
}

// ── 3. Iteration Sample ───────────────────────────────────────────────────
function buildIterationSampleSheet(XLSX, tree, result) {
  const inputs = listDistributionInputs(tree);
  const headers = ['Iteration', 'EV', ...inputs.map(i => i.label)];
  const rows = [headers];
  const N = result.iterations;
  const samples = result.inputSamples || [];
  for (let i = 0; i < N; i++) {
    const row = [i + 1, result.evsUnsorted[i]];
    const s = samples[i] || {};
    for (const inp of inputs) row.push(s[inp.key] ?? '');
    rows.push(row);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 16 }, ...inputs.map(() => ({ wch: 16 }))];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

// ── 4. Rollback Trace ─────────────────────────────────────────────────────
// Iteration 0 step-by-step rollback. Walks the tree and emits:
//   - For each chance node: sampled probs, sum, normaliser, normalised probs,
//     child EVs, weighted EV.
//   - For each decision node: child EVs, chosen child.
//   - For each terminal: sampled payoff.
// Sum reconciles to result.evsUnsorted[0] (and to summary.mean over all iters).
function buildRollbackTraceSheet(XLSX, tree, result) {
  const trace = result.traces?.[0];
  if (!trace) {
    return XLSX.utils.aoa_to_sheet([['Rollback trace not recorded.']]);
  }
  const rows = [
    [`Iteration 0 rollback trace`, ''],
    [`Final EV`, result.evsUnsorted[0]],
    [`Optimal path`, trace.optimalPath.join(' → ')],
    [],
    ['NodeID', 'Type', 'Label', 'Step', 'Detail', 'Value']
  ];

  // Walk the tree depth-first; for each node, emit lines describing what
  // happened in iteration 0.
  function walk(node, contribAtThisNode = null) {
    const kids = childrenOf(tree, node.id);
    if (node.type === 'terminal') {
      const payoffKey = `payoff:${node.id}`;
      const v = trace.samples[payoffKey] ?? node.payoff?.fixed ?? 0;
      rows.push([node.id, 'terminal', node.label, 'sampled payoff', describeInput(node.payoff), v]);
      const cv = trace.terminalContribs?.[node.id];
      if (typeof cv === 'number') {
        rows.push([node.id, 'terminal', node.label, 'contribution to root EV', '', cv]);
      }
      return;
    }
    if (node.type === 'chance') {
      const probs = kids.map(k => trace.samples[`prob:${k.id}`] ?? k.branchProb?.fixed ?? 0);
      const sum = probs.reduce((s, v) => s + v, 0) || 1;
      const norm = probs.map(v => v / sum);
      rows.push([node.id, 'chance', node.label, 'sibling sum (raw)', '', sum]);
      kids.forEach((k, i) => {
        rows.push([node.id, 'chance', node.label, `branch · ${k.branchLabel || k.label}`,
                   `raw prob ${probs[i].toFixed(4)} → normalised ${norm[i].toFixed(4)}`, norm[i]]);
      });
      for (const k of kids) walk(k);
      return;
    }
    if (node.type === 'decision') {
      // We emit the chosen branch only — the rest are dropped per §1(a).
      rows.push([node.id, 'decision', node.label, 'choose max-EV child', '', '']);
      for (const k of kids) walk(k);
      return;
    }
  }
  const root = rootOf(tree);
  if (root) walk(root);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 28 }, { wch: 50 }, { wch: 18 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 5 };
  return ws;
}

// ── 5. Results ────────────────────────────────────────────────────────────
function buildResultsSheet(XLSX, tree, result) {
  const cur = tree.meta?.currency || '$';
  const rows = [];

  rows.push(['PERCENTILES']);
  rows.push(['P5',  result.percentiles.p5]);
  rows.push(['P10', result.percentiles.p10]);
  rows.push(['P25', result.percentiles.p25]);
  rows.push(['P50', result.percentiles.p50]);
  rows.push(['P75', result.percentiles.p75]);
  rows.push(['P90', result.percentiles.p90]);
  rows.push(['P95', result.percentiles.p95]);
  rows.push([]);

  rows.push(['SUMMARY']);
  rows.push(['Mean',   result.summary.mean]);
  rows.push(['Stdev',  result.summary.stdev]);
  rows.push(['Min',    result.summary.min]);
  rows.push(['Max',    result.summary.max]);
  rows.push(['VaR 5%', result.summary.var5]);
  rows.push([]);

  rows.push(['OPTIMAL-PATH STABILITY']);
  rows.push(['Path', 'Count', 'Pct']);
  for (const s of result.stability) rows.push([s.path, s.count, s.pct]);
  rows.push([]);

  rows.push(['TORNADO · DRIVERS']);
  rows.push(['Driver', 'Kind', 'Baseline EV', 'Low EV (-1σ)', 'High EV (+1σ)', '|Δ|']);
  for (const d of result.tornado.drivers) {
    rows.push([d.label, d.kind, d.baseline, d.lo, d.hi, d.delta]);
  }
  rows.push([]);

  rows.push(['TERMINAL EMV CONTRIBUTIONS']);
  rows.push(['NodeID', 'Label', 'EMV contribution']);
  let sumEmv = 0;
  for (const id in result.terminalEmvs) {
    const n = tree.nodes.find(x => x.id === id);
    rows.push([id, n?.label || id, result.terminalEmvs[id]]);
    sumEmv += result.terminalEmvs[id];
  }
  rows.push(['', 'Σ', sumEmv]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 38 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

// ── 6. Visual Tree (indented text outline) ────────────────────────────────
function buildVisualTreeSheet(XLSX, tree, result) {
  const cur = tree.meta?.currency || '$';
  const rows = [['Indented tree representation. ◆ Decision · ◎ Chance · ● Terminal.']];
  rows.push([]);
  const root = rootOf(tree);
  function walk(node, depth) {
    const indent = '    '.repeat(depth);
    const glyph = node.type === 'decision' ? '◆'
                : node.type === 'chance'   ? '◎' : '●';
    const branch = node.branchLabel ? ` [${node.branchLabel}]` : '';
    let line = `${indent}${glyph}  ${node.label}${branch}`;
    if (node.type === 'terminal') {
      line += `   payoff ${fmt(meanOfInput(node.payoff), cur)}`;
      const emv = result?.terminalEmvs?.[node.id];
      if (typeof emv === 'number') line += `   EMV ${fmt(emv, cur)}`;
    }
    rows.push([line]);
    const kids = childrenOf(tree, node.id);
    for (const k of kids) walk(k, depth + 1);
  }
  if (root) walk(root, 0);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 100 }];
  return ws;
}
