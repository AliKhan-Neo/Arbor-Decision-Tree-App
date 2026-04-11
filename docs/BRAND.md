<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital@1&family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">

<h1 style="font-family:'Playfair Display',serif;font-style:italic;font-size:2rem;font-weight:400;letter-spacing:-0.01em;border-bottom:2px solid #1c1c1c;padding-bottom:12px;margin-bottom:4px;">AK — Brand & Theme Guidelines</h1>

<p style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:#999;margin-bottom:2rem;">Ali Khan · Senior Consultant, Energy Transition · April 2026</p>

---

## 01 — Core Colour Palette

| Token | Hex | Usage |
|---|---|---|
| **Ink** | `#1C1C1C` | Primary — text, masthead, anchoring elements |
| **Parchment** | `#F8F7F4` | Page background |
| **White** | `#FFFFFF` | Card and panel surfaces |
| **Sovereign Green** | `#1E7A45` | Primary accent — positive signal, viable outcomes, CTAs |
| **Crisis Red** | `#C0392B` | Alert, risk, reset controls, eyebrow accents |
| **Deep Navy** | `#1A5276` | Secondary accent — complexity, medium-term, analytical depth |
| **Sovereign Purple** | `#5B2D8E` | Tertiary accent — strategic / high-consequence themes |
| **Deep Teal** | `#0E6655` | Quaternary accent — operational / sector-specific contexts |
| **Amber** | `#C9A227` | Long-horizon, caution, pending states |
| **Slate** | `#555555` | Neutral — inert, default, baseline states |

---

## 02 — Secondary & UI Tones

| Token | Hex | Usage |
|---|---|---|
| **Column Alt** | `#F0EEEA` | Alternating column or row bands (odd) |
| **Column Base** | `#FAFAF8` | Alternating column or row bands (even) |
| **Border Light** | `#E5E5E5` | Panel borders, card edges |
| **Divider** | `#E0DDD8` | Separators in SVG and tabular layouts |
| **Pro Green** | `#1A6E3A` | Positive data points, pros (✓) |
| **Con Red** | `#B03020` | Negative data points, cons (✗) |
| **Success Tint** | `#E6F7ED` | Status badges — complete / active |
| **Pending Tint** | `#FDFBEA` | Status badges — pending / in-progress |

---

## 03 — Typography System

### Typefaces

Two typefaces only. Never mix their roles.

| Typeface | Role |
|---|---|
| **Sora** | All display, heading, body, and UI text |
| **JetBrains Mono** | All metadata, data labels, eyebrows, and technical annotations |

### Type Scale

| Style | Typeface | Size | Weight | Tracking | Transform | Usage |
|---|---|---|---|---|---|---|
| Display | Sora | 20px | 700 | −0.025em | — | Masthead / page title |
| Eyebrow | JetBrains Mono | 9px | 400 | +0.18em | Uppercase | Section labels, date stamps, tool identifiers |
| Section Header | Sora | 13px | 600 | −0.01em | — | Panel and section headings |
| Body | Sora | 8–9px | 400 | — | — | Descriptive and analytical text |
| Caption / Mono | JetBrains Mono | 8px | 400 | — | — | Attribution, source lines, data values |

### Type Rules

- Eyebrow labels are always uppercase + tracked in JetBrains Mono
- Attribution lines use JetBrains Mono with `color: #BBB`, strong elements at `color: #777`
- Italic body text (`font-style: italic`) is reserved for quotes and conditional or contextual labels
- Sora is never used for data labels, numeric values, or hex codes — that belongs to JetBrains Mono

---

## 04 — Semantic Colour System

Colours carry fixed meaning across all AK tools. Never reassign a colour outside its semantic role.

| Colour | Token | Hex | Semantic Role |
|---|---|---|---|
| Sovereign Green | Primary accent | `#1E7A45` | Viable, positive, actionable, short-horizon |
| Deep Navy | Secondary accent | `#1A5276` | Medium complexity, analytical, medium-horizon |
| Sovereign Purple | Tertiary accent | `#5B2D8E` | Strategic, high-stakes, long-horizon |
| Deep Teal | Quaternary accent | `#0E6655` | Operational, sector-specific, niche contexts |
| Amber | Caution | `#C9A227` | Long-horizon, uncertain, pending |
| Crisis Red | Alert | `#C0392B` | Risk, negative signal, reset, danger |
| Slate | Neutral | `#555555` | Inert, default, baseline, do-nothing |

**Rule:** Assign colours by the *nature of the content*, not sequence. Two to three colours per tool is the target — more introduces noise.

---

## 05 — Status & Horizon Tags

### Status Badges

| State | Text Colour | Background | Usage |
|---|---|---|---|
| Complete / Active | `#1E7A45` | `#E6F7ED` | Done, implemented, live |
| Pending / In-progress | `#7D6608` | `#FDFBEA` | Upcoming, partial, in development |

### Time Horizon Tags

| Tag | Text Colour | Background | Timeframe |
|---|---|---|---|
| **Short-term** | `#1E7A45` | `#E6F7ED` | Now → 2 yrs |
| **Medium-term** | `#1A5276` | `#DCE8F5` | 2 → 7 yrs |
| **Long-term** | `#7D6608` | `#FDFBEA` | 7+ yrs |

Tags use `border-radius: 3px`, `font-weight: 600`, `font-size: 8px`, `padding: 2px 7px`.

---

## 06 — Node & Component Anatomy

Applies to any SVG diagram, decision tree, flow, or framework visual built under the AK brand.

**Anchor / root node**
- Fill: `#1C1C1C` (solid Ink)
- Text: white
- Radius: `rx=4`
- Purpose: the entry point or primary framing element of any diagram

**Category nodes**
- Fill: `#FFFFFF`
- Stroke: semantic colour, `stroke-width: 1.8px`
- Banner bar at top: solid fill in semantic colour, white text (`font-weight: 700`, `letter-spacing: 0.06em`)
- Purpose: top-level groupings or strategic options

**Outcome / result boxes**
- Fill: light tint of semantic colour
- Stroke: semantic colour, `stroke-width: 1.3px`
- Header label: `font-size: 7px`, uppercase, tracking `0.09em`, muted fill
- Purpose: terminal nodes, conclusions, recommendations

**Question / decision nodes**
- Fill: `#FFFFFF`
- Stroke: `#CCC`, `stroke-width: 1.2px`, `stroke-dasharray: 5, 3` (dashed)
- Text: italic, `fill: #555`
- Purpose: branching conditions, open questions, filters

**Tag / label nodes**
- Fill: horizon or status tint colour
- Text: matching dark tone, `font-weight: 700`, `font-size: 9px`
- Purpose: classifiers, time tags, category markers

---

## 07 — Layout & Spacing

**Max content width:** `1640px` with `34px` horizontal gutters, `40px` top padding, `56px` bottom padding.

**Border radius:** `rx=4` / `border-radius: 5px` throughout — subtle, never pill-shaped.

**Panel borders:** `1px solid #E5E5E5` for all HTML panels. `0.8px` for internal SVG dividers.

**Column / row bands:** Alternating `#F0EEEA` and `#FAFAF8` at 55% opacity creates visual rhythm without explicit gridlines. Separators use `#E0DDD8` at `stroke-width: 1`.

**Masthead underline:** `2px solid #1C1C1C` — the only heavy rule in any layout.

**No shadows.** Depth is created through tone contrast, not elevation.

**No gradients.** All fills are flat.

---

## 08 — UI Controls

**Filter / toggle buttons**
- Default: `background: #FFF`, `border: 1px solid #DDD`, `color: #555`
- Hover: `border-color: #999`, `color: #1C1C1C`
- Active (neutral): `background: #1C1C1C`, `color: #FFF`
- Active (semantic): inherits the relevant semantic colour as background
- Font: Sora, `font-size: 9px`, `font-weight: 500`
- Padding: `3px 9px`, `border-radius: 3px`
- Transition: `all 0.18s ease`

**Reset / destructive button**
- Border: `1.5px solid #C0392B`, `color: #C0392B`, transparent background
- Hover: `background: #C0392B`, `color: #FFF`

**Control group labels**
- JetBrains Mono, `font-size: 7.5px`, `letter-spacing: 0.12em`, uppercase, `color: #AAA`

**Separator between control groups**
- `width: 1px`, `height: 22px`, `background: #EEE`

---

## 09 — Harvey Ball Rating Scale

For use in any AK tool that scores financeability, risk, readiness, or viability.

| Ball | Rating | Meaning | Implication |
|---|---|---|---|
| ○ | Very Low | Cannot close / not ready | Government grant or guarantee required |
| ◔ | Low | Significant barriers remain | Concessional finance or heavy support needed |
| ◑ | Medium | Possible with strong conditions | Requires policy support or anchor commitment |
| ◕ | High | Bankable / viable with standard process | Familiar to lenders or evaluators, models cleanly |
| ● | Very High | Closes today / fully proven | Competitive market, no subsidy needed |

**Colour coding by rating:**
Very High `#1E7A45` · High `#1A5276` · Medium `#5B2D8E` · Low `#C9A227` · Very Low `#C0392B`

**Tooltip anatomy:** subject label (JetBrains Mono, `#888`, uppercase) → rating text (Sora, `700`, coloured) → explanatory note (Sora, `9.5px`, `#CCC`) → definition footer (Sora, `8.5px`, `#888`, rule above).

---

## 10 — Design Principles

### Do
- Use Sora and JetBrains Mono only — no third typeface, ever
- Lead all page backgrounds with Parchment (`#F8F7F4`), never pure white
- Apply colours by semantic role — green for viable, red for risk, grey for neutral
- Keep borders subtle: `1px` max in HTML, `1.8px` max in SVG node strokes
- Use JetBrains Mono for every number, percentage, hex value, data label, and source attribution
- Use uppercase + tracked letterforms for all eyebrow and label text
- Anchor every layout with the `2px solid #1C1C1C` masthead rule

### Don't
- Use pure white (`#FFFFFF`) as the page-level background
- Use a semantic colour outside its defined role
- Apply gradients or drop shadows anywhere in the system
- Use Crisis Red outside of alert, reset, or negative-outcome contexts
- Use Sovereign Green outside of positive, viable, or primary-accent contexts
- Add a third typeface — Sora and JetBrains Mono are sufficient for all contexts
- Mix typeface roles — mono is always data, Sora is always narrative

---

## 11 — Brand Voice & Content Style

- **Practitioner, not pundit.** Write from domain expertise. Avoid editorial hedging.
- **Data-first.** Every claim should be traceable to a credible source (IEA, ARENA, AEMO, Oxford Economics, Ember, CSIS, Columbia CGEP).
- **Security over sustainability.** Frame energy transition arguments around sovereignty, resilience, and capital allocation — not ESG or moral obligation.
- **No verbal slop.** Avoid filler phrases, passive constructions, and buzzwords. Every sentence should add analytical weight.
- **Short sentences in data contexts.** Long sentences belong in narrative; data panels use fragments.
- **Sources always in JetBrains Mono**, separated by `·` (middle dot), trailing the attribution line.

---

## 12 — Applying the System to New Tools

For every new AK interactive tool or document:

- Carry **Parchment + Ink** as the non-negotiable base pair
- Use **Sovereign Green** as the primary interactive accent and CTA colour
- Use **JetBrains Mono** for all metric readouts, axis labels, filter labels, and data values
- Use **Sora 700** for all tool titles and section headers; **Sora 400–500** for body
- Reserve **Crisis Red** for reset controls, alerts, and negative-outcome states only
- Apply the **alternating band pattern** (`#F0EEEA` / `#FAFAF8`) in any tabular or columnar layout
- The **Harvey Ball scale** is portable — apply it to any scoring, rating, or readiness output
- Every tool carries the **AK eyebrow** (JetBrains Mono, uppercase, tracked, `#999`) identifying author, role, and date

---

<p style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:#BBB;border-top:1px solid #DDD;padding-top:12px;margin-top:2rem;">AK Design System · Ali Khan · Senior Consultant, Energy Transition · Worley · April 2026</p>