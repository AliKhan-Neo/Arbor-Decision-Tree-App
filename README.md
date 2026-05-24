# Arbor — Decision Intelligence

> Probability-weighted decision trees with seeded Monte Carlo, optimal-path
> stability, joint sensitivity, and audit-ready Excel export. Built for
> people who have to defend the recommendation.

Arbor turns a capital decision into a probability-distributed tree, runs
10,000 iterations across it with deterministic seeded sampling, and gives
you the EV distribution, the optimal-path stability percentage, and a
tornado of the inputs that move the answer.

You write the assumptions. Arbor shows you how fragile the recommendation
is.

---

## Who It's For

- **Energy advisors** modelling abatement options, market-entry routes,
  technology bets
- **IC analysts** preparing investment decisions where the chair will ask
  *"and what if we're wrong about cost of capital?"*
- **Strategy consultants** running scenario work for boards
- **Project finance analysts** sizing development risk against expected
  payoff

If your decision lives in a spreadsheet that's mostly point estimates
glued together with `=IF()`, Arbor is the upgrade.

---

## What's In It

- Canvas-based decision tree builder with pan / zoom / drag
- Three node types: **Decision** (a choice), **Chance** (a random event),
  **Terminal** (an outcome with a payoff)
- Distribution modes on every chance probability and terminal payoff:
  Triangular, Beta, Uniform, Lognormal, Truncated Normal
- Seeded Monte Carlo (mulberry32, 10k iterations) — same seed,
  byte-identical results
- Optimal-path stability table — *"the recommendation holds in 97% of
  iterations"*
- Tornado driver chart — one-at-a-time ±1σ perturbation
- Two themes: **Warmed Ink** (editorial dark, default) and **Editorial
  Light** (client-presentation, print-friendly)

**Coming:** CDF view (Phase 2) · 2-variable joint sensitivity heatmap with
decision-flip contour (Phase 3) · audit-ready six-sheet Excel export
(Phase 4) · MACC mode (Phase 5) · Supabase auth + Stripe Pro (Phase 6).

Full plan: [`ROADMAP.md`](./ROADMAP.md). Build brief: [`BRIEF.md`](./BRIEF.md).

---

## Methodology

Per-iteration rollback. Sibling probabilities normalise inside each
iteration, never on the model. EV is computed per iteration and then
aggregated — *never* the rollback of the means. The optimal decision can
change across iterations; we report how often it does.

See [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) §3 for the inviolable rules.

---

## Run It Locally

```bash
# Clone
git clone https://github.com/yourusername/arbor.git
cd arbor

# Any static server works — modules need http://, not file://
# Option A: VS Code Live Server extension on app.html
# Option B:
python3 -m http.server 8000
# then open http://localhost:8000/app.html

# Run the engine test suite
npm test
```

No `npm install`. No bundler. No framework. ES modules served directly.
Node is used only for the test runner.

---

## Project Structure

```
arbor/
├── index.html              landing page
├── app.html                slim mount loading /src/main.js
├── /src
│   ├── main.js             entry — wires every module
│   ├── canvas/             pan/zoom, node drawing, hover popover
│   ├── model/              tree schema, validation, persistence
│   ├── sim/                RNG, distributions, rollback, Monte Carlo
│   ├── ui/                 inspector, dashboard, animation, modals, theme
│   └── styles/             tokens (two themes) + app + components
├── tests/                  engine.test.js — 35 vanilla-Node tests
├── BRIEF.md                full v3 build brief
├── ROADMAP.md              phased plan with acceptance criteria
└── .claude/CLAUDE.md       coding instructions for AI sessions
```

---

## Deploy

Vercel static deploy. Drag the folder into a new project at vercel.com/new,
or `vercel --prod` from the repo root. No environment variables until
Phase 6 (Supabase + Stripe).

---

## Contact

`hello@arbor.finance` — product, bugs, press.

*Arbor is a decision-intelligence tool. It is not financial advice. The
output is only as good as the inputs.*
