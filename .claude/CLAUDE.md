# Arbor — Decision Intelligence
## CLAUDE.md — AI Coding Instructions

---

## Project Overview

Arbor is a premium web-based decision tree builder for finance professionals.
It helps users model decisions using probability-weighted NPV trees, with live
Expected Value calculation, sensitivity analysis, and optimal path highlighting.

Two files make up the current product:
- `index.html` — Marketing landing page
- `app.html`   — The interactive decision tree application

Both are self-contained single-file HTML apps. No build system. No framework.
Vanilla HTML, CSS, and JavaScript only. All styles and scripts are inline.

---

## Tech Stack

- Pure HTML5 / CSS3 / Vanilla JS
- HTML5 Canvas API for tree rendering
- Google Fonts: Cormorant Garamond, Syne, DM Mono
- No npm. No node_modules. No React. No bundler.
- Deployment: Vercel (static)

---

## Brand & Design System

### Identity
- Product name: Arbor
- Tagline: "Decision Intelligence"
- Tone: Premium, precise, confident. Never casual. Never playful.
- Audience: Finance professionals — analysts, advisors, investors, developers

### Typography
- Title: Playfair
- Display / Headings: Sora (serif, italic for emphasis)
- UI / Labels / Buttons: Sora (sans, weight 600–800 for headings, 400–500 for body)
- Data / Numbers / Code: JetBrains Mono (monospace)
- NEVER use: Inter, Roboto, Arial, system-ui, or any generic sans

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

### Never
- No purple gradients
- No neon glows
- No rounded hero blobs
- No emoji in UI (use geometric SVG shapes: ◆ ◎ ● ⬡)
- No shadows except functional focus rings and selected-node canvas glow
- No border-radius above 12px on cards, 6px on buttons

---

## Code Standards

### General
- All code in a single file per page (inline CSS + JS)
- CSS custom properties (variables) for ALL colours and spacing
- No !important declarations
- Semantic HTML5 elements where appropriate
- All interactive elements must have :hover and :focus states

### JavaScript
- Vanilla ES6+ only
- No jQuery, no lodash, no utility libraries
- Functions named clearly in camelCase
- State stored in module-level let/const — no global pollution
- Canvas redraws called via a single draw() function
- All number formatting through the fmt(value, currency) helper

### CSS
- Variables defined in :root
- Mobile-first where applicable
- Transitions: 0.15s for micro-interactions, 0.25s for modals, 0.8s for scroll reveals
- Font sizes: never below 10px rendered, 9px for uppercase tracking labels only

---

## Application Logic Rules

### Tree Data Model
Every node object must have:
  id, label, x, y, prob, npv, color, tcolor, type, currency, parentId

Every edge object:
  { from: nodeId, to: nodeId }

### Calculations
- Cumulative probability = product of all ancestor node probabilities / 100 each level
- Node EV = sum of (leaf.npv × leaf.cumulativeProb) for all descendant leaves
- Best path = leaf with highest EV contribution, trace back to root
- Format: ≥1B → X.XXB | ≥1M → X.XXM | ≥1K → X.XK | else integer

### Canvas Rendering Order
1. Clear + fill background
2. Draw all edges (grey)
3. Draw best-path edges (gold, thicker)
4. Draw probability labels on edge midpoints
5. Draw all nodes (fill, then border if selected)
6. Draw node text (label + NPV if set)
7. Draw node type icon (top-left corner)

---

## Pro Paywall Features

The following features are NOT implemented yet. When a user triggers them,
show the Pro modal instead. Never silently fail.

- PDF Export
- SVG Export
- Save tree to file
- Load tree from file
- Multiple trees per session

The Pro modal must:
- Blur the background (backdrop-filter: blur(6px))
- Show feature-specific description depending on trigger
- CTA: "Join the Waitlist" → alert('Pro launching soon — hello@arbor.finance')
- Dismiss: click outside or "No thanks" link

---

## What Claude Should Never Do

- Do not introduce a build system, package.json, or npm
- Do not split CSS or JS into separate files unless explicitly asked
- Do not change the font stack
- Do not use gradients on backgrounds (radial accents only, very subtle)
- Do not add new dependencies or CDN libraries without asking
- Do not change the gold (#C9A84C) accent colour
- Do not add emoji to UI elements
- Do not truncate or summarise code — always output complete files
- Do not use localStorage or sessionStorage (not supported in current deployment)

---

## Roadmap (for context — do not implement unless asked)

Phase 2:
- [ ] User accounts (Supabase auth)
- [ ] Save/load trees (Supabase DB)
- [ ] PDF export (jsPDF or Puppeteer serverless)
- [ ] SVG export (canvas to SVG serialisation)
- [ ] Stripe Pro subscription ($19/mo)

Phase 3:
- [ ] Team collaboration (shared tree URLs)
- [ ] Template library (M&A, Project Finance, Renewable)
- [ ] API for embedding trees in reports
- [ ] White-label / branded exports

---

## Deployment

- Host: Vercel
- Entry point: index.html (landing) → app.html (application)
- No server-side code currently
- All assets must be relative paths or Google Fonts CDN only

Add project-specific guidance for Claude here.
