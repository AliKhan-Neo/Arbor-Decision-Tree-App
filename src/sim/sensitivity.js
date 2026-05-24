// 2-variable sensitivity heatmap engine. Phase 3 fully implements this.
// Phase 1 ships the stub + the input-listing helper so the UI can wire
// the dropdowns early.

import { listDistributionInputs } from './rollback.js';

export function availableInputs(tree) {
  return listDistributionInputs(tree);
}

export function canRunHeatmap(tree) {
  return availableInputs(tree).length >= 2;
}

// Placeholder. Phase 3 will sweep 20×20 over [P5, P95] of each input,
// running a 1k-iter reduced MC at each cell.
export function runHeatmap(/* tree, inputAKey, inputBKey, opts */) {
  throw new Error('runHeatmap: implemented in Phase 3.');
}
