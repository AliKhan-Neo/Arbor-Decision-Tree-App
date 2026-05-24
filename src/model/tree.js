// Tree data model.
//
// Schema (v3):
//   tree = { schemaVersion, meta, nodes, nextId }
//   meta = { title, date, currency, seed, iterations }
//   node = {
//     id,                 // string, unique within tree
//     parentId,           // string | null
//     type,               // 'decision' | 'chance' | 'terminal'
//     label,              // node title shown in the canvas
//     branchLabel,        // edge label (parent -> this); empty string for roots
//     x, y,               // world coordinates
//     branchProb,         // input descriptor — used iff parent is 'chance'
//     payoff              // input descriptor — used iff type === 'terminal'
//   }
//
// Input descriptor:
//   { mode: 'fixed' | 'distribution', fixed, distType, params }
//
// Methodological constraint (BRIEF §1):
//   - Decision nodes never have branchProb.
//   - Terminal nodes never have children.
//   - Sibling branchProb is normalised PER ITERATION (in /sim/rollback.js),
//     never pre-normalised on the model.

export const SCHEMA_VERSION = '3.0';
export const DEFAULT_CURRENCY = '$';

export function fixed(value) {
  return { mode: 'fixed', fixed: value, distType: null, params: {} };
}

export function tri(min, mode, max) {
  return { mode: 'distribution', fixed: mode, distType: 'triangular', params: { min, mode, max } };
}

export function uni(min, max) {
  return { mode: 'distribution', fixed: (min + max) / 2, distType: 'uniform', params: { min, max } };
}

export function betaInput(alpha, b) {
  return { mode: 'distribution', fixed: alpha / (alpha + b), distType: 'beta', params: { alpha, beta: b } };
}

export function logn(mu, sigma) {
  return { mode: 'distribution', fixed: Math.exp(mu + sigma * sigma / 2), distType: 'lognormal', params: { mu, sigma } };
}

export function tnorm(mu, sigma, min, max) {
  return { mode: 'distribution', fixed: mu, distType: 'truncnormal', params: { mu, sigma, min, max } };
}

export function newTree(title = 'Untitled Decision') {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      title,
      date: new Date().toISOString(),
      currency: DEFAULT_CURRENCY,
      seed: 42,
      iterations: 10000
    },
    nodes: [],
    nextId: 1
  };
}

export function addNode(tree, partial) {
  const id = `n${tree.nextId++}`;
  const node = {
    id,
    parentId: null,
    type: 'decision',
    label: '',
    branchLabel: '',
    x: 0,
    y: 0,
    branchProb: fixed(1),
    payoff: fixed(0),
    ...partial
  };
  tree.nodes.push(node);
  return node;
}

export function getNode(tree, id) {
  return tree.nodes.find(n => n.id === id) || null;
}

export function childrenOf(tree, id) {
  return tree.nodes.filter(n => n.parentId === id);
}

export function rootOf(tree) {
  return tree.nodes.find(n => n.parentId === null) || null;
}

export function removeSubtree(tree, id) {
  const toRemove = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const pid = queue.shift();
    for (const n of tree.nodes) {
      if (n.parentId === pid && !toRemove.has(n.id)) {
        toRemove.add(n.id);
        queue.push(n.id);
      }
    }
  }
  tree.nodes = tree.nodes.filter(n => !toRemove.has(n.id));
}

// ============================================================================
// Default tree: Hydrogen market-entry decision.
// Designed to demonstrate Monte Carlo with triangular payoffs on all terminals,
// and triangular probabilities on chance branches. Per BRIEF §0 the reference
// rollback yields EV ~$38M with transport-focus optimal in the majority of
// iterations.
// ============================================================================

export function defaultHydrogenTree() {
  const t = newTree('Hydrogen Market Entry');
  t.meta.currency = '$';

  // Root decision.
  const root = addNode(t, {
    parentId: null,
    type: 'decision',
    label: 'Entry Strategy',
    x: 120, y: 320
  });

  // Decision option 1: Industrial / transport focus.
  const transport = addNode(t, {
    parentId: root.id,
    type: 'chance',
    label: 'Industrial / Transport',
    branchLabel: 'Transport focus',
    x: 420, y: 140
  });

  addNode(t, {
    parentId: transport.id,
    type: 'terminal',
    label: 'High uptake',
    branchLabel: 'High uptake',
    x: 760, y: 60,
    branchProb: tri(0.40, 0.55, 0.70),
    payoff: tri(80e6, 130e6, 200e6)
  });
  addNode(t, {
    parentId: transport.id,
    type: 'terminal',
    label: 'Medium uptake',
    branchLabel: 'Medium uptake',
    x: 760, y: 150,
    branchProb: tri(0.20, 0.30, 0.40),
    payoff: tri(20e6, 50e6, 90e6)
  });
  addNode(t, {
    parentId: transport.id,
    type: 'terminal',
    label: 'Low uptake',
    branchLabel: 'Low uptake',
    x: 760, y: 240,
    branchProb: tri(0.05, 0.15, 0.25),
    payoff: tri(-30e6, -10e6, 20e6)
  });

  // Decision option 2: Residential / heating focus.
  const heating = addNode(t, {
    parentId: root.id,
    type: 'chance',
    label: 'Residential / Heating',
    branchLabel: 'Heating focus',
    x: 420, y: 360
  });

  addNode(t, {
    parentId: heating.id,
    type: 'terminal',
    label: 'Strong subsidy',
    branchLabel: 'Strong subsidy',
    x: 760, y: 320,
    branchProb: tri(0.30, 0.40, 0.50),
    payoff: tri(40e6, 70e6, 110e6)
  });
  addNode(t, {
    parentId: heating.id,
    type: 'terminal',
    label: 'Modest subsidy',
    branchLabel: 'Modest subsidy',
    x: 760, y: 410,
    branchProb: tri(0.35, 0.45, 0.55),
    payoff: tri(10e6, 30e6, 60e6)
  });
  addNode(t, {
    parentId: heating.id,
    type: 'terminal',
    label: 'No subsidy',
    branchLabel: 'No subsidy',
    x: 760, y: 500,
    branchProb: tri(0.10, 0.15, 0.20),
    payoff: tri(-40e6, -20e6, 5e6)
  });

  // Decision option 3: Defer.
  addNode(t, {
    parentId: root.id,
    type: 'terminal',
    label: 'Defer entry',
    branchLabel: 'Wait & see',
    x: 420, y: 560,
    payoff: tri(-5e6, 0, 10e6)
  });

  return t;
}
