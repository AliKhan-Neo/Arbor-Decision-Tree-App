// PDF report.
//
// Generates a multi-page PDF using jsPDF (loaded via CDN — global
// window.jspdf.jsPDF). Pages:
//   1. Cover — title, summary statistics, decision recommendation
//   2. Tree   — rendered SVG of the decision tree
//   3. Results — tornado + histogram visualisations (when MC has run)
//
// Embeds the tree as a rasterised image of the SVG output, so the PDF is
// self-contained and works without browser SVG plugins in the viewer.

import { buildTreeSvg, slugFile, triggerDownload } from './svgExport.js';
import { rootOf } from '../model/tree.js';

const PAGE_W = 595;   // pt — A4 portrait width
const PAGE_H = 842;   // pt — A4 portrait height
const MARGIN = 40;

const fmt = (v, cur = '$') => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(1)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
};

export async function exportPdf(tree, lastResult, opts = {}) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library still loading — try again in a moment.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  await renderCoverPage(doc, tree, lastResult);

  // Page 2 — Tree
  doc.addPage();
  await renderTreePage(doc, tree, opts.bestPathIds || [], lastResult?.terminalEmvs || null);

  // Page 3 — Results visualisations (only if simulation has been run).
  if (lastResult) {
    doc.addPage();
    await renderResultsPage(doc, tree, lastResult, opts);
  }

  doc.save(slugFile(tree, 'pdf'));
}

// ── Cover ─────────────────────────────────────────────────────────────────
async function renderCoverPage(doc, tree, lastResult) {
  const cur = tree.meta?.currency || '$';
  const title = tree.meta?.title || 'Decision Analysis';

  // Header strip
  doc.setFillColor('#1A1410');
  doc.rect(0, 0, PAGE_W, 110, 'F');
  doc.setTextColor('#D4A574');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ARBOR', MARGIN, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#B5A38B');
  doc.text('Decision Intelligence', MARGIN + 70, 50);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
           PAGE_W - MARGIN, 50, { align: 'right' });

  // Title block
  doc.setTextColor('#1A1410');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(title, MARGIN, 180);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.setTextColor('#5D6B7D');
  doc.text('Probability-weighted decision tree with Monte Carlo analysis.', MARGIN, 205);

  // Hero stat — root EV
  let y = 260;
  if (lastResult) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor('#B0863D');
    doc.text('EXPECTED VALUE (MEAN)', MARGIN, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor('#D97757');
    doc.text(fmt(lastResult.summary.mean, cur), MARGIN, y + 24);
    y += 48;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#5D6B7D');
    doc.text(`Stdev ${fmt(lastResult.summary.stdev, cur)} · `
           + `P10 ${fmt(lastResult.percentiles.p10, cur)} · `
           + `P50 ${fmt(lastResult.percentiles.p50, cur)} · `
           + `P90 ${fmt(lastResult.percentiles.p90, cur)} · `
           + `VaR(5%) ${fmt(lastResult.summary.var5, cur)}`,
           MARGIN, y);
    y += 24;

    // Stability — top optimal path
    const top = lastResult.stability?.[0];
    if (top) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor('#B0863D');
      doc.text('OPTIMAL PATH', MARGIN, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(13);
      doc.setTextColor('#1A1410');
      doc.text(top.path, MARGIN, y);
      doc.setTextColor('#5D6B7D');
      doc.setFontSize(10);
      y += 14;
      doc.text(`Optimal in ${(top.pct * 100).toFixed(1)}% of ${lastResult.iterations.toLocaleString()} iterations · seed ${lastResult.seed}`,
               MARGIN, y);
      y += 24;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor('#999999');
    doc.text('Simulation has not been run — point-estimate only.', MARGIN, y);
    y += 20;
  }

  // Methodology footnote
  y = PAGE_H - 180;
  doc.setDrawColor('#E5E5E5');
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor('#5D6B7D');
  doc.text('METHODOLOGY', MARGIN, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#5D6B7D');
  const lines = [
    '• Distributions live on chance-node branch probabilities and terminal payoffs only.',
    '• Sibling probabilities normalise to 1 per iteration (no pre-normalisation on the model).',
    '• Expected value computed per iteration, then aggregated. Optimal decision can vary across iterations.'
  ];
  for (const line of lines) { doc.text(line, MARGIN, y); y += 12; }
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor('#999999');
  doc.text('Arbor is a decision-intelligence tool. It is not financial advice. The output is only as good as the inputs.',
           MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 });
}

// ── Tree page ─────────────────────────────────────────────────────────────
async function renderTreePage(doc, tree, bestPathIds, terminalEmvs) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor('#1A1410');
  doc.text('Decision Tree', MARGIN, 60);

  const svg = buildTreeSvg(tree, { bestPathIds, terminalEmvs });
  const dataUrl = await svgToPngDataUrl(svg, PAGE_W * 2, (PAGE_H - 200) * 2);
  if (dataUrl) {
    // Fit into the available space, preserving aspect.
    const availW = PAGE_W - MARGIN * 2;
    const availH = PAGE_H - 110;
    const img = await loadImage(dataUrl);
    const ratio = img.width / img.height;
    let w = availW, h = w / ratio;
    if (h > availH) { h = availH; w = h * ratio; }
    const x = MARGIN + (availW - w) / 2;
    const y = 90;
    doc.addImage(dataUrl, 'PNG', x, y, w, h);
  }
}

// ── Results page ──────────────────────────────────────────────────────────
async function renderResultsPage(doc, tree, result, opts) {
  const cur = tree.meta?.currency || '$';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor('#1A1410');
  doc.text('Simulation Results', MARGIN, 60);

  // Stats table
  let y = 90;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#5D6B7D');
  doc.text('PERCENTILES', MARGIN, y);
  doc.text('SUMMARY', PAGE_W / 2, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#1A1410');

  const p = result.percentiles;
  const percLines = [
    ['P5',  fmt(p.p5,  cur)],
    ['P10', fmt(p.p10, cur)],
    ['P25', fmt(p.p25, cur)],
    ['P50', fmt(p.p50, cur)],
    ['P75', fmt(p.p75, cur)],
    ['P90', fmt(p.p90, cur)],
    ['P95', fmt(p.p95, cur)]
  ];
  const sumLines = [
    ['Mean',  fmt(result.summary.mean,  cur)],
    ['Stdev', fmt(result.summary.stdev, cur)],
    ['Min',   fmt(result.summary.min,   cur)],
    ['Max',   fmt(result.summary.max,   cur)],
    ['VaR 5%', fmt(result.summary.var5, cur)],
    ['Iterations', result.iterations.toLocaleString()],
    ['Seed', String(result.seed)]
  ];
  for (let i = 0; i < Math.max(percLines.length, sumLines.length); i++) {
    if (percLines[i]) {
      doc.text(percLines[i][0], MARGIN, y);
      doc.text(percLines[i][1], MARGIN + 100, y, { align: 'right' });
    }
    if (sumLines[i]) {
      doc.text(sumLines[i][0], PAGE_W / 2, y);
      doc.text(sumLines[i][1], PAGE_W / 2 + 120, y, { align: 'right' });
    }
    y += 12;
  }

  // Tornado image — render from the live dashboard canvas
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor('#5D6B7D');
  doc.text('TORNADO · TOP DRIVERS', MARGIN, y);
  y += 8;
  const tornadoCanvas = opts.tornadoCanvas;
  if (tornadoCanvas) {
    try {
      const dataUrl = tornadoCanvas.toDataURL('image/png');
      const availW = PAGE_W - MARGIN * 2;
      const h = Math.min(220, PAGE_H - y - MARGIN);
      doc.addImage(dataUrl, 'PNG', MARGIN, y, availW, h);
      y += h + 16;
    } catch (e) { /* ignore — chart simply omitted */ }
  }

  // Histogram image
  if (y < PAGE_H - 200) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor('#5D6B7D');
    doc.text('EV DISTRIBUTION', MARGIN, y);
    y += 8;
    const histCanvas = opts.histogramCanvas;
    if (histCanvas) {
      try {
        const dataUrl = histCanvas.toDataURL('image/png');
        const availW = PAGE_W - MARGIN * 2;
        const h = Math.min(150, PAGE_H - y - MARGIN);
        doc.addImage(dataUrl, 'PNG', MARGIN, y, availW, h);
      } catch (e) { /* ignore */ }
    }
  }
}

// ── SVG → PNG dataURL ─────────────────────────────────────────────────────
function svgToPngDataUrl(svgText, targetW, targetH) {
  return new Promise((resolve) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // Preserve aspect when rendering at requested size.
      const aspect = img.width / img.height;
      let w = targetW, h = targetW / aspect;
      if (h > targetH) { h = targetH; w = h * aspect; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext('2d');
      // White background so the PDF doesn't show transparency artefacts on
      // dark themes.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
