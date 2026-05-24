// Arbor v3 — application entry.
// Composes the canvas, inspector, dashboard, animation, popovers, modal, and
// the simulation engine. No framework — just plain ES modules.

import { createCanvasController } from './canvas/canvas.js';
import { createHoverPopover } from './canvas/hoverActions.js';
import { createInspector } from './ui/inspector.js';
import { createDashboard } from './ui/dashboard.js';
import { createAnimation } from './ui/animation.js';
import { createProModal } from './ui/modals.js';
import { initTheme, mountThemeToggle } from './ui/themeToggle.js';

import { saveTree, loadTree } from './model/persistence.js';
import {
  defaultHydrogenTree, addNode, getNode, rootOf, childrenOf,
  fixed, tri
} from './model/tree.js';

import { rollbackMean, rollbackOnce } from './sim/rollback.js';
import { runMonteCarloChunked } from './sim/monteCarlo.js';
import { makeRng } from './sim/rng.js';

const fmt = (v, cur = '$') => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${cur}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${cur}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${cur}${(a / 1e3).toFixed(1)}K`;
  return `${s}${cur}${a.toFixed(0)}`;
};

// ── 0. Theme + state ────────────────────────────────────────────────────
initTheme();

let tree = loadTree() || defaultHydrogenTree();
let lastResult = null;
let isSimulating = false;

// ── 1. Mount controllers ────────────────────────────────────────────────
const canvasEl = document.getElementById('canvas');
const canvasWrap = document.getElementById('canvas-wrap');
const canvasCtl = createCanvasController(canvasEl);

const inspectorEl = document.getElementById('inspector-body');
const inspector = createInspector(inspectorEl, onInspectorChange);

const dashboardEl = document.getElementById('dashboard');
const dashboard = createDashboard(dashboardEl);

const animation = createAnimation(canvasWrap, canvasCtl);
const proModal = createProModal();

const hoverPopover = createHoverPopover((type, ctx) => {
  // Add a child of the selected type next to the parent.
  const parent = ctx.node;
  const offsetY = childrenOf(tree, parent.id).length * 80;
  const child = addNode(tree, {
    parentId: parent.id,
    type: type,
    label: type === 'decision' ? 'Decision' : type === 'chance' ? 'Chance' : 'Outcome',
    branchLabel: parent.type === 'chance' ? 'New branch' : (type === 'decision' ? 'Option' : ''),
    x: parent.x + 280,
    y: parent.y + offsetY,
    branchProb: parent.type === 'chance' ? tri(0.30, 0.50, 0.70) : fixed(1),
    payoff: type === 'terminal' ? tri(0, 10e6, 20e6) : fixed(0)
  });
  canvasCtl.setSelection(child.id);
  inspector.setSelection(child.id);
  redraw();
  persist();
});

// Theme toggle — placed in the header, refreshes the canvas palette on change.
const themeBtn = mountThemeToggle(document.getElementById('header-actions-pre'), () => {
  canvasCtl.refreshTheme();
  if (lastResult) dashboard.render(lastResult, tree.meta.currency);
});

// ── 2. Wire canvas → inspector ──────────────────────────────────────────
canvasCtl.on('select', ({ node }) => {
  inspector.setSelection(node.id);
});
canvasCtl.on('background', () => {
  inspector.setSelection(null);
});
canvasCtl.on('hoverPlus', ({ node, screenX, screenY }) => {
  hoverPopover.show(screenX, screenY, { node });
});
canvasCtl.on('move', () => {
  persist();
});

// ── 3. Header buttons ───────────────────────────────────────────────────
document.getElementById('btn-layout').addEventListener('click', () => {
  canvasCtl.autoLayout();
  redraw();
  persist();
});

document.getElementById('btn-new').addEventListener('click', () => {
  if (!confirm('Replace the current tree with a new one?')) return;
  tree = defaultHydrogenTree();
  lastResult = null;
  canvasCtl.setTree(tree);
  inspector.setTree(tree);
  inspector.setSelection(null);
  dashboard.clear();
  recomputeBestPath();
  persist();
});

document.getElementById('btn-simulate').addEventListener('click', runSimulation);

document.getElementById('btn-export-pdf').addEventListener('click', () => proModal.show('pdf'));
document.getElementById('btn-export-svg').addEventListener('click', () => proModal.show('svg'));
document.getElementById('btn-export-xlsx').addEventListener('click', () => proModal.show('excel'));

// ── 4. Initial render ───────────────────────────────────────────────────
inspector.setTree(tree);
// Defer the canvas-size-dependent setup to the next frame so the browser has
// completed layout (otherwise getBoundingClientRect() can return 0 on first
// paint and fit-to-content sets zoom to 0 — empty canvas).
requestAnimationFrame(() => {
  canvasCtl.resize();
  canvasCtl.setTree(tree);
  recomputeBestPath();
  updateHeaderStats();
});

// ── 5. Wiring helpers ───────────────────────────────────────────────────
function onInspectorChange(evt) {
  // The inspector mutated `tree` in place. Sync canvas + persistence.
  if (evt.kind === 'delete') {
    inspector.setSelection(null);
    canvasCtl.setSelection(null);
  } else if (evt.kind === 'addChild' && evt.newNodeId) {
    canvasCtl.setSelection(evt.newNodeId);
    inspector.setSelection(evt.newNodeId);
  }
  redraw();
  if (!evt.noRedrawInspector) inspector.refresh();
  persist();
}

function redraw() {
  recomputeBestPath();
  canvasCtl.draw();
  updateHeaderStats();
}

function recomputeBestPath() {
  // Mean-state rollback to highlight the best path on the canvas. The Monte
  // Carlo run later may shift this if the optimal decision moves across
  // iterations — we keep this as the at-rest indicator.
  const root = rootOf(tree);
  if (!root) { canvasCtl.setBestPath([]); return; }
  const ids = bestPathFromMean(tree);
  canvasCtl.setBestPath(ids);
}

// Trace the optimal-decision path with mean-state rollback and return node ids.
function bestPathFromMean(tree) {
  const root = rootOf(tree);
  if (!root) return [];
  const ids = [root.id];

  function walk(node) {
    const kids = childrenOf(tree, node.id);
    if (!kids.length) return;
    if (node.type === 'decision') {
      // Pick child with max mean-state EV.
      let best = null;
      let bestEv = -Infinity;
      for (const k of kids) {
        const ev = subtreeMeanEv(k);
        if (ev > bestEv) { bestEv = ev; best = k; }
      }
      if (best) { ids.push(best.id); walk(best); }
    } else if (node.type === 'chance') {
      // Most-likely branch for path-display purposes.
      let best = null, bestP = -1;
      for (const k of kids) {
        const p = k.branchProb?.fixed ?? 0;
        if (p > bestP) { bestP = p; best = k; }
      }
      if (best) { ids.push(best.id); walk(best); }
    }
  }
  walk(root);
  return ids;
}

function subtreeMeanEv(node) {
  const kids = childrenOf(tree, node.id);
  if (node.type === 'terminal') {
    return node.payoff?.fixed ?? 0;
  }
  if (!kids.length) return 0;
  if (node.type === 'decision') {
    return kids.reduce((m, k) => Math.max(m, subtreeMeanEv(k)), -Infinity);
  }
  // chance — weighted sum with normalised mean probs
  const ws = kids.map(k => k.branchProb?.fixed ?? 0);
  const sum = ws.reduce((s, v) => s + v, 0) || 1;
  return kids.reduce((acc, k, i) => acc + (ws[i] / sum) * subtreeMeanEv(k), 0);
}

function updateHeaderStats() {
  const root = rootOf(tree);
  const cur = tree.meta?.currency || '$';
  const evStat = document.getElementById('h-ev');
  const seedStat = document.getElementById('h-seed');
  const iterStat = document.getElementById('h-iter');
  const nodeStat = document.getElementById('h-nodes');
  if (evStat) {
    if (lastResult) evStat.textContent = fmt(lastResult.summary.mean, cur);
    else if (root) evStat.textContent = fmt(rollbackMean(tree).ev, cur) + ' ~';
    else evStat.textContent = '—';
  }
  if (seedStat) seedStat.textContent = String(tree.meta?.seed ?? 42);
  if (iterStat) iterStat.textContent = String(tree.meta?.iterations ?? 10000);
  if (nodeStat) nodeStat.textContent = String(tree.nodes.length);
}

function persist() {
  saveTree(tree);
}

// ── 6. Simulation ───────────────────────────────────────────────────────
async function runSimulation() {
  if (isSimulating) return;
  if (!rootOf(tree)) { alert('Add a root node first.'); return; }
  isSimulating = true;

  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-bar-text');
  const statusFill = document.getElementById('status-bar-fill');
  statusBar.classList.add('show');
  statusText.textContent = 'Initialising…';
  statusFill.style.width = '0%';

  // Pre-sample a batch of paths to feed the animation's exploration phase.
  // Using a separate RNG so it doesn't disturb the production simulation's
  // determinism (the sim re-makes the RNG from the seed below).
  const previewRng = makeRng((tree.meta.seed | 0) + 7);
  const previewPaths = [];
  for (let i = 0; i < 60; i++) {
    const { ev, optimalPath } = rollbackOnce(tree, previewRng);
    previewPaths.push(pathIdsFromLabels(optimalPath));
  }

  // Kick off the animation in parallel with the MC.
  const animPromise = animation.play({
    getSampledPaths: () => previewPaths,
    getBestPath:     () => bestPathFromMean(tree),
    getNodeById:     id => getNode(tree, id)
  });

  const result = await runMonteCarloChunked(tree, {
    seed: tree.meta.seed,
    iterations: tree.meta.iterations,
    onProgress: ({ iterations, total }) => {
      const pct = total ? Math.round(iterations / total * 100) : 0;
      statusText.textContent = `Iteration ${iterations.toLocaleString()} / ${total.toLocaleString()}`;
      statusFill.style.width = pct + '%';
    }
  });

  await animPromise;

  lastResult = result;
  dashboard.render(result, tree.meta.currency);
  dashboardEl.classList.remove('collapsed');
  document.getElementById('dash-toggle').textContent = 'Hide';
  updateHeaderStats();

  statusText.textContent = `Done · mean ${fmt(result.summary.mean, tree.meta.currency)} · stdev ${fmt(result.summary.stdev, tree.meta.currency)}`;
  statusFill.style.width = '100%';
  setTimeout(() => statusBar.classList.remove('show'), 2400);

  isSimulating = false;
}

// Map an optimalPath (branch labels) into node ids by walking the tree from
// the root and matching branchLabel at each step. Used for animation.
function pathIdsFromLabels(pathLabels) {
  const root = rootOf(tree);
  if (!root) return [];
  const ids = [root.id];
  let cur = root;
  for (const label of pathLabels) {
    const kids = childrenOf(tree, cur.id);
    const match = kids.find(k => (k.branchLabel || k.label) === label);
    if (!match) break;
    ids.push(match.id);
    cur = match;
  }
  return ids;
}
