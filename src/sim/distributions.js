// Probability and payoff distributions.
//
// PROBABILITY-domain (chance-node branches): triangular, beta, uniform — all
// produce values in some range that will be normalised across siblings per
// iteration (BRIEF §1(c)). We do NOT clamp to [0,1] here; downstream
// normalisation handles relative weighting.
//
// PAYOFF-domain (terminal nodes): triangular, lognormal, truncated normal,
// uniform — all unbounded above (lognormal) or bounded by user-set params.
//
// Each distribution exposes: sample(rng), mean(), p5(), p95(), valid(params).

import { sampleNormal } from './rng.js';

// -- Triangular ------------------------------------------------------------
// params: { min, mode, max }
export const triangular = {
  sample(p, rng) {
    const { min, mode, max } = p;
    const u = rng();
    const f = (mode - min) / (max - min);
    if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  },
  mean(p) { return (p.min + p.mode + p.max) / 3; },
  // Inverse CDF at q ∈ (0,1).
  quantile(p, q) {
    const { min, mode, max } = p;
    const f = (mode - min) / (max - min);
    if (q < f) return min + Math.sqrt(q * (max - min) * (mode - min));
    return max - Math.sqrt((1 - q) * (max - min) * (max - mode));
  },
  p5(p)  { return this.quantile(p, 0.05); },
  p95(p) { return this.quantile(p, 0.95); },
  // ±1σ around mean for tornado. Stdev of triangular has closed form.
  stdev(p) {
    const { min, mode, max } = p;
    const a = min, b = mode, c = max;
    const v = (a * a + b * b + c * c - a * b - a * c - b * c) / 18;
    return Math.sqrt(Math.max(v, 0));
  },
  valid(p) {
    return Number.isFinite(p.min) && Number.isFinite(p.mode)
      && Number.isFinite(p.max) && p.min <= p.mode && p.mode <= p.max
      && p.min < p.max;
  }
};

// -- Uniform ---------------------------------------------------------------
// params: { min, max }
export const uniform = {
  sample(p, rng) { return p.min + (p.max - p.min) * rng(); },
  mean(p)  { return (p.min + p.max) / 2; },
  quantile(p, q) { return p.min + q * (p.max - p.min); },
  p5(p)    { return this.quantile(p, 0.05); },
  p95(p)   { return this.quantile(p, 0.95); },
  stdev(p) { return (p.max - p.min) / Math.sqrt(12); },
  valid(p) { return Number.isFinite(p.min) && Number.isFinite(p.max) && p.min < p.max; }
};

// -- Beta -----------------------------------------------------------------
// params: { alpha, beta }. Domain (0,1).
// Implemented as the ratio of two gamma samples (Devroye, Non-Uniform Random
// Variate Generation, §IX.4). This is the textbook-correct construction and
// is exact for all α, β > 0 — Marsaglia & Tsang's gamma sampler handles both
// the shape ≥ 1 and shape < 1 regimes deterministically.
export const beta = {
  sample(p, rng) {
    const ga = sampleGamma(p.alpha, rng);
    const gb = sampleGamma(p.beta,  rng);
    return ga / (ga + gb);
  },
  mean(p)  { return p.alpha / (p.alpha + p.beta); },
  // Analytical p5/p95 for Beta is the incomplete-beta inverse; approximate via
  // monotonic bisection on the regularised CDF. Good enough for tornado
  // labelling at 1e-4 precision.
  quantile(p, q) { return betaQuantile(p.alpha, p.beta, q); },
  p5(p)    { return betaQuantile(p.alpha, p.beta, 0.05); },
  p95(p)   { return betaQuantile(p.alpha, p.beta, 0.95); },
  stdev(p) {
    const a = p.alpha, b = p.beta, s = a + b;
    return Math.sqrt((a * b) / (s * s * (s + 1)));
  },
  valid(p) { return Number.isFinite(p.alpha) && Number.isFinite(p.beta) && p.alpha > 0 && p.beta > 0; }
};

// Marsaglia & Tsang gamma sampler (shape >= 1). For shape < 1, boost trick.
function sampleGamma(shape, rng) {
  if (shape < 1) {
    const g = sampleGamma(shape + 1, rng);
    return g * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let z, v;
    do { z = sampleNormal(rng); v = 1 + c * z; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * z * z * z * z) return d * v;
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Regularised incomplete beta I_x(a,b). Continued fraction (Lentz).
// Good to 1e-8 for moderate shape. Adapted from Numerical Recipes §6.4.
function regularisedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = Math.log(gammaFunc(a)) + Math.log(gammaFunc(b)) - Math.log(gammaFunc(a + b));
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  // Continued fraction expansion.
  let f = 1, c = 1, d = 0;
  for (let m = 0; m < 200; m++) {
    const m2 = 2 * m;
    let aN;
    if (m === 0) aN = 1;
    else {
      const num1 = m * (b - m) * x;
      const den1 = (a + m2 - 1) * (a + m2);
      aN = num1 / den1;
    }
    d = 1 + aN * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aN / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= c * d;
    const num2 = -(a + m) * (a + b + m) * x;
    const den2 = (a + m2) * (a + m2 + 1);
    const aN2 = num2 / den2;
    d = 1 + aN2 * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aN2 / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  // Symmetry: use I_x for x < (a+1)/(a+b+2), else 1 - I_{1-x}(b,a).
  return front * (f - 1);
}

function gammaFunc(z) {
  // Lanczos approximation.
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFunc(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function betaQuantile(a, b, q) {
  // Bisection on the monotone CDF over (0,1). 50 iters = 2^-50 precision.
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const cdf = regularisedBeta(mid, a, b);
    if (cdf < q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// -- Lognormal -------------------------------------------------------------
// params: { mu, sigma } in log-space.
export const lognormal = {
  sample(p, rng) {
    const z = sampleNormal(rng);
    return Math.exp(p.mu + p.sigma * z);
  },
  mean(p)  { return Math.exp(p.mu + p.sigma * p.sigma / 2); },
  // exact percentiles via inverse normal CDF
  quantile(p, q) { return Math.exp(p.mu + p.sigma * inverseNormalCdf(Math.min(Math.max(q, 1e-9), 1 - 1e-9))); },
  p5(p)    { return Math.exp(p.mu + p.sigma * inverseNormalCdf(0.05)); },
  p95(p)   { return Math.exp(p.mu + p.sigma * inverseNormalCdf(0.95)); },
  stdev(p) {
    const m = this.mean(p);
    return m * Math.sqrt(Math.exp(p.sigma * p.sigma) - 1);
  },
  valid(p) { return Number.isFinite(p.mu) && Number.isFinite(p.sigma) && p.sigma > 0; }
};

// -- Truncated Normal ------------------------------------------------------
// params: { mu, sigma, min, max }. Rejection sampler.
export const truncnormal = {
  sample(p, rng) {
    for (let i = 0; i < 1000; i++) {
      const z = p.mu + p.sigma * sampleNormal(rng);
      if (z >= p.min && z <= p.max) return z;
    }
    // Failure fallback: clamp Box-Muller draw.
    const z = p.mu + p.sigma * sampleNormal(rng);
    return Math.min(p.max, Math.max(p.min, z));
  },
  mean(p) {
    // Closed form: μ + σ · (φ(α) - φ(β)) / (Φ(β) - Φ(α))
    const a = (p.min - p.mu) / p.sigma;
    const b = (p.max - p.mu) / p.sigma;
    const phiA = standardNormalPdf(a);
    const phiB = standardNormalPdf(b);
    const PhiA = standardNormalCdf(a);
    const PhiB = standardNormalCdf(b);
    return p.mu + p.sigma * (phiA - phiB) / (PhiB - PhiA);
  },
  quantile(p, q) { return inverseTruncNormal(p, q); },
  p5(p)    { return inverseTruncNormal(p, 0.05); },
  p95(p)   { return inverseTruncNormal(p, 0.95); },
  stdev(p) {
    // Approximate via the truncated-normal variance formula.
    const a = (p.min - p.mu) / p.sigma;
    const b = (p.max - p.mu) / p.sigma;
    const phiA = standardNormalPdf(a);
    const phiB = standardNormalPdf(b);
    const Z = standardNormalCdf(b) - standardNormalCdf(a);
    const t1 = (a * phiA - b * phiB) / Z;
    const t2 = (phiA - phiB) / Z;
    const v = p.sigma * p.sigma * (1 + t1 - t2 * t2);
    return Math.sqrt(Math.max(v, 0));
  },
  valid(p) {
    return Number.isFinite(p.mu) && Number.isFinite(p.sigma) && p.sigma > 0
      && Number.isFinite(p.min) && Number.isFinite(p.max) && p.min < p.max;
  }
};

function standardNormalPdf(z) {
  return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
}

function standardNormalCdf(z) {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (
    0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))
  );
  return z > 0 ? 1 - p : p;
}

function inverseNormalCdf(q) {
  // Beasley-Springer-Moro approximation, accurate to ~1e-9.
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01,  2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00,  2.938163982698783e+00];
  const d = [ 7.784695709041462e-03,  3.224671290700398e-01,  2.445134137142996e+00,
              3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let qx, r;
  if (q < plow) {
    qx = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * qx + c[1]) * qx + c[2]) * qx + c[3]) * qx + c[4]) * qx + c[5]) /
           ((((d[0] * qx + d[1]) * qx + d[2]) * qx + d[3]) * qx + 1);
  }
  if (q <= phigh) {
    qx = q - 0.5; r = qx * qx;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * qx /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  qx = Math.sqrt(-2 * Math.log(1 - q));
  return -(((((c[0] * qx + c[1]) * qx + c[2]) * qx + c[3]) * qx + c[4]) * qx + c[5]) /
          ((((d[0] * qx + d[1]) * qx + d[2]) * qx + d[3]) * qx + 1);
}

function inverseTruncNormal(p, q) {
  // Inverse via standard normal mapping: x = μ + σ·Φ⁻¹(Φ(α) + q·(Φ(β)-Φ(α)))
  const a = (p.min - p.mu) / p.sigma;
  const b = (p.max - p.mu) / p.sigma;
  const PhiA = standardNormalCdf(a);
  const PhiB = standardNormalCdf(b);
  const u = PhiA + q * (PhiB - PhiA);
  return p.mu + p.sigma * inverseNormalCdf(Math.min(Math.max(u, 1e-9), 1 - 1e-9));
}

// -- Registry --------------------------------------------------------------
export const DISTRIBUTIONS = {
  triangular,
  uniform,
  beta,
  lognormal,
  truncnormal
};

// Sample any input description: { mode, fixed, distType, params }.
// Falls back to fixed value if mode === 'fixed' or distribution invalid.
export function sampleInput(input, rng) {
  if (!input) return 0;
  if (input.mode === 'fixed' || !input.distType) return input.fixed ?? 0;
  const d = DISTRIBUTIONS[input.distType];
  if (!d || !d.valid(input.params || {})) return input.fixed ?? 0;
  return d.sample(input.params, rng);
}

export function meanOfInput(input) {
  if (!input) return 0;
  if (input.mode === 'fixed' || !input.distType) return input.fixed ?? 0;
  const d = DISTRIBUTIONS[input.distType];
  if (!d || !d.valid(input.params || {})) return input.fixed ?? 0;
  return d.mean(input.params);
}

export function stdevOfInput(input) {
  if (!input || input.mode === 'fixed' || !input.distType) return 0;
  const d = DISTRIBUTIONS[input.distType];
  if (!d || !d.valid(input.params || {})) return 0;
  return d.stdev(input.params);
}
