// Tree validation. Lightweight — flags issues, never throws.

import { childrenOf, rootOf } from './tree.js';
import { meanOfInput } from '../sim/distributions.js';

export const SIGMA_OK     = 'ok';     // |Σp − 1| < 0.005
export const SIGMA_LOW    = 'low';    // Σp < 1 − 0.005
export const SIGMA_HIGH   = 'high';   // Σp > 1 + 0.005

// For a chance node, return the mean of each child's branchProb and the
// status of their sum. (Per-iteration normalisation still applies in the
// simulator; this is for the inspector display only.)
export function chanceBranchSum(tree, chanceNodeId) {
  const kids = childrenOf(tree, chanceNodeId);
  const probs = kids.map(k => meanOfInput(k.branchProb));
  const sum = probs.reduce((s, v) => s + v, 0);
  let status = SIGMA_OK;
  if (sum < 1 - 0.005) status = SIGMA_LOW;
  else if (sum > 1 + 0.005) status = SIGMA_HIGH;
  return { sum, status, probs };
}

// Full tree audit. Returns an array of issue objects.
export function validate(tree) {
  const issues = [];
  const root = rootOf(tree);
  if (!root) {
    issues.push({ severity: 'error', message: 'Tree has no root node.' });
    return issues;
  }
  for (const n of tree.nodes) {
    if (n.type === 'chance') {
      const kids = childrenOf(tree, n.id);
      if (kids.length === 0) {
        issues.push({ severity: 'warn', nodeId: n.id, message: `Chance node "${n.label}" has no branches.` });
      } else {
        const { sum, status } = chanceBranchSum(tree, n.id);
        if (status !== SIGMA_OK) {
          issues.push({
            severity: 'warn',
            nodeId: n.id,
            message: `Chance node "${n.label}" branch probabilities sum to ${sum.toFixed(3)} (will be normalised per-iteration).`
          });
        }
      }
    }
    if (n.type === 'terminal') {
      const kids = childrenOf(tree, n.id);
      if (kids.length > 0) {
        issues.push({ severity: 'error', nodeId: n.id, message: `Terminal node "${n.label}" cannot have children.` });
      }
    }
  }
  return issues;
}
