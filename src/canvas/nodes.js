// Node geometry + rendering. Three shapes per BRIEF §0:
//   Decision  — rounded square (a choice)
//   Chance    — circle (a random event)
//   Terminal  — rounded rectangle (an outcome with a payoff)

import { meanOfInput } from '../sim/distributions.js';

// Visual dimensions (world coordinates — canvas applies pan/zoom transform).
const DEC = { w: 76,  h: 76,  r: 12 };  // decision
const CHA = { r: 34 };                   // chance (radius)
const TER = { w: 196, h: 60, r: 12 };    // terminal

export function nodeBounds(node) {
  switch (node.type) {
    case 'decision':
      return { x: node.x - DEC.w / 2, y: node.y - DEC.h / 2, w: DEC.w, h: DEC.h };
    case 'chance':
      return { x: node.x - CHA.r, y: node.y - CHA.r, w: CHA.r * 2, h: CHA.r * 2 };
    case 'terminal':
    default:
      return { x: node.x - TER.w / 2, y: node.y - TER.h / 2, w: TER.w, h: TER.h };
  }
}

// Connection ports — where edges enter/exit the node.
export function nodePorts(node) {
  const b = nodeBounds(node);
  return {
    left:  { x: b.x,         y: node.y },
    right: { x: b.x + b.w,   y: node.y },
    top:   { x: node.x,      y: b.y },
    bot:   { x: node.x,      y: b.y + b.h }
  };
}

// Screen-space hit test. (sx, sy) are world coords here — caller transforms.
export function hitTest(node, wx, wy) {
  if (node.type === 'chance') {
    const dx = wx - node.x, dy = wy - node.y;
    return dx * dx + dy * dy <= CHA.r * CHA.r;
  }
  const b = nodeBounds(node);
  return wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h;
}

// Roughly the right-edge "+" hover hotspot (world coords).
export function hoverPlusPort(node) {
  const b = nodeBounds(node);
  return { x: b.x + b.w + 14, y: node.y };
}

function rrectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

// Pull the current theme palette from CSS custom properties.
let _palette = null;
export function refreshPalette() {
  const cs = getComputedStyle(document.documentElement);
  _palette = {
    nodeFill:       cs.getPropertyValue('--node-fill').trim(),
    nodeStroke:     cs.getPropertyValue('--node-stroke').trim(),
    nodeStrokeSel:  cs.getPropertyValue('--node-stroke-sel').trim(),
    nodeStrokeBest: cs.getPropertyValue('--node-stroke-best').trim(),
    text:           cs.getPropertyValue('--text').trim(),
    textMuted:      cs.getPropertyValue('--text-muted').trim(),
    accent:         cs.getPropertyValue('--accent').trim(),
    hero:           cs.getPropertyValue('--hero').trim(),
    panel:          cs.getPropertyValue('--panel').trim(),
    line:           cs.getPropertyValue('--line').trim(),
    lineStrong:     cs.getPropertyValue('--line-strong').trim()
  };
}
export function palette() {
  if (!_palette) refreshPalette();
  return _palette;
}

function fmt(value, currency) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const a = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  let body;
  if (a >= 1e9) body = (a / 1e9).toFixed(2) + 'B';
  else if (a >= 1e6) body = (a / 1e6).toFixed(2) + 'M';
  else if (a >= 1e3) body = (a / 1e3).toFixed(1) + 'K';
  else body = a.toFixed(0);
  return sign + (currency || '$') + body;
}

export function drawNode(ctx, node, opts = {}) {
  const p = palette();
  const isSel  = opts.selected;
  const isBest = opts.best;
  const isHover = opts.hover;

  ctx.save();

  // Selection halo (matches CSS --shadow-node-sel).
  if (isSel) {
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 16;
  }

  ctx.fillStyle = p.nodeFill;
  ctx.strokeStyle = isSel ? p.nodeStrokeSel : (isBest ? p.nodeStrokeBest : p.nodeStroke);
  ctx.lineWidth = isSel ? 2.0 : (isBest ? 1.6 : 1.0);

  if (node.type === 'decision') {
    rrectPath(ctx, node.x - DEC.w / 2, node.y - DEC.h / 2, DEC.w, DEC.h, DEC.r);
    ctx.fill();
    ctx.stroke();
    // Inner glyph: a small diamond (◆) marking decision.
    ctx.fillStyle = p.accent;
    ctx.font = '600 14px var(--display)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◆', node.x, node.y - 8);
    // Label sits below the shape.
    ctx.fillStyle = p.text;
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(trunc(node.label, 16), node.x, node.y + 18);
  } else if (node.type === 'chance') {
    ctx.beginPath();
    ctx.arc(node.x, node.y, CHA.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner glyph: ◎ marking chance.
    ctx.fillStyle = p.accent;
    ctx.font = '500 16px var(--display)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◎', node.x, node.y - 4);
    ctx.fillStyle = p.textMuted;
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillText(trunc(node.label, 14), node.x, node.y + 14);
  } else {
    // Terminal: rounded rectangle with label + payoff inside.
    rrectPath(ctx, node.x - TER.w / 2, node.y - TER.h / 2, TER.w, TER.h, TER.r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.text;
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(trunc(node.label, 22), node.x, node.y - 8);
    // Payoff line in mono.
    const mu = node.payoff ? meanOfInput(node.payoff) : 0;
    const tag = node.payoff?.mode === 'distribution' ? ' · μ' : '';
    ctx.fillStyle = mu >= 0 ? p.accent : p.hero;
    ctx.font = '500 11px "DM Mono", ui-monospace, monospace';
    ctx.fillText(fmt(mu, '$') + tag, node.x, node.y + 12);
  }

  // Hover "+" hotspot indicator (only on chance & decision — terminals don't
  // get children).
  if (isHover && node.type !== 'terminal') {
    const port = hoverPlusPort(node);
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(port.x, port.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.nodeFill;
    ctx.font = '700 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', port.x, port.y + 1);
  }

  ctx.restore();
}

function trunc(s, n) {
  s = s || '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
