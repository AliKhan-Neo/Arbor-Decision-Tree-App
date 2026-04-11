# Arbor — Decision Intelligence

> **Think in trees. Decide with clarity.**

Arbor is a premium web-based decision tree builder for finance professionals. It turns complex capital decisions into interactive probability trees — with live Expected Value calculation, sensitivity analysis, and the optimal path always highlighted in gold.

---

## What It Does

You define a decision. You branch it into scenarios. You assign probabilities and NPV values. Arbor does the rest — calculating probability-weighted Expected Value across every path, highlighting the best one, and letting you stress-test any assumption with a sensitivity slider.

Built for: M&A decisions, infrastructure investment, project finance, renewable energy development, and any decision where the answer is "it depends on probabilities."

---

## Live App

| Page | URL |
|---|---|
| Landing page | `your-project.vercel.app` |
| Decision tree app | `your-project.vercel.app/app.html` |

---

## Project Structure

```
arbor/
├── index.html          Landing page (dark editorial, premium aesthetic)
├── app.html            Decision tree builder application
├── assets/
│   ├── fonts/          Local font copies (optional)
│   └── icons/          Favicon, OG image, app icons
├── docs/
│   ├── BRAND.md        Brand bible — colours, typography, tone of voice
│   ├── ROADMAP.md      Full product roadmap (Phase 1–5)
│   └── PRO_FEATURES.md Paywall specification and implementation notes
├── .claude/
│   └── CLAUDE.md       AI coding instructions for this project
└── README.md           This file
```

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla HTML5 / CSS3 / JS | No build step, instant deploy, zero dependencies |
| Rendering | HTML5 Canvas API | Performant interactive tree with pan/zoom/drag |
| Fonts | Google Fonts CDN | Cormorant Garamond, Syne, DM Mono |
| Hosting | Vercel | Free tier, global CDN, instant deploys |
| Auth (planned) | Supabase | Open source, generous free tier |
| Payments (planned) | Stripe | Industry standard, great DX |
| Database (planned) | Supabase PostgreSQL | Pairs with auth, real-time capable |

**No npm. No node_modules. No bundler. No framework.**

Both `index.html` and `app.html` are fully self-contained — all CSS and JavaScript is inline. Open either file in a browser and it works.

---

## Local Development

### Prerequisites

- Any modern browser (Chrome recommended for Canvas2D fidelity)
- VS Code with the **Live Server** extension

### Getting Started

```bash
# Clone or download the project
git clone https://github.com/yourusername/arbor.git
cd arbor

# Open in VS Code
code .

# Right-click index.html → "Open with Live Server"
# App runs at http://127.0.0.1:5500
```

No `npm install`. No `npm run dev`. Just open and go.

### Recommended VS Code Extensions

| Extension | Purpose |
|---|---|
| Live Server | Instant hot reload on save |
| Prettier | Auto-format HTML/CSS/JS |
| ESLint | Catch JS errors early |
| Color Highlight | See colour swatches inline next to hex codes |
| CSS Variable Autocomplete | Autocomplete your `--gold`, `--ink` tokens |
| GitLens | Inline git history and blame |
| Vercel for VS Code | Deploy without leaving the editor |

### Editor Settings

Add to your VS Code `settings.json`:

```json
{
  "editor.fontFamily": "Monaspace Krypton, DM Mono, monospace",
  "editor.fontSize": 13,
  "editor.lineHeight": 1.7,
  "editor.tabSize": 2,
  "editor.wordWrap": "on",
  "editor.formatOnSave": true,
  "workbench.colorTheme": "One Dark Pro",
  "editor.minimap.enabled": false,
  "liveServer.settings.port": 5500
}
```

---

## Design System

### Typefaces

| Role | Font | Where used |
|---|---|---|
| Display / Headings | Cormorant Garamond | Hero titles, section headings, modal headings |
| UI / Labels | Syne | Buttons, nav, panel labels, body copy |
| Data / Numbers | DM Mono | EV readouts, probabilities, code |

### Colour Tokens

| Token | Hex | Usage |
|---|---|---|
| `--gold` | `#C9A84C` | Primary accent — CTAs, highlights, best path |
| `--gold-light` | `#E8C97A` | Hover state on gold elements |
| `--gold-dark` | `#8B6914` | Gold text on light backgrounds |
| `--ink` | `#08080A` | Page background (dark surfaces) |
| `--ink-2` | `#141416` | Dark surface cards |
| `--ink-3` | `#1E1E22` | Default node fill |
| `--surface` | `#F6F3EE` | App canvas background |
| `--surface-2` | `#EDEAE2` | Panel backgrounds |
| `--surface-3` | `#E0DDD5` | Input backgrounds, dividers |

### Design Rules

- Gold is the only accent colour. One accent, used deliberately.
- Serif italic for emphasis — never bold italic, never underline.
- Geometric symbols instead of emoji: `◆ ◎ ● ⬡` for UI indicators.
- No purple gradients, no neon glows, no hero blobs.
- Border radius: max 12px on cards, 6px on buttons, 4px on inputs.

Full brand specification: `docs/BRAND.md`

---

## Application Logic

### Data Model

**Node:**
```javascript
{
  id: Number,           // Unique identifier
  label: String,        // Display name
  x: Number,           // Canvas world X position
  y: Number,           // Canvas world Y position
  prob: Number,         // Probability (0–100)
  npv: Number | null,  // Value at this node (terminal nodes)
  color: String,        // Fill colour (hex)
  tcolor: String,       // Text colour (hex)
  type: String,         // 'decision' | 'chance' | 'terminal'
  currency: String,     // '$' | 'A$' | '£' | '€' | '¥'
  parentId: Number | null  // null for root nodes
}
```

**Edge:**
```javascript
{ from: Number, to: Number }  // Node IDs
```

### Key Calculations

**Cumulative Probability:**
```
P(node) = (node.prob / 100) × P(node.parent)
P(root) = 1
```

**Expected Value at any node:**
```
EV(node) = Σ (leaf.npv × P(leaf)) for all descendant leaves with npv set
```

**Best Path:**
The path from root to the terminal leaf with the highest EV contribution (`leaf.npv × P(leaf)`).

**Number Formatting:**
```
≥ 1,000,000,000  →  $X.XXB
≥ 1,000,000      →  $X.XXM
≥ 1,000          →  $X.XK
< 1,000          →  $X
```

### Canvas Rendering Order

1. Clear + fill background colour
2. Draw all edges (muted grey, bezier curves)
3. Draw best-path edges (gold, +1.5px wider)
4. Draw probability % labels at edge midpoints
5. Draw all node fills
6. Draw selected node outline (gold glow)
7. Draw best-path node outlines (gold, thinner)
8. Draw node labels (Syne, centred)
9. Draw NPV values below label (DM Mono, if set)
10. Draw node type icon (top-left corner of node)

---

## Pro Paywall

The following features show a Pro upgrade modal instead of executing:

| Feature | Trigger | Modal Description |
|---|---|---|
| PDF Export | Header button | Pixel-perfect, print-ready PDF for client reports |
| SVG Export | Header button | Fully editable vector file for Figma / Illustrator |
| Save trees | (Phase 2) | Persist trees to your account |
| Load trees | (Phase 2) | Restore any previously saved tree |

The modal is in `app.html` — search for `id="modal"`. The `showProModal(type)` function handles which description text to show based on the trigger.

**Planned Pro price:** $19/month. **Planned launch:** Q4 2025.

To activate the paywall properly (Stripe + Supabase) — see `docs/PRO_FEATURES.md`.

---

## Deployment

### Vercel (Current)

```bash
# Option 1 — Drag and drop
# Go to vercel.com/new → drag the project folder → done

# Option 2 — Vercel CLI
npm i -g vercel
vercel login
vercel --prod
```

Vercel auto-detects this as a static site. No configuration needed.

**Custom domain:** Vercel Dashboard → Project → Settings → Domains → Add domain.

### Environment Variables

None required for the current static version.

When Supabase and Stripe are added (Phase 2), you will need:

```env
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

These will be added as Vercel environment variables — never committed to the repo.

---

## Working with AI Coding Assistants

This project includes a `.claude/CLAUDE.md` file that gives Claude (and other AI assistants in your editor) full context about the project — the tech stack, brand rules, data model, and what not to touch.

**If you are using Claude Code (terminal):**
```bash
cd arbor
claude  # CLAUDE.md is loaded automatically
```

**If you are using Cursor or Windsurf:**
The `.claude/CLAUDE.md` file will be picked up as project context automatically in most AI editor setups. You can also copy its contents into a `.cursorrules` file for Cursor-specific behaviour.

**Prompt tip for any AI assistant:**
> "Read CLAUDE.md before making any changes. Output complete files — never truncate. Keep all styles inline."

---

## Roadmap Summary

| Phase | Focus | Timeline |
|---|---|---|
| v0.1 | Core tree builder + landing page | ✅ Shipped |
| Phase 1 | UX polish, undo/redo, calculation improvements | Q3 2025 |
| Phase 2 | Auth, Stripe Pro, PDF/SVG export, save/load | Q4 2025 |
| Phase 3 | Sharing, templates, branded reports, API | Q1 2026 |
| Phase 4 | AI tree generation, Monte Carlo simulation | Q2–Q3 2026 |
| Phase 5 | Enterprise, teams, SSO, white-label | Q4 2026 |

Full detail: `docs/ROADMAP.md`

---

## Contributing

This is currently a solo project. If you are a collaborator:

1. Branch from `main` — never commit directly to main
2. Follow the design system exactly — no new fonts, no new colours without discussion
3. Read `.claude/CLAUDE.md` before writing any code
4. Test in Chrome first, then Firefox and Safari
5. Output complete files when editing HTML — no partial patches

---

## Contact

**Product:** hello@arbor.finance  
**Bugs / Feedback:** hello@arbor.finance  
**Press:** hello@arbor.finance

---

*Arbor is a decision intelligence tool. It is not financial advice. All probabilities and NPV values are user-defined assumptions — the output is only as good as the inputs.*