// Arbor v3 — engine test suite.
// 35 tests covering RNG, distributions, tree model, validation, rollback,
// Monte Carlo aggregation. No external test runner — vanilla Node ESM.
//
// Run with:   node tests/engine.test.js

import { makeRng, sampleNormal } from '../src/sim/rng.js';
import {
  triangular, uniform, beta, lognormal, truncnormal,
  sampleInput, meanOfInput, stdevOfInput
} from '../src/sim/distributions.js';
import {
  newTree, addNode, getNode, rootOf, childrenOf, removeSubtree,
  defaultHydrogenTree, fixed, tri
} from '../src/model/tree.js';
import {
  chanceBranchSum, validate, SIGMA_OK
} from '../src/model/validation.js';
import {
  rollbackOnce, rollbackMean, listDistributionInputs
} from '../src/sim/rollback.js';
import { runMonteCarlo } from '../src/sim/monteCarlo.js';

// ── Tiny test runner ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name}\n    ${e.message}`);
  }
}

function group(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function approx(a, b, tol = 1e-6, msg) {
  if (Math.abs(a - b) > tol) throw new Error(msg || `expected ${a} ≈ ${b} (±${tol})`);
}
function close(a, b, relTol = 0.05) {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  if (Math.abs(a - b) / denom > relTol) {
    throw new Error(`expected ${a} close to ${b} (rel tol ${relTol})`);
  }
}

// ── 1. RNG ────────────────────────────────────────────────────────────────
group('RNG', () => {
  test('1. same seed gives identical sequence', () => {
    const r1 = makeRng(42), r2 = makeRng(42);
    for (let i = 0; i < 100; i++) assert(r1() === r2(), 'streams diverged');
  });
  test('2. different seeds diverge', () => {
    const r1 = makeRng(1), r2 = makeRng(2);
    let same = 0;
    for (let i = 0; i < 10; i++) if (r1() === r2()) same++;
    assert(same < 10, 'too many collisions');
  });
  test('3. RNG outputs are in [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      assert(v >= 0 && v < 1, `value ${v} out of range`);
    }
  });
});

// ── 2. Distributions ──────────────────────────────────────────────────────
group('Distributions', () => {
  test('4. triangular samples in [min, max]', () => {
    const rng = makeRng(7);
    const p = { min: 0, mode: 3, max: 10 };
    for (let i = 0; i < 500; i++) {
      const v = triangular.sample(p, rng);
      assert(v >= p.min - 1e-9 && v <= p.max + 1e-9, `oob ${v}`);
    }
  });
  test('5. triangular mean matches (min+mode+max)/3', () => {
    approx(triangular.mean({ min: 0, mode: 3, max: 10 }), 13 / 3);
  });
  test('6. triangular p5 < p95', () => {
    const p = { min: 0, mode: 3, max: 10 };
    assert(triangular.p5(p) < triangular.p95(p));
  });
  test('7. uniform samples in [min, max]', () => {
    const rng = makeRng(2);
    for (let i = 0; i < 500; i++) {
      const v = uniform.sample({ min: 5, max: 15 }, rng);
      assert(v >= 5 && v <= 15);
    }
  });
  test('8. uniform mean = (min+max)/2', () => {
    approx(uniform.mean({ min: 5, max: 15 }), 10);
  });
  test('9. uniform stdev = (max-min)/√12', () => {
    approx(uniform.stdev({ min: 0, max: 12 }), 12 / Math.sqrt(12), 1e-9);
  });
  test('10. beta samples in (0, 1)', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 300; i++) {
      const v = beta.sample({ alpha: 4, beta: 4 }, rng);
      assert(v > 0 && v < 1, `oob ${v}`);
    }
  });
  test('11. beta mean = α/(α+β)', () => {
    approx(beta.mean({ alpha: 3, beta: 7 }), 0.3);
  });
  test('12. beta α=β=2 sample mean ≈ 0.5', () => {
    const rng = makeRng(13);
    let s = 0;
    for (let i = 0; i < 2000; i++) s += beta.sample({ alpha: 2, beta: 2 }, rng);
    close(s / 2000, 0.5, 0.05);
  });
  test('13. lognormal samples positive', () => {
    const rng = makeRng(17);
    for (let i = 0; i < 200; i++) {
      const v = lognormal.sample({ mu: 0, sigma: 1 }, rng);
      assert(v > 0, `not positive ${v}`);
    }
  });
  test('14. lognormal mean matches exp(μ+σ²/2)', () => {
    approx(lognormal.mean({ mu: 1, sigma: 0.5 }), Math.exp(1.125), 1e-9);
  });
  test('15. truncnormal samples in [min, max]', () => {
    const rng = makeRng(23);
    const p = { mu: 50e6, sigma: 25e6, min: 0, max: 100e6 };
    for (let i = 0; i < 500; i++) {
      const v = truncnormal.sample(p, rng);
      assert(v >= p.min && v <= p.max, `oob ${v}`);
    }
  });
  test('16. truncnormal mean falls within (min, max)', () => {
    const p = { mu: 50, sigma: 20, min: 0, max: 100 };
    const m = truncnormal.mean(p);
    assert(m > 0 && m < 100, `mean ${m} out of [0,100]`);
  });
  test('17. sampleInput honours fixed mode', () => {
    const rng = makeRng(1);
    const inp = { mode: 'fixed', fixed: 7, distType: null, params: {} };
    assert(sampleInput(inp, rng) === 7);
  });
  test('18. sampleInput falls back to fixed on invalid params', () => {
    const rng = makeRng(1);
    const inp = { mode: 'distribution', fixed: 5, distType: 'triangular', params: { min: 1, mode: 0, max: 0 } };
    assert(sampleInput(inp, rng) === 5);
  });
});

// ── 3. Tree model ─────────────────────────────────────────────────────────
group('Tree model', () => {
  test('19. newTree has no nodes', () => {
    const t = newTree();
    assert(t.nodes.length === 0);
    assert(t.schemaVersion === '3.0');
  });
  test('20. addNode assigns sequential ids', () => {
    const t = newTree();
    const a = addNode(t, {});
    const b = addNode(t, {});
    assert(a.id === 'n1' && b.id === 'n2');
  });
  test('21. removeSubtree drops descendants', () => {
    const t = newTree();
    const root = addNode(t, { parentId: null });
    const a = addNode(t, { parentId: root.id });
    const b = addNode(t, { parentId: a.id });
    removeSubtree(t, a.id);
    assert(getNode(t, a.id) === null);
    assert(getNode(t, b.id) === null);
    assert(getNode(t, root.id) !== null);
  });
  test('22. defaultHydrogenTree has a root and ≥ 7 nodes', () => {
    const t = defaultHydrogenTree();
    assert(rootOf(t) !== null);
    assert(t.nodes.length >= 7, `only ${t.nodes.length} nodes`);
  });
  test('23. defaultHydrogenTree validates without errors', () => {
    const t = defaultHydrogenTree();
    const issues = validate(t);
    const errs = issues.filter(i => i.severity === 'error');
    assert(errs.length === 0, `errors: ${JSON.stringify(errs)}`);
  });
});

// ── 4. Validation ─────────────────────────────────────────────────────────
group('Validation', () => {
  test('24. chanceBranchSum returns sum + status + probs[]', () => {
    const t = defaultHydrogenTree();
    const chance = t.nodes.find(n => n.type === 'chance');
    const result = chanceBranchSum(t, chance.id);
    assert(typeof result.sum === 'number');
    assert(Array.isArray(result.probs));
  });
  test('25. chanceBranchSum status OK when Σ ≈ 1', () => {
    const t = defaultHydrogenTree();
    const chance = t.nodes.find(n => n.type === 'chance');
    const result = chanceBranchSum(t, chance.id);
    assert(result.status === SIGMA_OK, `got ${result.status}, Σ=${result.sum}`);
  });
  test('26. validate returns an array', () => {
    const t = defaultHydrogenTree();
    assert(Array.isArray(validate(t)));
  });
});

// ── 5. Rollback ───────────────────────────────────────────────────────────
group('Rollback', () => {
  test('27. rollbackMean on default tree yields positive EV', () => {
    const t = defaultHydrogenTree();
    const ev = rollbackMean(t).ev;
    assert(ev > 0, `EV=${ev}`);
  });
  test('28. rollbackOnce is deterministic given the same RNG state', () => {
    const t = defaultHydrogenTree();
    const a = rollbackOnce(t, makeRng(42)).ev;
    const b = rollbackOnce(t, makeRng(42)).ev;
    approx(a, b, 1e-9, `${a} ≠ ${b}`);
  });
  test('29. rollbackMean honours decision max-EV choice', () => {
    // Build a synthetic tree where one branch is obviously better.
    const t = newTree('Synth');
    const root = addNode(t, { parentId: null, type: 'decision', label: 'R' });
    addNode(t, { parentId: root.id, type: 'terminal', label: 'A', branchLabel: 'A', payoff: fixed(50) });
    addNode(t, { parentId: root.id, type: 'terminal', label: 'B', branchLabel: 'B', payoff: fixed(10) });
    const r = rollbackMean(t);
    assert(r.ev === 50, `ev=${r.ev}`);
    assert(r.optimalPath[0] === 'A', `path=${r.optimalPath}`);
  });
  test('30. sibling normalisation applies per-iteration even when Σ ≠ 1', () => {
    const t = newTree('Skew');
    const root = addNode(t, { parentId: null, type: 'chance', label: 'C' });
    addNode(t, { parentId: root.id, type: 'terminal', label: 'X', branchLabel: 'X',
                 branchProb: fixed(0.30), payoff: fixed(100) });
    addNode(t, { parentId: root.id, type: 'terminal', label: 'Y', branchLabel: 'Y',
                 branchProb: fixed(0.30), payoff: fixed(0) });
    // Σ raw = 0.60, but per §1(c) sibling normalisation drives EV to (50,50)
    // weighted, i.e. 100 * 0.5 + 0 * 0.5 = 50.
    const ev = rollbackMean(t).ev;
    approx(ev, 50, 1e-9);
  });
  test('31. listDistributionInputs returns only distribution-mode inputs', () => {
    const t = defaultHydrogenTree();
    const inputs = listDistributionInputs(t);
    assert(inputs.length > 0, 'should find dist inputs');
    for (const inp of inputs) assert(inp.input.mode === 'distribution');
    // Ensure mixing in a fixed input keeps it OUT of the list.
    const root = addNode(t, { parentId: null, type: 'terminal', label: 'orphan',
                              payoff: { mode: 'fixed', fixed: 7, distType: null, params: {} } });
    const after = listDistributionInputs(t);
    assert(after.length === inputs.length, 'fixed input leaked');
  });
});

// ── 6. Monte Carlo ────────────────────────────────────────────────────────
group('Monte Carlo', () => {
  test('32. runMonteCarlo returns shape { summary, percentiles, histogram, stability, tornado }', () => {
    const t = defaultHydrogenTree();
    const r = runMonteCarlo(t, { iterations: 500, seed: 1 });
    assert(r.summary && r.percentiles && r.histogram && r.stability && r.tornado, 'missing keys');
  });
  test('33. same seed → identical results (byte determinism)', () => {
    const t = defaultHydrogenTree();
    const a = runMonteCarlo(t, { iterations: 500, seed: 42 });
    const b = runMonteCarlo(t, { iterations: 500, seed: 42 });
    approx(a.summary.mean, b.summary.mean, 1e-9);
    approx(a.percentiles.p50, b.percentiles.p50, 1e-9);
  });
  test('34. percentiles are monotone (p10 ≤ p50 ≤ p90)', () => {
    const t = defaultHydrogenTree();
    const r = runMonteCarlo(t, { iterations: 1000, seed: 3 });
    assert(r.percentiles.p10 <= r.percentiles.p50, 'p10 > p50');
    assert(r.percentiles.p50 <= r.percentiles.p90, 'p50 > p90');
  });
  test('35. tornado drivers sorted by |Δ| descending', () => {
    const t = defaultHydrogenTree();
    const r = runMonteCarlo(t, { iterations: 200, seed: 5 });
    const d = r.tornado.drivers;
    assert(d.length >= 2, 'expected ≥2 drivers');
    for (let i = 1; i < d.length; i++) {
      assert(d[i - 1].delta >= d[i].delta, `unsorted at ${i}`);
    }
  });
  test('36. Σ terminalEmvs ≈ root EV (per-terminal contribution invariant)', () => {
    const t = defaultHydrogenTree();
    const r = runMonteCarlo(t, { iterations: 500, seed: 7 });
    let sum = 0;
    for (const id in r.terminalEmvs) sum += r.terminalEmvs[id];
    close(sum, r.summary.mean, 1e-9);
  });
});

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`\n[FAIL] ${f.name}\n${f.error.stack || f.error.message}`);
  }
  process.exit(1);
}
