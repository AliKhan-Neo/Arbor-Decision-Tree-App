// Per-iteration rollback engine.
//
// Methodological invariants (BRIEF §1):
//  (a) Probability distributions exist ONLY on chance-node branches.
//      Payoff distributions exist ONLY on terminal nodes.
//      Decision nodes never carry random variables.
//  (b) Once a value is stochastic it stays stochastic. We sample per iteration.
//  (c) Sibling chance probabilities normalise to 1 PER ITERATION — not on the
//      saved tree, not as a pre-pass. The user's mean-of-distribution values
//      may already sum to ~1, but each iteration samples fresh draws that
//      then get renormalised.
//  (d) EV is computed per iteration; the Monte-Carlo aggregator averages those
//      per-iteration EVs. We never roll back means (Jensen's inequality).
//  (e) The optimal decision can change across iterations. That's a feature —
//      see /sim/monteCarlo.js for stability aggregation.

import { sampleInput, meanOfInput } from './distributions.js';
import { childrenOf, rootOf } from '../model/tree.js';

// Build a child-lookup index so rollback is O(N) per iteration, not O(N²).
function indexTree(tree) {
  const childIdx = new Map();
  for (const n of tree.nodes) {
    if (!childIdx.has(n.parentId)) childIdx.set(n.parentId, []);
    childIdx.get(n.parentId).push(n);
  }
  return childIdx;
}

// Single rollback pass given a sampler `sampleAt(input, key)` that yields the
// value to use for a given input. `key` is a stable identifier so callers can
// override specific inputs (used by sensitivity & tornado).
//
// Returns { ev, optimalPath } where optimalPath is an array of branchLabels
// (root -> terminal) following the maximising-EV choice at each decision node.
function rollbackWith(tree, sampleAt) {
  const root = rootOf(tree);
  if (!root) return { ev: 0, optimalPath: [] };
  const childIdx = indexTree(tree);

  function rollback(node) {
    const kids = childIdx.get(node.id) || [];

    if (node.type === 'terminal') {
      const v = sampleAt(node.payoff, `payoff:${node.id}`);
      return { ev: v, branchOf: null };
    }

    if (node.type === 'chance') {
      // (c) per-iteration normalisation of sampled sibling weights.
      const raw = kids.map(k => sampleAt(k.branchProb, `prob:${k.id}`));
      const sum = raw.reduce((s, v) => s + v, 0) || 1;
      const norm = raw.map(v => v / sum);
      let ev = 0;
      let branchOf = null;
      for (let i = 0; i < kids.length; i++) {
        const sub = rollback(kids[i]);
        ev += norm[i] * sub.ev;
        // record subtree choices: chance nodes don't make a choice — propagate
        // the dominant child's path purely for reporting (most-likely outcome).
        if (branchOf === null || norm[i] > branchOf.weight) {
          branchOf = { node: kids[i], weight: norm[i], sub };
        }
      }
      return { ev, branchOf };
    }

    // type === 'decision' — pick max EV. (a) no probability sampled here.
    let best = null;
    for (const k of kids) {
      const sub = rollback(k);
      if (best === null || sub.ev > best.sub.ev) {
        best = { node: k, sub };
      }
    }
    if (!best) return { ev: 0, branchOf: null };
    return { ev: best.sub.ev, branchOf: { node: best.node, sub: best.sub } };
  }

  // Trace the optimal-decision path. At chance nodes we DO follow the
  // most-likely branch so the path string remains stable enough for the
  // stability table to be meaningful, but the EV calculation above already
  // accounts for the full chance distribution.
  function tracePath(node, sub) {
    const out = [];
    let cur = sub;
    let n = node;
    while (cur && cur.branchOf) {
      out.push(cur.branchOf.node.branchLabel || cur.branchOf.node.label);
      n = cur.branchOf.node;
      cur = cur.branchOf.sub;
    }
    return out;
  }

  const result = rollback(root);
  return { ev: result.ev, optimalPath: tracePath(root, result) };
}

// Stochastic rollback — samples every distribution-mode input via the rng.
// `overrides`: Map<key, value> to pin specific inputs (used by tornado).
export function rollbackOnce(tree, rng, overrides = null) {
  const sampler = (input, key) => {
    if (overrides && overrides.has(key)) return overrides.get(key);
    return sampleInput(input, rng);
  };
  return rollbackWith(tree, sampler);
}

// Deterministic rollback where every input is at its distribution mean
// (or its fixed value). This is the tornado baseline (BRIEF §1(f)).
export function rollbackMean(tree, overrides = null) {
  const sampler = (input, key) => {
    if (overrides && overrides.has(key)) return overrides.get(key);
    return meanOfInput(input);
  };
  return rollbackWith(tree, sampler);
}

// Collect every distribution-mode input in the tree (branch probs + payoffs).
// Used by sensitivity (Phase 3) and tornado.
export function listDistributionInputs(tree) {
  const out = [];
  for (const n of tree.nodes) {
    if (n.parentId !== null) {
      const parent = tree.nodes.find(x => x.id === n.parentId);
      if (parent && parent.type === 'chance' && n.branchProb?.mode === 'distribution') {
        out.push({
          key: `prob:${n.id}`,
          kind: 'probability',
          nodeId: n.id,
          label: `${parent.label} → ${n.branchLabel || n.label}`,
          input: n.branchProb
        });
      }
    }
    if (n.type === 'terminal' && n.payoff?.mode === 'distribution') {
      out.push({
        key: `payoff:${n.id}`,
        kind: 'payoff',
        nodeId: n.id,
        label: `${n.label} (payoff)`,
        input: n.payoff
      });
    }
  }
  return out;
}
