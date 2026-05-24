// Right-panel node editor.
//
// Layout depends on the selected node:
//   - Common: label, type, branch label (if not root)
//   - Parent-is-chance: branchProb mode + (fixed value | distribution params)
//   - type==='terminal': payoff mode + (fixed value | distribution params)
//   - type==='chance': children sigma-sum status + per-branch quick links
//   - Always: add-child + delete buttons
//
// All edits route through `onChange()` so the canvas + persistence sync.

import { getNode, childrenOf, fixed, tri, uni, betaInput, logn, tnorm, addNode, removeSubtree } from '../model/tree.js';
import { chanceBranchSum, SIGMA_OK, SIGMA_LOW, SIGMA_HIGH } from '../model/validation.js';
import { meanOfInput } from '../sim/distributions.js';

const PROB_DIST_TYPES = ['triangular', 'beta', 'uniform'];
const PAY_DIST_TYPES  = ['triangular', 'lognormal', 'truncnormal', 'uniform'];

const DIST_NICE = {
  triangular: 'Triangular',
  beta: 'Beta',
  uniform: 'Uniform',
  lognormal: 'Lognormal',
  truncnormal: 'Truncated Normal'
};

const DIST_DEFAULTS = {
  // probability-domain
  triangular: { min: 0.30, mode: 0.50, max: 0.70 },
  beta:       { alpha: 4, beta: 4 },
  uniform:    { min: 0.30, max: 0.70 },
  // payoff-domain — these get re-scaled by caller for terminal payoffs
  lognormal:   { mu: 15, sigma: 0.5 },
  truncnormal: { mu: 50e6, sigma: 20e6, min: 0, max: 200e6 }
};

export function createInspector(container, onChange) {
  let tree = null;
  let selectedId = null;

  function setTree(t)        { tree = t; render(); }
  function setSelection(id)  { selectedId = id; render(); }
  function refresh()         { render(); }

  function render() {
    if (!tree) { container.innerHTML = ''; return; }
    const n = selectedId ? getNode(tree, selectedId) : null;
    if (!n) {
      container.innerHTML = emptyHtml();
      return;
    }
    container.innerHTML = nodeHtml(tree, n);
    wireFields(container, tree, n, onChange);
  }

  return { setTree, setSelection, refresh };
}

function emptyHtml() {
  return `
    <div class="insp-empty">
      <div class="glyph">◎</div>
      <div class="msg">Select a node to edit it.</div>
    </div>`;
}

function nodeHtml(tree, n) {
  const parent = n.parentId ? getNode(tree, n.parentId) : null;
  const parts = [];

  // ---- Identity ---------------------------------------------------------
  parts.push(`
    <div class="section-title">Node</div>
    <div class="field">
      <label class="field-label" for="ne-label">Label</label>
      <input class="input" id="ne-label" type="text" value="${esc(n.label)}" placeholder="e.g. High uptake">
    </div>
    <div class="field-row">
      <div class="field">
        <label class="field-label" for="ne-type">Type</label>
        <select class="select" id="ne-type">
          <option value="decision" ${n.type === 'decision' ? 'selected' : ''}>Decision ◆</option>
          <option value="chance"   ${n.type === 'chance'   ? 'selected' : ''}>Chance ◎</option>
          <option value="terminal" ${n.type === 'terminal' ? 'selected' : ''}>Terminal ●</option>
        </select>
      </div>
      ${parent ? `
        <div class="field">
          <label class="field-label" for="ne-branch">Branch label</label>
          <input class="input" id="ne-branch" type="text" value="${esc(n.branchLabel || '')}" placeholder="e.g. Yes">
        </div>` : `<div class="field"></div>`}
    </div>
  `);

  // ---- Branch probability ----------------------------------------------
  if (parent && parent.type === 'chance') {
    parts.push(`
      <div class="section-title">Branch probability</div>
      ${inputDescriptorHtml('prob', n.branchProb, PROB_DIST_TYPES)}
    `);
  }

  // ---- Payoff -----------------------------------------------------------
  if (n.type === 'terminal') {
    parts.push(`
      <div class="section-title">Payoff</div>
      ${inputDescriptorHtml('pay', n.payoff, PAY_DIST_TYPES)}
    `);
  }

  // ---- Chance summary (sigma) ------------------------------------------
  if (n.type === 'chance') {
    const { sum, status } = chanceBranchSum(tree, n.id);
    const badgeCls = status === SIGMA_OK ? 'badge-ok'
                   : status === SIGMA_LOW ? 'badge-warn' : 'badge-err';
    const msg = status === SIGMA_OK ? `Σ = ${sum.toFixed(3)} ✓`
              : status === SIGMA_LOW ? `Σ = ${sum.toFixed(3)} — short`
              : `Σ = ${sum.toFixed(3)} — over`;
    parts.push(`
      <div class="section-title">Branches</div>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <span class="badge ${badgeCls}">${msg}</span>
        <span class="field-help">Normalised per-iteration.</span>
      </div>
    `);
  }

  // ---- Actions ----------------------------------------------------------
  parts.push(`
    <div class="section-title">Actions</div>
    ${n.type !== 'terminal' ? `
      <button class="btn btn-primary" id="ne-add" style="width:100%; margin-bottom:8px;">
        + Add child branch
      </button>` : ''}
    <button class="btn btn-danger" id="ne-del" style="width:100%;">
      Delete this node ${n.type !== 'terminal' ? '+ subtree' : ''}
    </button>
  `);

  return parts.join('');
}

function inputDescriptorHtml(prefix, input, distTypes) {
  const mode = input?.mode || 'fixed';
  const dt = input?.distType || distTypes[0];
  const params = input?.params || DIST_DEFAULTS[dt];

  const paramFields = distParamFields(prefix, dt, params);

  return `
    <div class="seg" style="margin-bottom:10px;" data-seg="${prefix}-mode">
      <button type="button" data-mode="fixed"        class="${mode === 'fixed' ? 'on' : ''}">Point estimate</button>
      <button type="button" data-mode="distribution" class="${mode === 'distribution' ? 'on' : ''}">Distribution</button>
    </div>
    ${mode === 'fixed' ? `
      <div class="field">
        <label class="field-label">Value</label>
        <input class="input" type="number" step="any" data-fixed="${prefix}" value="${input?.fixed ?? 0}">
      </div>
    ` : `
      <div class="field">
        <label class="field-label">Distribution</label>
        <select class="select" data-disttype="${prefix}">
          ${distTypes.map(t => `<option value="${t}" ${dt === t ? 'selected' : ''}>${DIST_NICE[t]}</option>`).join('')}
        </select>
      </div>
      ${paramFields}
    `}
  `;
}

function distParamFields(prefix, dt, params) {
  const p = { ...DIST_DEFAULTS[dt], ...(params || {}) };
  const f = (key, label) =>
    `<div class="field">
       <label class="field-label">${label}</label>
       <input class="input" type="number" step="any" data-param="${prefix}:${key}" value="${p[key] ?? 0}">
     </div>`;
  switch (dt) {
    case 'triangular':  return `<div class="field-row">${f('min', 'Min')}${f('mode', 'Mode')}</div>${f('max', 'Max')}`;
    case 'uniform':     return `<div class="field-row">${f('min', 'Min')}${f('max', 'Max')}</div>`;
    case 'beta':        return `<div class="field-row">${f('alpha', 'α')}${f('beta', 'β')}</div>`;
    case 'lognormal':   return `<div class="field-row">${f('mu', 'μ (log)')}${f('sigma', 'σ (log)')}</div>`;
    case 'truncnormal': return `<div class="field-row">${f('mu', 'μ')}${f('sigma', 'σ')}</div>
                                <div class="field-row">${f('min', 'Min')}${f('max', 'Max')}</div>`;
    default: return '';
  }
}

function wireFields(container, tree, node, onChange) {
  const $ = sel => container.querySelector(sel);
  const $$ = sel => container.querySelectorAll(sel);

  $('#ne-label')?.addEventListener('input', e => {
    node.label = e.target.value;
    onChange({ kind: 'label' });
  });

  $('#ne-type')?.addEventListener('change', e => {
    const wasTerminal = node.type === 'terminal';
    const wasChance = node.type === 'chance';
    node.type = e.target.value;
    // Ensure payoff exists for terminals.
    if (node.type === 'terminal' && !node.payoff) node.payoff = fixed(0);
    // Decision nodes never carry probability of their own (BRIEF §1a). The
    // branchProb belongs to the *child*; nothing to clean on the parent here.
    onChange({ kind: 'type', wasTerminal, wasChance });
  });

  $('#ne-branch')?.addEventListener('input', e => {
    node.branchLabel = e.target.value;
    onChange({ kind: 'branchLabel' });
  });

  // ----- mode + distribution wiring -------------------------------------
  for (const seg of $$('[data-seg]')) {
    const prefix = seg.dataset.seg.split('-')[0]; // 'prob' | 'pay'
    seg.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetField = prefix === 'prob' ? 'branchProb' : 'payoff';
        const cur = node[targetField] || fixed(0);
        node[targetField] = {
          ...cur,
          mode: btn.dataset.mode,
          distType: cur.distType || (prefix === 'prob' ? 'triangular' : 'triangular'),
          params:   cur.params   || { ...DIST_DEFAULTS[cur.distType || 'triangular'] }
        };
        onChange({ kind: 'distMode' });
      });
    });
  }

  for (const inp of $$('[data-fixed]')) {
    inp.addEventListener('input', e => {
      const prefix = e.target.dataset.fixed;
      const targetField = prefix === 'prob' ? 'branchProb' : 'payoff';
      const val = parseFloat(e.target.value);
      node[targetField] = { ...(node[targetField] || {}), fixed: Number.isFinite(val) ? val : 0, mode: 'fixed', distType: null, params: {} };
      onChange({ kind: 'fixed', noRedrawInspector: true });
    });
  }

  for (const sel of $$('[data-disttype]')) {
    sel.addEventListener('change', e => {
      const prefix = e.target.dataset.disttype;
      const targetField = prefix === 'prob' ? 'branchProb' : 'payoff';
      const newType = e.target.value;
      node[targetField] = {
        ...(node[targetField] || {}),
        mode: 'distribution',
        distType: newType,
        params: { ...DIST_DEFAULTS[newType] }
      };
      onChange({ kind: 'distType' });
    });
  }

  for (const inp of $$('[data-param]')) {
    inp.addEventListener('input', e => {
      const [prefix, key] = e.target.dataset.param.split(':');
      const targetField = prefix === 'prob' ? 'branchProb' : 'payoff';
      const val = parseFloat(e.target.value);
      const target = node[targetField] || { mode: 'distribution', distType: 'triangular', params: {}, fixed: 0 };
      target.params = { ...target.params, [key]: Number.isFinite(val) ? val : 0 };
      // Refresh `fixed` to the mean so toggling back to fixed shows a sane value.
      target.fixed = meanOfInput(target);
      node[targetField] = target;
      onChange({ kind: 'distParam', noRedrawInspector: true });
    });
  }

  $('#ne-add')?.addEventListener('click', () => {
    const child = addNode(tree, {
      parentId: node.id,
      type: 'terminal',
      label: 'New branch',
      branchLabel: 'New branch',
      x: node.x + 280,
      y: node.y + 60,
      branchProb: tri(0.3, 0.5, 0.7),
      payoff: tri(0, 0, 0)
    });
    onChange({ kind: 'addChild', newNodeId: child.id });
  });

  $('#ne-del')?.addEventListener('click', () => {
    removeSubtree(tree, node.id);
    onChange({ kind: 'delete' });
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
