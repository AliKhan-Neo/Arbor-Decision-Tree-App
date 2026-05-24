// Audit-ready Excel export — ExcelJS edition.
//
// Switched from SheetJS to ExcelJS so the workbook can carry:
//   • Live formulas — Results stats are AVERAGE / STDEV / PERCENTILE on the
//     Iteration Sample sheet. An auditor opens the workbook and Excel
//     re-computes them; if our numbers and Excel's diverge, the bug is on
//     us, and the auditor sees exactly where.
//   • Rollback Trace formulas — for iteration 0, the sampled probs become
//     ratios via formulas (Sibling sum + normalisation) that chain up to a
//     root-EV cell. That cell should equal `Iteration Sample!B2` exactly.
//   • Branding — fonts, fills, frozen panes, column widths, currency
//     formats, conditional bars on the tornado.
//   • Embedded histogram image — rendered from the live dashboard canvas
//     and dropped into the Cover sheet.
//
// Six sheets per BRIEF §4:
//   1. Cover           IC-memo cover with hero stats + methodology
//   2. Tree Structure  flat table of every node/branch with mode/params
//   3. Iteration Sample  exactly 10,001 rows: each iter's sampled inputs + EV
//   4. Rollback Trace  iteration-0 step-by-step formulas reconciling to B2
//   5. Results         percentiles/summary AS FORMULAS over Iteration Sample
//   6. Visual Tree     indented hierarchical text representation

import { runMonteCarlo } from '../sim/monteCarlo.js';
import { listDistributionInputs } from '../sim/rollback.js';
import { meanOfInput } from '../sim/distributions.js';
import { rootOf, childrenOf } from '../model/tree.js';
import { slugFile, triggerDownload } from './svgExport.js';

// Brand palette (ARGB — Excel wants alpha-prefixed).
const C = {
  bg:        'FF1A1410',
  panel:     'FF221A14',
  accent:    'FFD4A574',
  hero:      'FFC56B47',
  text:      'FFF4EBDC',
  textMuted: 'FFB5A38B',
  positive:  'FF8FA68E',
  rust:      'FFB14A3A',
  line:      'FF4A3F33',
  cream:     'FFF5F0E6',
  navy:      'FF0C2340'
};

export async function exportExcel(tree, opts = {}) {
  if (!window.ExcelJS) {
    alert('Excel library still loading — try again in a moment.');
    return;
  }
  const ExcelJS = window.ExcelJS;
  const cur = tree.meta?.currency || '$';

  // Re-run with recordSamples so we have iteration-level data + iter-0 trace.
  const result = runMonteCarlo(tree, {
    seed: tree.meta?.seed ?? 42,
    iterations: tree.meta?.iterations ?? 10000,
    recordSamples: true
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Arbor';
  wb.created = new Date();

  // Build sheets in the final display order. The Iteration Sample range
  // is deterministic, so other sheets can reference it via formula strings
  // before that sheet is actually created.
  const distInputs = listDistributionInputs(tree);
  const iterRange  = `'Iteration Sample'!B2:B${result.iterations + 1}`;

  await buildCoverSheet(wb, tree, result, cur, opts.histogramCanvas);
  buildStructureSheet(wb, tree);
  buildIterationSampleSheet(wb, tree, result, distInputs, cur);
  buildRollbackTraceSheet(wb, tree, result, cur);
  buildResultsSheet(wb, tree, result, iterRange, cur);
  buildVisualTreeSheet(wb, tree, result, cur);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, slugFile(tree, 'xlsx'));
}

// ── 1. Cover ──────────────────────────────────────────────────────────────
async function buildCoverSheet(wb, tree, result, cur, histogramCanvas) {
  const ws = wb.addWorksheet('Cover', {
    pageSetup: { paperSize: 9, orientation: 'portrait' },
    properties: { defaultColWidth: 14 }
  });
  ws.columns = [
    { width: 24 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }
  ];

  // Title block.
  ws.mergeCells('A1:F3');
  const titleCell = ws.getCell('A1');
  titleCell.value = tree.meta?.title || 'Decision Analysis';
  titleCell.font = { name: 'Cormorant Garamond', size: 28, italic: true, color: { argb: C.bg } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } };
  ws.getRow(1).height = 36;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 22;

  ws.mergeCells('A4:F4');
  const sub = ws.getCell('A4');
  sub.value = `Arbor · Decision Intelligence — generated ${new Date().toLocaleString()}`;
  sub.font  = { name: 'DM Mono', size: 10, color: { argb: C.textMuted } };
  sub.alignment = { horizontal: 'left', indent: 1 };
  sub.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cream } };

  // Hero EV — formula references the Results sheet so it's self-verifying.
  ws.getCell('A6').value = 'EXPECTED VALUE (MEAN)';
  ws.getCell('A6').font = { name: 'DM Mono', size: 9, color: { argb: C.accent }, bold: true };
  const hero = ws.getCell('A7');
  hero.value = { formula: `Results!B3`, result: result.summary.mean };
  hero.font  = { name: 'DM Mono', size: 28, bold: true, color: { argb: C.hero } };
  hero.numFmt = `"${cur}"#,##0.00;[Red]-"${cur}"#,##0.00`;
  ws.mergeCells('A7:C8');
  ws.getRow(7).height = 30;
  ws.getRow(8).height = 14;

  // KPI grid
  const kpis = [
    ['Stdev',      `Results!B4`, result.summary.stdev],
    ['Median (P50)',`Results!B12`, result.percentiles.p50],
    ['P10',        `Results!B10`, result.percentiles.p10],
    ['P90',        `Results!B14`, result.percentiles.p90],
    ['VaR (5%)',   `Results!B7`,  result.summary.var5],
    ['Iterations', null,          result.iterations],
    ['Seed',       null,          result.seed]
  ];
  let row = 10;
  for (const [label, formula, fallback] of kpis) {
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 10, color: { argb: C.textMuted } };
    const valCell = ws.getCell(`B${row}`);
    if (formula) {
      valCell.value = { formula, result: fallback };
      valCell.numFmt = `"${cur}"#,##0`;
    } else {
      valCell.value = fallback;
    }
    valCell.font = { name: 'DM Mono', size: 12, color: { argb: C.bg }, bold: true };
    valCell.alignment = { horizontal: 'right' };
    row++;
  }

  // Recommendation
  row += 1;
  ws.getCell(`A${row}`).value = 'OPTIMAL PATH';
  ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 9, color: { argb: C.accent }, bold: true };
  row++;
  const top = result.stability?.[0];
  ws.mergeCells(`A${row}:F${row}`);
  ws.getCell(`A${row}`).value = top?.path || '(none)';
  ws.getCell(`A${row}`).font  = { name: 'Cormorant Garamond', size: 18, italic: true, color: { argb: C.bg } };
  row++;
  ws.mergeCells(`A${row}:F${row}`);
  ws.getCell(`A${row}`).value = top
    ? `Optimal in ${(top.pct * 100).toFixed(1)}% of ${result.iterations.toLocaleString()} iterations · seed ${result.seed}`
    : '';
  ws.getCell(`A${row}`).font  = { name: 'DM Mono', size: 10, color: { argb: C.textMuted } };
  row += 2;

  // Histogram image (rendered from live dashboard canvas).
  if (histogramCanvas) {
    try {
      const dataUrl = histogramCanvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const imageId = wb.addImage({ base64, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: 0.2, row: row - 1 },
        ext: { width: 720, height: 220 }
      });
      row += 12;
    } catch (e) { /* canvas tainted? skip */ }
  }

  // Methodology footer
  row += 1;
  ws.getCell(`A${row}`).value = 'METHODOLOGY';
  ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 9, color: { argb: C.accent }, bold: true };
  const methodLines = [
    '1. Probability distributions are sampled per iteration on chance-node branches and terminal payoffs only.',
    '2. Sibling probabilities normalise to 1 per-iteration. No pre-normalisation on the model.',
    '3. Expected value computed per iteration, then aggregated. Optimal decision can vary across iterations.',
    '',
    'Arbor is a decision-intelligence tool. Not financial advice.'
  ];
  for (const line of methodLines) {
    row++;
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = line;
    ws.getCell(`A${row}`).font  = { name: 'Inter', size: 10, color: { argb: C.bg } };
  }
}

// ── 2. Tree Structure ─────────────────────────────────────────────────────
function buildStructureSheet(wb, tree) {
  const ws = wb.addWorksheet('Tree Structure');
  ws.columns = [
    { header: 'NodeID', key: 'id',          width: 10 },
    { header: 'ParentID', key: 'parentId',  width: 10 },
    { header: 'Type', key: 'type',          width: 10 },
    { header: 'Label', key: 'label',        width: 22 },
    { header: 'BranchLabel', key: 'branch', width: 22 },
    { header: 'Prob Mode', key: 'pm',       width: 12 },
    { header: 'Prob Dist', key: 'pd',       width: 14 },
    { header: 'Prob Params', key: 'pp',     width: 36 },
    { header: 'Payoff Mode', key: 'ym',     width: 12 },
    { header: 'Payoff Dist', key: 'yd',     width: 14 },
    { header: 'Payoff Params', key: 'yp',   width: 36 }
  ];
  styleHeaderRow(ws);
  for (const n of tree.nodes) {
    ws.addRow({
      id: n.id, parentId: n.parentId || '',
      type: n.type, label: n.label, branch: n.branchLabel || '',
      pm: n.branchProb?.mode || '',
      pd: n.branchProb?.distType || '',
      pp: describeInput(n.branchProb),
      ym: n.payoff?.mode || '',
      yd: n.payoff?.distType || '',
      yp: describeInput(n.payoff)
    });
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
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
function buildIterationSampleSheet(wb, tree, result, distInputs, cur) {
  const ws = wb.addWorksheet('Iteration Sample');
  const columns = [
    { header: 'Iteration', key: 'i',  width: 10 },
    { header: 'EV',        key: 'ev', width: 16 }
  ];
  for (let k = 0; k < distInputs.length; k++) {
    columns.push({ header: distInputs[k].label, key: `s${k}`, width: 18 });
  }
  ws.columns = columns;
  styleHeaderRow(ws);
  const samples = result.inputSamples || [];
  for (let i = 0; i < result.iterations; i++) {
    const row = { i: i + 1, ev: result.evsUnsorted[i] };
    const s = samples[i] || {};
    distInputs.forEach((inp, k) => { row[`s${k}`] = s[inp.key] ?? ''; });
    ws.addRow(row);
  }
  // EV column number format.
  ws.getColumn('ev').numFmt = `"${cur}"#,##0`;
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
}

// ── 4. Rollback Trace ─────────────────────────────────────────────────────
// Iteration 0 step-by-step rollback. Every row references the sampled values
// in 'Iteration Sample' row 2 via formulas. At each chance node, sibling sum
// + normalisation are computed by formula. The final cell labelled "Root EV
// (formula)" should equal Iteration Sample!B2 to ≤ 1e-6 — this is the
// reconciliation contract that proves the engine.
function buildRollbackTraceSheet(wb, tree, result, cur) {
  const ws = wb.addWorksheet('Rollback Trace');
  ws.columns = [
    { header: 'Node',           key: 'node',   width: 22 },
    { header: 'Type',           key: 'type',   width: 12 },
    { header: 'Step',           key: 'step',   width: 28 },
    { header: 'Input key',      key: 'key',    width: 22 },
    { header: 'Sampled value',  key: 'val',    width: 16 },
    { header: 'Formula',        key: 'formula',width: 36 }
  ];
  styleHeaderRow(ws);

  const distInputs = listDistributionInputs(tree);
  // Lookup table: input key → column letter in Iteration Sample.
  // Iteration Sample columns are: A=Iteration, B=EV, then C, D, E, … for each
  // distribution-mode input in order of listDistributionInputs(tree).
  const colOf = {};
  for (let k = 0; k < distInputs.length; k++) {
    const colLetter = colLetterFromIndex(2 + k);   // C, D, E, ...
    colOf[distInputs[k].key] = colLetter;
  }
  // Iteration 0 lives in row 2 of Iteration Sample.
  const sampleRow = 2;

  function refForKey(key) {
    if (colOf[key]) return `'Iteration Sample'!${colOf[key]}${sampleRow}`;
    return null;
  }

  // Walk the tree depth-first. For each node, emit rows + record the formula
  // string for that node's EV, so the parent can reference it later.
  const evFormula = new Map();         // nodeId → "FORMULA" string
  function walk(node) {
    const kids = childrenOf(tree, node.id);

    if (node.type === 'terminal') {
      const payKey = `payoff:${node.id}`;
      const payRef = refForKey(payKey);
      if (payRef) {
        ws.addRow({
          node: node.label, type: 'terminal',
          step: 'sampled payoff',
          key:  payKey,
          val:  { formula: `=${payRef}`, result: payoffSampleFallback(node, result) },
          formula: `=${payRef}`
        });
        evFormula.set(node.id, payRef);
      } else {
        // Fixed payoff — write the literal.
        const v = node.payoff?.fixed ?? 0;
        ws.addRow({
          node: node.label, type: 'terminal',
          step: 'fixed payoff',
          key:  '',
          val:  v,
          formula: String(v)
        });
        evFormula.set(node.id, String(v));
      }
      return;
    }

    if (node.type === 'chance') {
      // First: emit the sampled probs for each child.
      const sibProbRefs = [];
      for (const k of kids) {
        const pkey = `prob:${k.id}`;
        const pref = refForKey(pkey);
        if (pref) {
          ws.addRow({
            node: node.label, type: 'chance',
            step: `branch · ${k.branchLabel || k.label} — raw prob`,
            key:  pkey,
            val:  { formula: `=${pref}`, result: probSampleFallback(k, result) },
            formula: `=${pref}`
          });
          sibProbRefs.push(`=${pref}`);
        } else {
          const v = k.branchProb?.fixed ?? 0;
          ws.addRow({
            node: node.label, type: 'chance',
            step: `branch · ${k.branchLabel || k.label} — fixed prob`,
            key:  '', val: v, formula: String(v)
          });
          sibProbRefs.push(String(v));
        }
      }

      // Sibling sum row — we need to refer back to those cells.
      // Determine the row range we just added: last N rows where N = kids.length.
      const lastRow = ws.rowCount;
      const firstProbRow = lastRow - kids.length + 1;
      const sumFormula = `=SUM(E${firstProbRow}:E${lastRow})`;
      ws.addRow({
        node: node.label, type: 'chance',
        step: 'sibling sum (Σ raw probs)',
        key:  '',
        val:  { formula: sumFormula, result: siblingSumFallback(kids, result) },
        formula: sumFormula
      });
      const sumRow = ws.rowCount;

      // Recurse into kids so we have their EV formulas.
      const childEvFormulas = [];
      for (const k of kids) {
        walk(k);
        childEvFormulas.push(evFormula.get(k.id) || '0');
      }

      // Weighted EV row — for each child, (sampledProb / sum) * child EV.
      const terms = kids.map((k, i) =>
        `(E${firstProbRow + i}/E${sumRow})*(${stripEq(childEvFormulas[i])})`
      );
      const weightedFormula = `=` + terms.join('+');
      ws.addRow({
        node: node.label, type: 'chance',
        step: 'weighted EV = Σ (normalised prob × child EV)',
        key:  '',
        val:  { formula: weightedFormula, result: chanceEvFallback(kids, result) },
        formula: weightedFormula
      });
      const wRow = ws.rowCount;
      ws.getRow(wRow).font = { bold: true };
      // Cell ref for parent to consume.
      evFormula.set(node.id, `E${wRow}`);
      return;
    }

    if (node.type === 'decision') {
      // Emit each child's EV formula, then MAX over them.
      ws.addRow({
        node: node.label, type: 'decision',
        step: 'children EVs computed below, then MAX',
        key: '', val: '', formula: ''
      });
      const childRows = [];
      for (const k of kids) {
        walk(k);
        // Reference the last row of that child's EV.
        const ref = evFormula.get(k.id);
        // Add a summary row capturing the child's EV with a label so the MAX
        // formula is easy to read.
        ws.addRow({
          node: node.label, type: 'decision',
          step: `option · ${k.branchLabel || k.label}`,
          key: '',
          val: { formula: `=${stripEq(ref)}`, result: 0 },
          formula: `=${stripEq(ref)}`
        });
        childRows.push(ws.rowCount);
      }
      const maxArgs = childRows.map(r => `E${r}`).join(',');
      const maxFormula = `=MAX(${maxArgs})`;
      ws.addRow({
        node: node.label, type: 'decision',
        step: 'optimal EV = MAX(children)',
        key: '',
        val: { formula: maxFormula, result: 0 },
        formula: maxFormula
      });
      ws.getRow(ws.rowCount).font = { bold: true };
      evFormula.set(node.id, `E${ws.rowCount}`);
      return;
    }
  }

  const root = rootOf(tree);
  if (root) walk(root);

  // Final reconciliation row.
  ws.addRow([]);
  const reconcRow = ws.rowCount + 1;
  const rootRef = evFormula.get(root?.id);
  if (rootRef) {
    ws.addRow({
      node: 'ROOT EV (formula reconciliation)', type: '', step: '',
      key: '', val: { formula: `=${stripEq(rootRef)}`, result: result.evsUnsorted[0] },
      formula: `should equal 'Iteration Sample'!B2`
    });
    const row = ws.getRow(reconcRow);
    row.font = { bold: true, color: { argb: C.hero } };
    row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6EC' } }; });
  }
  ws.getColumn('val').numFmt = `"${cur}"#,##0.00;[Red]-"${cur}"#,##0.00`;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function stripEq(s) { return s.startsWith('=') ? s.slice(1) : s; }

// Sampled-value fallbacks for the "result" hint so Excel shows a value even
// before re-evaluating the formulas.
function probSampleFallback(child, result)  { return result.traces?.[0]?.samples?.[`prob:${child.id}`] ?? (child.branchProb?.fixed ?? 0); }
function payoffSampleFallback(node, result) { return result.traces?.[0]?.samples?.[`payoff:${node.id}`] ?? (node.payoff?.fixed ?? 0); }
function siblingSumFallback(kids, result) {
  return kids.reduce((s, k) => s + probSampleFallback(k, result), 0) || 1;
}
function chanceEvFallback(kids, result) {
  const sum = siblingSumFallback(kids, result);
  let ev = 0;
  for (const k of kids) {
    const p = probSampleFallback(k, result) / sum;
    ev += p * (result.traces?.[0]?.terminalContribs?.[k.id] ?? 0);
  }
  return ev;
}

// ── 5. Results ────────────────────────────────────────────────────────────
// Stats are LIVE formulas referencing the Iteration Sample's EV column so
// the auditor can verify by selecting the data and computing in Excel.
function buildResultsSheet(wb, tree, result, evRange, cur) {
  const ws = wb.addWorksheet('Results');
  ws.columns = [
    { width: 30 }, { width: 20 }
  ];

  let row = 1;
  ws.getCell(`A${row}`).value = 'SUMMARY · live formulas over Iteration Sample';
  ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 10, color: { argb: C.accent }, bold: true };
  row++;
  const summaryRows = [
    ['Iterations',  result.iterations],
    ['Mean',        { formula: `AVERAGE(${evRange})`,  result: result.summary.mean }],
    ['Stdev',       { formula: `STDEV.S(${evRange})`,  result: result.summary.stdev }],
    ['Min',         { formula: `MIN(${evRange})`,      result: result.summary.min }],
    ['Max',         { formula: `MAX(${evRange})`,      result: result.summary.max }],
    ['VaR (5%)',    { formula: `PERCENTILE.INC(${evRange},0.05)`, result: result.summary.var5 }],
    ['', ''],
    ['PERCENTILES'],
    ['P5',  { formula: `PERCENTILE.INC(${evRange},0.05)`, result: result.percentiles.p5 }],
    ['P10', { formula: `PERCENTILE.INC(${evRange},0.10)`, result: result.percentiles.p10 }],
    ['P25', { formula: `PERCENTILE.INC(${evRange},0.25)`, result: result.percentiles.p25 }],
    ['P50', { formula: `PERCENTILE.INC(${evRange},0.50)`, result: result.percentiles.p50 }],
    ['P75', { formula: `PERCENTILE.INC(${evRange},0.75)`, result: result.percentiles.p75 }],
    ['P90', { formula: `PERCENTILE.INC(${evRange},0.90)`, result: result.percentiles.p90 }],
    ['P95', { formula: `PERCENTILE.INC(${evRange},0.95)`, result: result.percentiles.p95 }]
  ];
  for (const [label, val] of summaryRows) {
    ws.getCell(`A${row}`).value = label;
    if (val !== '' && val !== undefined) {
      const c = ws.getCell(`B${row}`);
      c.value = val;
      if (label !== 'Iterations') c.numFmt = `"${cur}"#,##0.00;[Red]-"${cur}"#,##0.00`;
      c.font = { name: 'DM Mono', size: 11, bold: true };
      if (label === 'Mean') c.font.color = { argb: C.hero };
    }
    if (label === 'SUMMARY · live formulas over Iteration Sample' || label === 'PERCENTILES') {
      ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 10, color: { argb: C.accent }, bold: true };
    } else {
      ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 10, color: { argb: C.textMuted } };
    }
    row++;
  }

  // ── Stability (values, not formulas — count per path is deterministic from
  // the iteration sample but extracting paths from the workbook is complex).
  row++;
  ws.getCell(`A${row}`).value = 'OPTIMAL-PATH STABILITY';
  ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 10, color: { argb: C.accent }, bold: true };
  row++;
  ws.getCell(`A${row}`).value = 'Path'; ws.getCell(`B${row}`).value = 'Count'; ws.getCell(`C${row}`).value = 'Pct';
  styleSubHeader(ws.getRow(row));
  row++;
  for (const s of result.stability) {
    ws.getCell(`A${row}`).value = s.path;
    ws.getCell(`B${row}`).value = s.count;
    ws.getCell(`C${row}`).value = s.pct;
    ws.getCell(`C${row}`).numFmt = '0.00%';
    row++;
  }

  // ── Tornado
  row++;
  ws.getCell(`A${row}`).value = 'TORNADO · ONE-AT-A-TIME ±1σ AROUND MEAN-STATE';
  ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 10, color: { argb: C.accent }, bold: true };
  row++;
  const hdrs = ['Driver', 'Kind', 'Baseline EV', 'Low (-1σ)', 'High (+1σ)', '|Δ|'];
  hdrs.forEach((h, i) => { ws.getCell(row, i + 1).value = h; });
  styleSubHeader(ws.getRow(row));
  row++;
  for (const d of result.tornado.drivers) {
    ws.getCell(row, 1).value = d.label;
    ws.getCell(row, 2).value = d.kind;
    ws.getCell(row, 3).value = d.baseline;
    ws.getCell(row, 4).value = d.lo;
    ws.getCell(row, 5).value = d.hi;
    ws.getCell(row, 6).value = d.delta;
    for (const col of [3, 4, 5, 6]) {
      ws.getCell(row, col).numFmt = `"${cur}"#,##0`;
    }
    row++;
  }

  // ── Terminal EMV contributions — also as formulas where possible.
  row++;
  ws.getCell(`A${row}`).value = 'TERMINAL EMV CONTRIBUTIONS · Σ ≈ Mean';
  ws.getCell(`A${row}`).font = { name: 'DM Mono', size: 10, color: { argb: C.accent }, bold: true };
  row++;
  ws.getCell(`A${row}`).value = 'NodeID'; ws.getCell(`B${row}`).value = 'Label'; ws.getCell(`C${row}`).value = 'EMV';
  styleSubHeader(ws.getRow(row));
  row++;
  const startEmvRow = row;
  for (const id in result.terminalEmvs) {
    const n = tree.nodes.find(x => x.id === id);
    ws.getCell(`A${row}`).value = id;
    ws.getCell(`B${row}`).value = n?.label || id;
    ws.getCell(`C${row}`).value = result.terminalEmvs[id];
    ws.getCell(`C${row}`).numFmt = `"${cur}"#,##0`;
    row++;
  }
  // Σ check: should equal Mean (B3).
  ws.getCell(`A${row}`).value = 'Σ EMV (formula)';
  ws.getCell(`A${row}`).font  = { bold: true };
  ws.getCell(`C${row}`).value = { formula: `SUM(C${startEmvRow}:C${row - 1})`, result: result.summary.mean };
  ws.getCell(`C${row}`).numFmt = `"${cur}"#,##0`;
  ws.getCell(`C${row}`).font   = { bold: true, color: { argb: C.hero } };

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 6. Visual Tree (indented) ─────────────────────────────────────────────
function buildVisualTreeSheet(wb, tree, result, cur) {
  const ws = wb.addWorksheet('Visual Tree');
  ws.columns = [{ width: 90 }];
  ws.getCell('A1').value = 'Indented hierarchical view. ◆ Decision · ◎ Chance · ● Terminal.';
  ws.getCell('A1').font  = { name: 'DM Mono', size: 10, color: { argb: C.textMuted } };
  let row = 3;
  function walk(node, depth) {
    const indent = '    '.repeat(depth);
    const glyph = node.type === 'decision' ? '◆'
                : node.type === 'chance'   ? '◎' : '●';
    const branch = node.branchLabel ? `  [${node.branchLabel}]` : '';
    let line = `${indent}${glyph}  ${node.label}${branch}`;
    if (node.type === 'terminal') {
      line += `   payoff ${fmtCur(meanOfInput(node.payoff), cur)}`;
      const emv = result?.terminalEmvs?.[node.id];
      if (typeof emv === 'number') line += `   EMV ${fmtCur(emv, cur)}`;
    }
    ws.getCell(`A${row}`).value = line;
    ws.getCell(`A${row}`).font  = { name: 'Consolas', size: 11 };
    row++;
    for (const k of childrenOf(tree, node.id)) walk(k, depth + 1);
  }
  const root = rootOf(tree);
  if (root) walk(root, 0);
}

// ── Helpers ──────────────────────────────────────────────────────────────
function styleHeaderRow(ws) {
  const row = ws.getRow(1);
  row.font = { name: 'DM Mono', size: 10, bold: true, color: { argb: C.text } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.panel } };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
}
function styleSubHeader(row) {
  row.font = { name: 'DM Mono', size: 9, bold: true, color: { argb: C.textMuted } };
}
function fmtCur(v, cur) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(1)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
}
function colLetterFromIndex(zeroBased) {
  // 0 -> A, 1 -> B, 25 -> Z, 26 -> AA, ...
  let n = zeroBased + 1, s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
