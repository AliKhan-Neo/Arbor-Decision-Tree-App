# Arbor v3 — Claude Coding Instructions

This document is the canonical "how to work on Arbor" for future AI sessions.
Read it before touching code. The methodological rules in §3 are correctness
constraints, not preferences — architect to enforce them.

---

## 1. What Arbor Is

A premium web-based decision intelligence tool for finance professionals
(energy advisors, IC analysts, strategy consultants). It models capital
decisions as **probability-weighted, payoff-distributed decision trees** and
runs a seeded Monte Carlo simulation across them, producing:

- EV distribution (PDF + CDF, percentiles, summary stats)
- Optimal-path stability percentage
- Tornado sensitivity (one-at-a-time ±1σ perturbation)
- 2-variable joint sensitivity heatmap with decision-flip contour (Phase 3)
- Audit-ready Excel export (Phase 4)
- MACC (marginal abatement cost curve) builder as a second mode (Phase 5)
- Cloud-saved analyses gated by a Pro tier (Phase 6)

Two HTML entry points:

| Page         | Purpose                                              |
|--------------|------------------------------------------------------|
| `index.html` | Marketing landing page (**sacred — do not regress**) |
| `app.html`   | The interactive app — slim mount loading `/src`      |

---

## 2. Tech Stack

- Vanilla HTML5 / CSS3 / **ES modules** — no bundler, no framework, no npm install
- `<script type="module">` imports directly from `/src`
- External deps via CDN only (SheetJS in Phase 4, Supabase JS in Phase 6)
- Vercel static deploy
- Node only for the test runner (`node tests/engine.test.js`)
- `package.json` exists solely to set `"type": "module"` and define `npm test`

Browsers: Chrome / Edge / Firefox / Safari current. No IE.

---

## 3. Methodological Rules — Inviolable

These are baked into `/src/sim/*` and must be preserved through every change.
If a new feature appears to require breaking one of these, STOP and raise it
— there is almost certainly a correct architecture that preserves them.

**(a) Distributions live on the right things.** Monte Carlo distributions
exist on **chance-node branch probabilities** and **terminal-node payoffs**
only. Never on decision nodes — a decision is a choice, not a random variable.

**(b) Stochastic stays stochastic.** Once a value is described by a
distribution, it is sampled per iteration. We never collapse it back to a
point estimate.

**(c) Sibling probabilities normalise per-iteration, never pre-iteration.**
Sampled sibling probabilities at a chance node sum to whatever they sum to;
we divide by that sum *inside* each iteration's rollback. Pre-normalising on
the model is mathematically wrong (it confuses sampling variance with
parameter belief).

**(d) EV is computed per iteration, then aggregated.** Mean-of-rollbacks ≠
rollback-of-means (Jensen's inequality, plus conditional decision branching).
The mean-state rollback exists *only* for the canvas's at-rest "best path"
hint and for the tornado baseline.

**(e) Optimal path may vary across iterations.** Optimal-path stability % is
a first-class output, presented alongside EV percentiles.

**(f) Tornado perturbs distribution inputs ±1σ one-at-a-time** around the
mean-state rollback. Each driver entry pairs `(loEV, hiEV)`; drivers are
sorted by `|hiEV − loEV|`.

---

## 4. File Structure

```
/
├── index.html                   landing page (do not modify in app work)
├── app.html                     slim mount — loads /src/main.js as a module
├── package.json                 "type":"module" + `npm test`
├── README.md
├── ROADMAP.md
├── styles.css                   landing-page assets only — do not edit
├── /src
│   ├── main.js                  entry — wires every module
│   ├── /canvas
│   │   ├── canvas.js            controller: pan/zoom/drag, draw loop, picking
│   │   ├── nodes.js             shape geometry + drawing (decision/chance/terminal)
│   │   ├── connectors.js        edge bezier + branch labels
│   │   └── hoverActions.js      Make.com-style "+" popover
│   ├── /model
│   │   ├── tree.js              schema + default Hydrogen tree
│   │   ├── validation.js        Σ-check, audit issues
│   │   └── persistence.js       localStorage (Supabase routing in Phase 6)
│   ├── /sim
│   │   ├── rng.js               mulberry32 seeded RNG + Box-Muller normal
│   │   ├── distributions.js     Triangular / Beta / Uniform / Lognormal / TruncNormal
│   │   ├── rollback.js          per-iteration EV (honours §3 rules)
│   │   ├── monteCarlo.js        10k-iter chunked + aggregation
│   │   ├── sensitivity.js       Phase 3: 2-var heatmap
│   │   └── worker.js            Phase 2: off-thread MC
│   ├── /ui
│   │   ├── inspector.js         right-panel node editor
│   │   ├── dashboard.js         EV summary / histogram / stability / tornado
│   │   ├── animation.js         4-phase pathway exploration
│   │   ├── modals.js            Pro modal
│   │   ├── themeToggle.js       Warmed Ink ⇄ Editorial Light
│   │   └── auth.js              Phase 6
│   ├── /export                  Phase 4 (tree) + Phase 5 (MACC)
│   ├── /macc                    Phase 5
│   ├── /supabase                Phase 6
│   └── /styles
│       ├── tokens.css           both themes + spacing + motion
│       ├── app.css              layout (header/main/dashboard)
│       └── components.css       buttons/inputs/popovers/modals/sliders
├── /tests
│   └── engine.test.js           35 vanilla-Node tests + tiny runner
├── /docs                        BRAND.md, PRO_FEATURES.md, ROADMAP.md (stub — see root)
└── /assets                      fonts + icons
```

---

## 5. Data Model

```js
tree = {
  schemaVersion: '3.0',
  meta: { title, date, currency, seed, iterations },
  nodes: Node[],
  nextId: number
}

Node = {
  id, parentId, type: 'decision'|'chance'|'terminal',
  label, branchLabel, x, y,
  branchProb: InputDescriptor,   // used iff parent.type === 'chance'
  payoff:     InputDescriptor    // used iff type === 'terminal'
}

InputDescriptor = {
  mode: 'fixed' | 'distribution',
  fixed: number,                 // always populated — used in mean-state rollback
  distType: 'triangular'|'beta'|'uniform'|'lognormal'|'truncnormal'|null,
  params: { ... }                // shape depends on distType
}
```

Distribution params:

| distType    | params                          |
|-------------|---------------------------------|
| triangular  | `{ min, mode, max }`            |
| uniform     | `{ min, max }`                  |
| beta        | `{ alpha, beta }`               |
| lognormal   | `{ mu, sigma }` (log-space)     |
| truncnormal | `{ mu, sigma, min, max }`       |

---

## 6. Themes

Two themes via `data-theme` on `<html>`:

| Theme            | Default? | Use case                          |
|------------------|----------|-----------------------------------|
| `warmed-ink`     | ✓        | Default — editorial dark          |
| `editorial-light`| —        | Client presentations, print mode  |

**All colours flow through CSS variables.** No hex literals in JS or
component CSS. Canvas reads palette via `getComputedStyle(documentElement)`
inside `/src/canvas/nodes.js#refreshPalette()`. After a theme change,
`canvasCtl.refreshTheme()` is called by the toggle.

**Optimal-path colour** is `--hero` (terracotta), not `--accent` (gold).
Gold is reserved for UI chrome (buttons, badges, sparklines); terracotta is
the "moment of insight" colour used on the best path, the convergence
animation, the histogram fill, and the heatmap warm pole.

Persist theme to `localStorage` under key `arbor:theme`.

---

## 7. Pro Tier Gating

In Phase 1 the Pro check is a stub — the Pro modal opens unconditionally
from the export buttons. Phase 6 wires `isPro()` to the Supabase profile
flag.

Pro-gated features:

- Monte Carlo simulation
- Distribution mode on any input (point estimates remain free)
- All dashboard visualisations beyond point-estimate EV
- 2-variable sensitivity heatmap
- Excel export (tree + MACC)
- Save more than 3 analyses

Modal is built by `/src/ui/modals.js#createProModal()`. Feature-specific
copy keyed by `feature` argument (`'pdf' | 'svg' | 'excel' | 'save'`).

---

## 8. Anti-Patterns — Do Not Do These

- Do not introduce a build system, bundler, or transpiler.
- Do not add a framework (React, Vue, Svelte, etc.).
- Do not commit anything to `index.html` that breaks landing-page typography
  or copy. If a change touches it, raise it first.
- Do not put hex literals in JS or component CSS — they break the theme
  system.
- Do not change the font stack (Cormorant Garamond, Syne, DM Mono, Inter).
- Do not collapse a distribution back to a point estimate to "simplify"
  anything (§3b).
- Do not pre-normalise sibling probabilities on the model (§3c).
- Do not compute EV as the mean-of-rollbacks instead of rollback-of-samples
  (§3d).
- Do not run the simulation synchronously on the main thread without
  chunking (UI freezes).
- Do not skip `npm test` before claiming a phase is done.

---

## 9. Development Workflow

```bash
# Run tests
npm test          # or: node tests/engine.test.js

# Local dev
# Any static server will do; e.g. VS Code's Live Server extension.
# Open app.html — module loading requires http:// (not file://).
```

Commit messages follow conventional commits (`feat:`, `fix:`, `refactor:`).
Phase milestones get atomic commits matching the message in the BRIEF.

---

## 10. Reference Numbers

The default Hydrogen tree (loaded for new users / when localStorage is
empty) has:

- Mean-state rollback EV ≈ **$90M**
- Monte Carlo @ 10k iterations, seed=42:
  - Mean ≈ **$90M**, stdev ≈ **$15M**
  - P10 / P50 / P90 ≈ **$71M / $90M / $111M**
  - Transport-focus branch optimal in **~100% of iterations** (very rare
    flip to Heating only when extreme samples coincide)

These are the v3 numbers, not the v2 reference from BRIEF.md §0 — that
described an earlier hydrogen tree that no longer exists in the repo. The
shape (one decision dominates ~100% of iterations) matches.
