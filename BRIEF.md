# ARBOR v3 — Claude Code Build Brief

> Resume the Arbor build from its current single-file MVP state.
> Operate as **Principal Software Engineer + Principal Decision Scientist**.
> Make autonomous calls, no clarifying questions unless genuinely blocked.
> Atomic commits at each phase milestone. Self-verify against acceptance criteria after each commit.

---

## 0. CURRENT REPO STATE — READ FIRST

Before writing any code, do the following in order:

1. `cat CLAUDE.md` — existing AI instructions
2. `cat ROADMAP.md` — existing phase plan
3. `cat README.md` — existing project overview
4. `ls -la` — full repo structure
5. `cat index.html` — landing page (PRESERVE THIS)
6. `cat app.html` — current MVP

The repo currently contains a working single-file v2 MVP in `app.html`. It includes:
- Canvas-based decision tree builder (pan/zoom/drag)
- Hover-triggered + popup for inserting child nodes (Make.com pattern)
- 3 node types: Decision (rounded square), Chance (circle), Terminal (rounded rectangle)
- Right-side inspector panel for editing node labels, branch labels, probabilities, payoffs
- Distribution modes on probabilities (Triangular, Beta, Uniform) and payoffs (Triangular, Lognormal, Truncated Normal, Uniform)
- Seeded Monte Carlo simulation engine (mulberry32 RNG, 10k iterations, main-thread chunked)
- 4-phase pathway exploration animation (sweep → exploration → convergence → dashboard reveal)
- Mini dashboard with EV summary, histogram, path stability, tornado chart
- LocalStorage persistence
- Default tree: Hydrogen market entry decision with Triangular payoffs on all terminals

**Verified working** as of last session — all 35 unit tests on the math engine pass.
**Default tree EV ≈ $38.16M** with **stdev ≈ $5.90M** on a 10k-iteration seed=42 run. Transport-focused branch optimal in ~97.7% of iterations.

---

## 1. METHODOLOGICAL FOUNDATIONS — DO NOT VIOLATE

These constraints are baked into the v2 engine and must be preserved through all v3 work:

**(a)** Monte Carlo distributions exist on **chance node branch probabilities** and **terminal node payoffs** only. Never on decision nodes — a decision is a choice, not a random variable.

**(b)** Distribution mode is the uncertainty model — never collapse it back to a (point estimate, probability) pair. Once stochastic, stays stochastic through every rollback iteration.

**(c)** Sibling chance probabilities normalise to 1 per-iteration, not pre-iteration. The mean-of-distribution-then-normalise approach is mathematically wrong.

**(d)** EV computed per-iteration, then aggregated. Mean-of-rollbacks ≠ rollback-of-means due to Jensen's inequality and conditional branching logic.

**(e)** Optimal path may vary across iterations. **Optimal-path stability percentage** is a first-class output alongside EV percentiles.

**(f)** Tornado sensitivity perturbs distribution inputs ±1σ one-at-a-time around mean-state rollback.

If a feature in v3 appears to require breaking any of these, stop and raise it — there's almost certainly a correct architecture that preserves them.

---

## 2. NON-NEGOTIABLE BRAND TOKENS — v3 update

Replace the existing v2 token set in `/src/styles/tokens.css`. The current "cold gold on near-black" palette is being deprecated. v3 ships with **two themes**:

### Theme A: "Warmed Ink" (default — replaces current dark mode)

```css
:root[data-theme="warmed-ink"] {
  --bg:          #1A1410;   /* umber-black base */
  --panel:       #221A14;   /* cocoa panel */
  --inspector:   #1F1813;   /* slightly deeper inspector bg */
  --line:        rgba(244,235,220,0.08);
  --text:        #F4EBDC;   /* bone */
  --text-muted:  #B5A38B;
  --accent:      #D4A574;   /* champagne gold — primary brand */
  --accent-soft: #A88554;
  --hero:        #C56B47;   /* terracotta — optimal path, hero moments */
  --positive:    #8FA68E;   /* sage — valid Σ = 1, positive payoffs */
  --warn:        #D4A23A;   /* amber — Σ < 1 */
  --rust:        #B14A3A;   /* rust — Σ > 1, errors */
  --node-fill:   #221A14;
  --conn-default: rgba(244,235,220,0.25);
}
```

### Theme B: "Editorial Light" (toggle — client/presentation mode)

```css
:root[data-theme="editorial-light"] {
  --bg:          #F5F0E6;   /* cream paper */
  --panel:       #EEE7D7;   /* bone */
  --inspector:   #FAF6EC;
  --line:        rgba(12,35,64,0.10);
  --text:        #0C2340;   /* deep navy */
  --text-muted:  #5D6B7D;
  --accent:      #B0863D;   /* muted publication gold */
  --hero:        #D97757;   /* terracotta */
  --positive:    #7A9E87;   /* sage */
  --warn:        #C58A2C;
  --rust:        #A84A38;
  --node-fill:   #FAF6EC;
  --conn-default: rgba(12,35,64,0.30);
}
```

**Theme toggle behaviour:**
- Toggle button in the top-right header next to "Run Simulation" — a moon/sun glyph in DM Mono
- Theme preference saved to localStorage (key `arbor:theme`)
- Default = `warmed-ink` for new users
- Theme switches via `data-theme` attribute on `<html>` — all colours flow through CSS variables
- Animations, charts, dashboard, all inherit theme — no hardcoded colours anywhere in v3 code

Typography unchanged from v2: Cormorant Garamond (display), Syne (titles), DM Mono (numerics), Inter (body).

---

## 3. FILE STRUCTURE TO BUILD INTO

Refactor `app.html` into a proper module structure. No bundler — direct ES module imports, deployable to Vercel as static files.

```
/
├── index.html                       (preserve — landing page)
├── app.html                         (slim mount point)
├── account.html                     (post-auth account/billing — Phase 6)
├── /src
│   ├── main.js                      (entry)
│   ├── /canvas
│   │   ├── canvas.js
│   │   ├── nodes.js
│   │   ├── connectors.js
│   │   └── hoverActions.js
│   ├── /model
│   │   ├── tree.js
│   │   ├── validation.js
│   │   └── persistence.js           (localStorage + Supabase abstraction)
│   ├── /sim
│   │   ├── distributions.js
│   │   ├── rng.js
│   │   ├── rollback.js
│   │   ├── monteCarlo.js
│   │   ├── sensitivity.js           (NEW: 2-variable heatmap engine)
│   │   └── worker.js                (NEW: move sim off main thread)
│   ├── /ui
│   │   ├── inspector.js
│   │   ├── dashboard.js
│   │   ├── animation.js
│   │   ├── modals.js
│   │   ├── themeToggle.js           (NEW)
│   │   └── auth.js                  (NEW: Phase 6)
│   ├── /export
│   │   ├── excelDecisionTree.js     (NEW: Phase 4)
│   │   ├── excelMACC.js             (NEW: Phase 5)
│   │   └── pdfReport.js             (NEW: Phase 4, stretch)
│   ├── /macc
│   │   ├── maccModel.js             (NEW: Phase 5)
│   │   ├── maccCanvas.js            (NEW: Phase 5)
│   │   └── maccChart.js             (NEW: Phase 5)
│   ├── /supabase
│   │   ├── client.js                (NEW: Phase 6)
│   │   ├── trees.js                 (NEW: Phase 6 — CRUD)
│   │   └── schema.sql               (NEW: Phase 6 — DDL)
│   └── /styles
│       ├── tokens.css               (UPDATE: two themes)
│       ├── app.css
│       └── components.css
├── /assets/fonts/
├── /tests
│   └── engine.test.js               (NEW: port the 35 unit tests from QA session)
├── CLAUDE.md                        (UPDATE)
├── ROADMAP.md                       (UPDATE)
├── README.md                        (UPDATE)
└── package.json                     (NEW only if needed for SheetJS via CDN preferred)
```

**Stack constraints:**
- Vanilla JS ES modules — no React, Vue, Svelte
- No bundler — direct `<script type="module">` imports
- External deps via CDN only (SheetJS for Excel, Supabase JS client)
- Vercel deployment from GitHub stays unchanged

---

## 4. PHASED BUILD PLAN

Implement phases in order. **Commit at the end of each phase.** Do not advance until acceptance criteria pass.

---

### PHASE 1 — Refactor + Theme System

**Goal:** Break `app.html` into the file structure above and ship the two-theme system.

**Tasks:**
1. Move all inline JS in `app.html` into `/src/` modules per the structure
2. Move inline CSS into `/src/styles/tokens.css`, `app.css`, `components.css`
3. Replace v2 colour palette with v3 two-theme system (Theme A default)
4. Add theme toggle button in header (moon/sun icon, DM Mono)
5. Save selected theme to `localStorage` under key `arbor:theme`
6. Ensure ALL colours flow through CSS variables — grep the codebase, no hex literals should remain in JS or component CSS
7. Update CSS so the optimal path uses `--hero` (terracotta), not `--accent` (gold). Gold is now reserved for UI accents (buttons, borders, sparklines), terracotta for the moment-of-insight visualisations.
8. Port the 35 unit tests from the QA session into `/tests/engine.test.js` (use a minimal vanilla test runner — no Jest dependency)

**Acceptance:**
- App loads with Warmed Ink theme by default
- Toggle switches to Editorial Light, persists across reload
- No visible regression vs v2 functionality
- All tests pass
- Lighthouse performance ≥ 90 on `app.html`
- File structure matches §3 exactly

**Commit:** `feat: refactor to module structure and ship two-theme system`

---

### PHASE 2 — CDF Toggle + Web Worker

**Goal:** Move simulation off main thread, add CDF view to the EV distribution chart.

**Tasks:**
1. Move `monteCarlo.js` simulation loop into `/src/sim/worker.js`. Main thread posts `{tree, settings}`, worker streams progress and final results back.
2. Progress streams at 5% intervals — main thread updates the status bar and feeds the exploration animation
3. Animation phase 2 ("exploration") continues to sample paths from the live iteration stream coming from the worker
4. Add a tab toggle on the EV Distribution panel of the dashboard: `PDF | CDF`
5. CDF view: cumulative distribution curve, with three readable callouts (P10, P50, P90) and a hover-readout showing `P(EV ≤ X) = Y%`
6. Both views use the same `--hero` terracotta colour for the fill; gridlines in `--line`

**Acceptance:**
- 10k iterations on a 50-node tree completes in ≤ 1.5s with UI staying responsive
- CDF view renders correctly; toggling between PDF and CDF is instant (no re-simulation)
- Hover on CDF shows accurate `P(EV ≤ X)` readout
- Determinism preserved: same seed → byte-identical results

**Commit:** `feat: web worker simulation + CDF distribution view`

---

### PHASE 3 — 2-Variable Sensitivity Heatmap

**Goal:** Ship the differentiator visualisation — joint sensitivity across two inputs.

**Tasks:**
1. New panel in the dashboard: "Joint Sensitivity"
2. UI: two dropdowns letting the user pick any two distribution-mode inputs (probabilities or payoffs) from the current tree
3. Heatmap engine in `/src/sim/sensitivity.js`:
   - 20×20 grid sweeping each input across [P5, P95] of its distribution
   - At each grid cell, run a *reduced* Monte Carlo (1,000 iterations) with the two inputs fixed at that grid cell, all other distributions sampled normally
   - Record mean EV AND which decision is optimal at each cell
4. Render two-layer heatmap:
   - **Background colour:** continuous gradient on mean EV (terracotta for high, navy/charcoal for low — use the diverging palette in Theme A; in Theme B use cream-to-terracotta)
   - **Overlay:** thin contour line where optimal decision flips (this is the killer chart — "at what oil price + cost of capital does the recommendation change?")
5. Axis labels show input names + variable units; tooltip on cell shows `(input1, input2) → EV $X, optimal: Y`
6. Compute on demand (user clicks "Generate"), not auto-run — heatmap is expensive (400 cells × 1k iter = 400k samples)

**Acceptance:**
- Heatmap generates in ≤ 4s for the default tree
- Decision-flip contour visible when one is appropriate; absent when the same decision is optimal across the entire grid
- Works in both themes — colour scale defined via CSS variables, not hardcoded
- Disabled when fewer than 2 distribution-mode inputs exist; tooltip explains why

**Commit:** `feat: 2-variable sensitivity heatmap with decision-flip contour`

---

### PHASE 4 — Excel Export (Decision Tree)

**Goal:** Generate an audit-ready Excel workbook from any decision tree + simulation results.

**Library:** SheetJS (xlsx) via CDN — `https://cdn.sheetjs.com/xlsx-latest/package/xlsx.full.min.js`

**Tasks:**
1. "Export to Excel" button in the header, enabled only after a simulation has been run
2. Generate workbook with **six sheets** (in order):

   **Sheet 1 — Cover**
   - Title (decision name), date, analyst (placeholder), iteration count, seed
   - Hero box: EV P50, mean, stdev, VaR
   - Optimal decision name + stability %
   - Methodology footnote (3 bullets summarising MC approach)
   - Formatted as a JP Morgan IC memo cover page — heavy whitespace, clear hierarchy

   **Sheet 2 — Tree Structure**
   - Flat table, one row per branch
   - Columns: NodeID, ParentID, NodeType, NodeLabel, BranchID, BranchLabel, ProbabilityMode, ProbabilityValue/Params, PayoffMode, PayoffValue/Params
   - This is the source of truth for auditors

   **Sheet 3 — Iteration Sample**
   - Raw 10,000-row × N-column table: each row one iteration, columns are sampled probability/payoff for each distribution-mode input, plus final EV
   - Lets the auditor recompute any statistic
   - First row contains column headers in DM Mono-style formatting

   **Sheet 4 — Rollback Trace** (the credibility-winning sheet)
   - For iteration 0 specifically, show the step-by-step rollback
   - For each chance node: sampled probabilities, sibling sum, normalisation factor, normalised probabilities, child values, weighted EV
   - For each decision node: child values, max, optimal branch chosen
   - Final EV at root with the chain reconstructable
   - Reads like @Risk's "Detailed Statistics" output

   **Sheet 5 — Results**
   - Block 1: percentiles table (P5/P10/P25/P50/P75/P90/P95)
   - Block 2: summary stats (mean, stdev, min, max, VaR(5%))
   - Block 3: path stability table (path, count, %)
   - Block 4: tornado table (driver, low EV, high EV, |ΔEV|)
   - All as values — no formulas (these are outputs, not inputs)

   **Sheet 6 — Visual Tree**
   - Programmatic Excel shapes drawing the tree
   - Rectangles for decisions, ovals for chance, rounded rectangles for terminals
   - Branch labels with probabilities annotated alongside connectors
   - **Read-only by design** — for visual reference, not editing (users wanting to edit re-import JSON to Arbor)
   - Use SheetJS's shape API; positions derived from the canvas world coordinates
   - Use Theme A colours in the Excel (terracotta for optimal path, champagne for accents)

3. Filename: `arbor-decision-{slugified-title}-{YYYYMMDD}.xlsx`
4. Generate entirely client-side — no server roundtrip
5. Gate behind Pro tier (use existing `isPro()` stub; Phase 6 wires the real check)

**Acceptance:**
- All six sheets generate without errors for the default tree
- Iteration Sample sheet has exactly 10,001 rows (header + 10k iterations)
- Rollback Trace mathematically reconciles to the Results sheet's first iteration
- Opens cleanly in Excel, Numbers, Google Sheets, LibreOffice
- File size under 2MB for default tree
- Visual Tree sheet renders shapes at human-readable scale

**Commit:** `feat: six-sheet Excel export for audit-ready decision tree output`

---

### PHASE 5 — MACC Tool (Separate Mode)

**Goal:** Add a second analysis mode alongside the decision tree — Marginal Abatement Cost Curve builder with optional Monte Carlo on cost/volume inputs.

**Architecture decision:** MACC is a *separate page/route* under the same app, not a node type inside the decision tree. Reasons:
- MACC inputs are fundamentally tabular (measures with cost $/tCO₂, volume tCO₂)
- The output viz is a stepped chart, not a tree
- Conflating them creates UX confusion

**Routing:**
- `app.html` → decision tree builder (current default)
- `app.html#macc` → MACC builder
- Header gets a "Mode" toggle: `Decision Tree | MACC`

**Tasks:**

1. **Data model** (`/src/macc/maccModel.js`):
```js
{
  schemaVersion: "1.0",
  meta: { title, sector, abatementTargetTCO2, date },
  measures: [
    {
      id, name, sector,
      cost:   { mode: "fixed"|"distribution", fixed, dist, distType },  // $/tCO2
      volume: { mode: "fixed"|"distribution", fixed, dist, distType },  // tCO2/yr
      sequence: 1  // order in implementation pipeline
    }
  ],
  settings: { iterations, seed, currency }
}
```

2. **MACC canvas/UI** (`/src/macc/maccCanvas.js`):
   - Spreadsheet-style table for measure entry: Name | Sector | Cost ($/tCO₂) | Volume (tCO₂) | Notes
   - Click any cell to inline-edit
   - Click "+" row to add measure
   - "Distribution" toggle on cost and volume cells (same UX pattern as the tree's branch editor)

3. **MACC chart** (`/src/macc/maccChart.js`):
   - Classic stepped bar chart: x-axis = cumulative abatement (tCO₂), y-axis = cost ($/tCO₂)
   - Bars sorted ascending by cost (the "merit order")
   - Negative-cost measures highlighted in `--positive` (sage)
   - Positive-cost measures in `--accent` (gold)
   - Above-target measures (cost > willingness to pay) in `--text-muted`
   - Abatement target shown as vertical dashed line in `--hero` (terracotta)
   - Each bar labelled with measure name on hover

4. **Monte Carlo on MACC** (Pro):
   - Sample each measure's cost and volume across iterations
   - Per iteration: re-sort measures by sampled cost (merit order can change!), recompute cumulative curve
   - Outputs:
     - P10/P50/P90 envelope on the stepped curve (shaded ribbon)
     - "Probability measure X is below target" per measure (a measure-stability table)
     - Expected cost to meet target with confidence intervals

5. **Excel export — MACC** (`/src/export/excelMACC.js`):
   - **Sheet 1 — Cover:** title, sector, target, summary stats
   - **Sheet 2 — Measures:** flat table of all measures with cost/volume mode + values/params
   - **Sheet 3 — Curve:** resolved stepped curve at point estimates (cumulative tCO₂, cost $/tCO₂, measure name)
   - **Sheet 4 — Iteration Sample:** if MC was run, 10k rows × measures with sampled cost/volume
   - **Sheet 5 — Results:** measure stability table, cost-to-target percentiles
   - **Sheet 6 — Visual Curve:** Excel chart object embedded so the user can copy it to PowerPoint

6. **Shared state:** A user's signed-in account holds both their decision trees AND their MACC models. They appear in a unified "My Analyses" list (Phase 6).

**Acceptance:**
- MACC mode loads at `app.html#macc`
- Default MACC loads with 5 realistic abatement measures (e.g. LED lighting -$50/tCO₂, fleet EV +$120/tCO₂, etc.)
- Stepped chart renders correctly, negative-cost measures highlighted differently
- Distribution mode on cost/volume runs MC; envelope renders on chart
- Excel export produces 6 sheets, opens cleanly
- Theme A and Theme B both render correctly

**Commit:** `feat: MACC mode — abatement cost curve builder with Monte Carlo and Excel export`

---

### PHASE 6 — Supabase Auth + Stripe Billing

**Goal:** Add authentication, cloud-saved analyses, and a working Pro tier.

**Sequence note:** This is intentionally the *last* phase. Free-tier users with a polished tool that exports to Excel are your distribution. Don't gate the first impression behind a signup wall.

**Tasks:**

1. **Supabase project setup**
   - Create project in `ap-southeast-2` (Sydney) region
   - Provision schema via `/src/supabase/schema.sql`:
     ```sql
     create table profiles (
       id uuid primary key references auth.users(id),
       email text,
       full_name text,
       is_pro boolean default false,
       stripe_customer_id text,
       created_at timestamptz default now()
     );

     create table analyses (
       id uuid primary key default gen_random_uuid(),
       user_id uuid references auth.users(id) not null,
       kind text not null check (kind in ('tree', 'macc')),
       title text not null,
       data jsonb not null,
       created_at timestamptz default now(),
       updated_at timestamptz default now()
     );

     alter table profiles enable row level security;
     alter table analyses enable row level security;

     create policy "users read own profile" on profiles for select using (auth.uid() = id);
     create policy "users update own profile" on profiles for update using (auth.uid() = id);
     create policy "users read own analyses" on analyses for select using (auth.uid() = user_id);
     create policy "users insert own analyses" on analyses for insert with check (auth.uid() = user_id);
     create policy "users update own analyses" on analyses for update using (auth.uid() = user_id);
     create policy "users delete own analyses" on analyses for delete using (auth.uid() = user_id);

     create index idx_analyses_user on analyses(user_id, updated_at desc);
     ```

2. **Auth UI** (`/src/ui/auth.js`):
   - Header gains a "Sign In" button (right side)
   - Click opens a centred modal with email + password fields and "Sign in with Google" button
   - Tabs: Sign In | Create Account
   - On signup, send a magic-link confirmation (Supabase default)
   - Signed-in state replaces button with user email + dropdown (My Analyses, Account, Sign Out)

3. **Persistence abstraction** (`/src/model/persistence.js`):
   - Existing `saveState`/`loadState` becomes a router:
     - Signed-out → `localStorage`
     - Signed-in → Supabase `analyses` table
   - Autosave debounced to 1 second post-edit
   - "My Analyses" sidebar (collapsible from header) listing all saved trees + MACC models, with rename/delete actions

4. **Pro tier gating** — features locked behind `is_pro`:
   - Monte Carlo simulation
   - Distribution mode on any input
   - All dashboard visualisations except point-estimate EV
   - 2-variable heatmap
   - Excel export (both tree and MACC)
   - Save more than 3 analyses (free tier cap)

5. **Stripe Checkout**
   - "Upgrade to Pro" button on locked features opens a modal: "Decision Intelligence — Pro · $29 AUD/month or $290/year"
   - CTA goes to Stripe Checkout
   - Stripe webhook (Vercel serverless function at `/api/stripe-webhook.js`) listens for `checkout.session.completed` and `customer.subscription.deleted` to flip `is_pro` on the profile
   - "Manage Subscription" link in account dropdown opens Stripe Customer Portal

6. **Environment**
   - Supabase URL + anon key in Vercel env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
   - Stripe public key in Vercel env vars (`STRIPE_PUBLISHABLE_KEY`)
   - Stripe webhook secret + secret key as private env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)

7. **Account page** (`account.html`):
   - User info, subscription status, billing portal link, "Delete account" action
   - Light Editorial theme by default

**Acceptance:**
- Signed-out user has full read access to all v2 functionality (no regression)
- Signing up via email or Google works; account row created in `profiles`
- Free user can save up to 3 analyses; 4th save prompts upgrade
- Upgrading via Stripe flips `is_pro` to true within 10 seconds of payment
- Pro features unlock immediately after subscription activates
- Cancelling subscription via portal sets `is_pro` to false at period end
- RLS policies tested: signed-in user cannot read another user's analyses via direct API call

**Commit:** `feat: supabase auth, cloud-saved analyses, stripe-gated pro tier`

---

## 5. RUNNING DOCUMENT UPDATES

Throughout the build, keep these in sync:

**`CLAUDE.md`** — update with v3 architecture notes, file structure map, methodological rules (§1 of this brief), and Pro-gating logic. This becomes the canonical "how to work on Arbor" doc for future AI sessions.

**`ROADMAP.md`** — replace v2 phase plan with the v3 phases above. After each phase commits, mark it `✓` with date and brief retro note.

**`README.md`** — second-person, dense, no fluff. Match the Arbor voice: editorial, confident, technical. Cover: what Arbor is, who it's for (energy advisors, IC analysts, strategy consultants), how to run locally, deployment, methodology one-liner, link to docs.

**`/tests/engine.test.js`** — port the 35 unit tests, add new tests for each phase's deliverables.

---

## 6. CONSTRAINTS / NON-GOALS

- **Vanilla JS only.** No React, no frameworks. ES modules + CDN-loaded libraries.
- **Client-side compute.** Worker for simulation, but no server-side simulation. Supabase only stores JSON and auth state.
- **No build step.** Direct module imports, Vercel serves static files.
- **Privacy by default.** No analytics SDK in v3. Add Plausible later if needed; never Google Analytics.
- **Australian-hosted data.** Supabase region = `ap-southeast-2`. This is a selling point for AU consulting clients.
- **Preserve the landing page.** `index.html` is sacred — do not regress copy or visual identity.
- **Methodological rules in §1 are correctness constraints, not preferences.** Architect to enforce them. Do not rely on the user not violating them.

---

## 7. OPERATING GUIDELINES

- After every file write, briefly self-check: does this preserve the §1 methodological rules?
- After every phase, run `npm test` (or equivalent) and report results before moving on.
- Commit atomically per task within a phase. Commit messages use conventional commits format (`feat:`, `fix:`, `refactor:`, etc).
- When in doubt aesthetically: less colour, more whitespace, more typographic hierarchy. This is a Lazard tool, not a SaaS dashboard.
- Comment the simulation engine, Excel export, and Supabase persistence generously. The product owner needs to defend the methodology and the data handling to clients.
- If a phase task seems to require breaking a methodological rule, stop. Raise it. Don't paper over.

---

**End of brief. Begin Phase 1.**
