// Edge rendering between a parent node and its child. Bezier curve with an
// optional branch label and probability annotation rendered on the midpoint.

import { nodePorts, palette } from './nodes.js';
import { meanOfInput } from '../sim/distributions.js';

export function drawConnector(ctx, parent, child, opts = {}) {
  const p = palette();
  const from = nodePorts(parent).right;
  const to   = nodePorts(child).left;
  const midX = (from.x + to.x) / 2;
  const best = opts.best;

  ctx.save();
  ctx.strokeStyle = best ? p.hero : p.line;
  ctx.lineWidth   = best ? 2.4 : 1.2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
  ctx.stroke();

  // Branch label + probability annotation on the midpoint.
  // We only show probability on chance-parent edges (other branches don't have
  // a meaningful probability — decisions are choices).
  const labelParts = [];
  if (child.branchLabel) labelParts.push(child.branchLabel);
  if (parent.type === 'chance' && child.branchProb) {
    const mu = meanOfInput(child.branchProb);
    const isDist = child.branchProb.mode === 'distribution';
    const pct = (mu * 100).toFixed(isDist ? 1 : 0) + '%';
    labelParts.push(isDist ? `~${pct}` : pct);
  }
  if (labelParts.length) {
    const text = labelParts.join('  ·  ');
    const labelX = midX;
    const labelY = (from.y + to.y) / 2 - 10;
    ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Background chip for legibility.
    const m = ctx.measureText(text);
    const pad = 6, w = m.width + pad * 2, h = 16;
    ctx.fillStyle = p.panel;
    ctx.beginPath();
    rectPath(ctx, labelX - w / 2, labelY - h / 2, w, h, 4);
    ctx.fill();
    ctx.fillStyle = best ? p.hero : p.textMuted;
    ctx.fillText(text, labelX, labelY);
  }
  ctx.restore();
}

function rectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}
