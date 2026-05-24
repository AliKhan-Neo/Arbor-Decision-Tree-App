# Arbor v3 — Roadmap

The v3 build replaces the single-file v2 MVP with a proper module
structure and ships the full feature set in six phases. Phases are
sequential — each lands as an atomic commit and must pass its acceptance
criteria before the next begins.

---

## Phase 1 — Refactor + Theme System ✅ *Shipped*

Module structure under `/src`, two-theme system (Warmed Ink default ⇄
Editorial Light), and the complete v2 engine rebuilt inside it: seeded
Monte Carlo, distribution-mode inputs, dashboard, 4-phase exploration
animation, localStorage persistence, hover-popover node insertion, default
Hydrogen-market-entry tree.

**Acceptance**
- App loads with Warmed Ink theme by default — ✅
- Toggle switches to Editorial Light, persists across reload — ✅
- File structure matches BRIEF §3 — ✅
- `npm test` — 35/35 passing
- Lighthouse perf ≥ 90 on `app.html` — pending live check

**Commit:** `feat: refactor to module structure and ship two-theme system`

**Retro:** BRIEF §0 described a v2 MVP that wasn't in the repo — current
`app.html` was the v1 build with no Monte Carlo, no distributions, no
dashboard, no tests. Phase 1 expanded to "build v2 inside the v3 module
structure," producing the methodological foundation (`/src/sim/*` with the
six §1 rules enforced) that Phases 2–6 build on.

---

## Phase 2 — Web Worker + CDF Toggle

Move the Monte Carlo loop off the main thread into `/src/sim/worker.js` so
the UI stays responsive at 10k iterations on larger trees. Stream progress
back at 5% intervals to feed the exploration animation. Add a PDF / CDF tab
toggle on the EV-distribution panel with P10/P50/P90 callouts and a
hover-readout for `P(EV ≤ X)`.

**Acceptance**
- 10k iterations on a 50-node tree completes in ≤ 1.5 s with UI responsive
- CDF view toggles without re-simulation
- Determinism preserved: same seed → byte-identical results

**Commit:** `feat: web worker simulation + CDF distribution view`

---

## Phase 3 — 2-Variable Sensitivity Heatmap

The differentiator visualisation. New dashboard panel: pick any two
distribution-mode inputs, sweep each over `[P5, P95]` on a 20×20 grid, run
a reduced 1k-iter MC at each cell, render a heatmap of mean EV with a
contour line where the optimal decision flips.

**Acceptance**
- Heatmap generates in ≤ 4 s for the default tree
- Decision-flip contour visible when applicable, hidden when not
- Renders correctly in both themes via CSS-variable palette

**Commit:** `feat: 2-variable sensitivity heatmap with decision-flip contour`

---

## Phase 4 — Excel Export (Decision Tree)

Six-sheet audit-ready workbook generated client-side via SheetJS (CDN):
Cover · Tree Structure · Iteration Sample · Rollback Trace · Results ·
Visual Tree. The Rollback Trace sheet is the credibility-winning artefact —
auditors can reconstruct any iteration's chain from sampled probs through
sibling normalisation through final EV.

**Acceptance**
- All six sheets generate without errors
- Iteration Sample has exactly 10,001 rows (header + 10k)
- Rollback Trace reconciles to Results sheet's first iteration
- Opens cleanly in Excel / Numbers / Google Sheets / LibreOffice
- File size < 2 MB for the default tree

**Commit:** `feat: six-sheet Excel export for audit-ready decision tree output`

---

## Phase 5 — MACC Tool (Separate Mode)

Marginal Abatement Cost Curve builder at `app.html#macc`. Spreadsheet-style
measure entry (Name · Sector · Cost $/tCO₂ · Volume tCO₂), stepped chart
with merit ordering and target line, optional Monte Carlo on cost/volume
that re-sorts merit per iteration and renders a P10/P50/P90 envelope.
Excel export mirroring the tree export's structure.

**Commit:** `feat: MACC mode — abatement cost curve builder with Monte Carlo and Excel export`

---

## Phase 6 — Supabase Auth + Stripe Billing

Last by design — the free tier with Excel export is the distribution
strategy. Supabase auth (email + Google), cloud-saved analyses, RLS-secured
per-user data, Stripe Pro subscription ($29 AUD/mo or $290/yr) gating MC,
distributions, dashboards, heatmap, Excel export, and >3 saved analyses.
Region: `ap-southeast-2` (Sydney).

**Commit:** `feat: supabase auth, cloud-saved analyses, stripe-gated pro tier`

---

## Beyond Phase 6 — Not Scheduled

- Team collaboration (shared tree URLs, comment threads)
- Template library (M&A, project finance, renewable, abatement)
- API for embedding trees in external reports
- White-label / branded exports
- AI tree generation from a written prompt

Full spec for the in-flight phases: `BRIEF.md` (root).
