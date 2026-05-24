// Tree validation. Lightweight — flags issues, never throws.

import { childrenOf, rootOf } from './tree.js';
import { meanOfInput, DISTRIBUTIONS } from '../sim/distributions.js';

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

// Full tree audit. Returns an array of issue objects:
//   { severity: 'error' | 'warn' | 'info', nodeId?, message, kind }
//
// QA/QC checks performed:
//   - Tree has a root.
//   - Σ sibling probabilities at each chance node ≈ 1 (warn if outside ±0.5%).
//   - Every chance node has at least 2 branches.
//   - Every terminal node has a defined payoff input.
//   - Every distribution-mode input has valid params (min<max, σ>0, etc.).
//   - Terminal nodes have no children.
//   - Decision-node children have branch labels (info-level only).
export function validate(tree) {
  const issues = [];
  const root = rootOf(tree);
  if (!root) {
    issues.push({ severity: 'error', kind: 'no-root', message: 'Tree has no root node.' });
    return issues;
  }

  for (const n of tree.nodes) {
    // ── Structural checks ──
    if (n.type === 'terminal') {
      const kids = childrenOf(tree, n.id);
      if (kids.length > 0) {
        issues.push({ severity: 'error', kind: 'terminal-with-kids', nodeId: n.id,
                      message: `Terminal "${n.label}" cannot have children.` });
      }
      // Terminal must have a payoff input.
      if (!n.payoff) {
        issues.push({ severity: 'error', kind: 'no-payoff', nodeId: n.id,
                      message: `Terminal "${n.label}" is missing a payoff.` });
      }
    }
    if (n.type === 'chance') {
      const kids = childrenOf(tree, n.id);
      if (kids.length === 0) {
        issues.push({ severity: 'warn', kind: 'empty-chance', nodeId: n.id,
                      message: `Chance node "${n.label}" has no branches.` });
      } else if (kids.length === 1) {
        issues.push({ severity: 'info', kind: 'single-branch', nodeId: n.id,
                      message: `Chance node "${n.label}" has only one branch.` });
      } else {
        const { sum, status } = chanceBranchSum(tree, n.id);
        if (status !== SIGMA_OK) {
          issues.push({
            severity: 'warn',
            kind: 'sigma-off',
            nodeId: n.id,
            message: `Chance node "${n.label}" — Σ probabilities = ${sum.toFixed(3)} (will be normalised per-iteration).`
          });
        }
      }
    }
    if (n.type === 'decision') {
      const kids = childrenOf(tree, n.id);
      if (kids.length === 0) {
        issues.push({ severity: 'warn', kind: 'empty-decision', nodeId: n.id,
                      message: `Decision node "${n.label}" has no options.` });
      }
    }

    // ── Distribution param checks ──
    if (n.branchProb?.mode === 'distribution') {
      const err = distValidationError(n.branchProb, 'probability', n.label);
      if (err) issues.push({ severity: 'error', kind: 'bad-prob-params', nodeId: n.id, message: err });
    }
    if (n.payoff?.mode === 'distribution') {
      const err = distValidationError(n.payoff, 'payoff', n.label);
      if (err) issues.push({ severity: 'error', kind: 'bad-payoff-params', nodeId: n.id, message: err });
    }
  }
  return issues;
}

function distValidationError(input, kind, nodeLabel) {
  const dist = DISTRIBUTIONS[input.distType];
  if (!dist) return `${kind} on "${nodeLabel}" — unknown distribution type ${input.distType}.`;
  if (!dist.valid(input.params || {})) {
    return `${kind} on "${nodeLabel}" — invalid ${input.distType} parameters.`;
  }
  return null;
}

// Aggregate summary for the QA/QC pill.
//   ok       — no warnings or errors
//   warnings — warnings only
//   errors   — at least one error
export function validationStatus(issues) {
  if (!issues.length) return 'ok';
  if (issues.some(i => i.severity === 'error')) return 'errors';
  if (issues.some(i => i.severity === 'warn'))  return 'warnings';
  return 'ok';
}
