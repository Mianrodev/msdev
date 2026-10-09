# Designer handoff — opportunity workspace

Live preview of every component and variant: **`/design`** (sign in first). Switch brands with
`/design?brand=default|meridian|fieldstone`. The preview uses the real components, so what you see is what ships.

## Where things live

| What | File |
|---|---|
| Brand tokens (colours light + dark, fonts, radii, shadows, spacing, names) | `src/brand/brands.ts` |
| Interface copy (every sentence a reseller may change) | `src/brand/copy.ts` |
| Workspace styles (all `.op-*` classes) | `src/app/opportunities/opportunities.css` |
| Base app styles (buttons, inputs, tables, layout) | `src/app/globals.css` |
| Components | `src/components/opportunities/` (`ui.tsx`, `results.tsx`, `area-map.tsx`, `icons.tsx`, `client.tsx`) |

No colour, radius, shadow, font or spacing value is hard-coded in the workspace CSS — everything reads a CSS
variable generated from the brand file.

## Brands

One deployment uses one brand: set `BRAND=<id>` in the hosting environment. Three ship:

- **default** — the existing Prospect CRM look (unchanged for current users).
- **meridian** — formal bid-intelligence brand: navy and teal, Georgia headings, tight radii.
- **fieldstone** — friendly growth brand: green and amber, rounded corners, warmer neutrals.

To add a brand: copy one of the objects in `brands.ts`, change the values, add it to `BRANDS`, deploy with
`BRAND=<your id>`. Override any copy key in the brand's `copy` field. No other code changes are needed.

### Tokens

| Token (CSS variable) | Purpose |
|---|---|
| `--bg`, `--surface`, `--surface-2` | Page, cards, subtle fills |
| `--text`, `--muted`, `--border` | Text, secondary text, dividers |
| `--accent`, `--accent-soft`, `--accent-text` | Primary actions, selected states, score rings |
| `--ok`/`--ok-bg`, `--warn`/`--warn-bg`, `--bad`/`--bad-bg` | Status: confirmed, check this, failed/blocked |
| `--demo`/`--demo-bg` | **Demo data labelling only** — keep it distinct from status colours |
| `--focus` | Keyboard focus ring |
| `--font-body`, `--font-heading`, `--font-mono`, `--font-size-base` | Typography |
| `--radius-sm` (controls), `--radius` (cards), `--radius-lg` (panels), `--radius-pill` (chips) | Corners |
| `--shadow-sm/md/lg` | Elevation |
| `--space-1 … --space-6` | Spacing scale (0.25×, 0.5×, 1×, 1.5×, 2×, 3× the brand's unit) |

Dark mode follows the operating system (`prefers-color-scheme`); each brand defines a `dark` palette.
Keep text/background contrast at WCAG AA (4.5:1 for body text) in both palettes, including chip text on its
`-bg` colour. Fonts are referenced by name with system fallbacks; to self-host a web font add it via
`next/font` in `src/app/layout.tsx` and put its family name first in the brand's font stack.

## Components and variants

| Component | Variants | Notes |
|---|---|---|
| `ModeChip` | demo, live | Must appear wherever records appear. Text comes from copy keys `demo.badge` / `live.badge`. |
| `Chip` | neutral, info, ok, warn, bad | Status, evidence kind, flags. |
| `Banner` | demo, info, ok, warn (partial results), bad (failed search) | Has role=status / alert. |
| `ScoreRing` | scored, low, not scored | Shows 0–100 plus “% data” coverage. Never show a score without coverage. |
| `ScoreBreakdown` | — | Criterion, weight share, bar, explanation, total. The working behind every score. |
| `FieldRow` | known, unknown, conflict, critical (with original wording), with metric meta | Unknown must look different from a value; conflicts show every value with its source. |
| `EvidenceList` | per evidence kind | Published / claimed / verified / third-party / calculated / AI — keep these visually distinct. |
| `ResultCard` | normal, excluded (dashed), saved | Score, chips, key facts, reasons, “things to check”, actions, compare checkbox. |
| `ResultsTable` | — | Same data, dense. Horizontal scroll inside its own container on small screens. |
| `AreaMap` | — | Schematic (no tiles). Can be replaced with a tile map; it only takes points. |
| `EmptyState` | start, no matches, nothing saved | |
| Loading | skeleton (`.op-skel`), search progress (`.op-progress`) | Respects `prefers-reduced-motion`. |
| `WorkspaceTabs` | — | Horizontal scroll on narrow screens; current tab uses `aria-current`. |

## Content rules designers should keep

- Never style “Unknown” to look like an empty cell or a zero — it is information.
- “AI summary” and “Suggestion” labels must stay visible and must not look like published facts.
- Demo labelling must stay on results, details, comparisons and exports.
- Scores are comparative research aids: keep the “% data” coverage and the explanation link next to them.

## Accessibility checklist (already implemented — keep when restyling)

Skip link; landmarks and labelled navigation; every input has a visible label; radio group for demo/live;
range sliders announce their value; focus-visible ring on all controls; tables have captions and scoped
headers; map pins are links with titles and the comparison table is the text equivalent; status changes
announced via role=status; no information conveyed by colour alone (icons/text accompany status colours);
layouts tested at 390px with no horizontal page scroll.
