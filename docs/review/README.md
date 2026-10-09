# Visual review package — opportunity workspace

Screenshots taken on 9 Oct 2026 from a **production build** (`next build` + `next start`) with Playwright/Chromium,
desktop at 1360 px wide and mobile at 390 px (2× density). Long pages are cropped at 2,600 px. Demo screens use
fictional data (labelled “Demo data”); screens 04–06 are **live** Find a Tender data from that day.

| # | Screen | File |
|---|---|---|
| 01 | Workspace overview (default brand) | `01-overview.jpg` |
| 02 | Tenders — demo results (scores, flags, conflicting budget) | `02-tenders-demo-results.jpg` |
| 03 | Tender detail — deadline banner, score breakdown, evidence, original wording, notes, lists | `03-tender-detail.jpg` |
| 04 | Tenders — live coverage stated **before** searching | `04-tenders-live-coverage-before-search.jpg` |
| 05 | Tenders — live results with the coverage banner | `05-tenders-live-results.jpg` |
| 06 | Tenders — live search with no matches (says it's not evidence of none) | `06-tenders-live-empty.jpg` |
| 07 | Sponsors — results | `07-sponsors-results.jpg` |
| 08 | Sponsor detail — dated evidence, labelled suggestion | `08-sponsor-detail.jpg` |
| 09 | Suppliers — results (claimed vs verified certifications, MOQ conflict) | `09-suppliers-results.jpg` |
| 10 | Suppliers — comparison view | `10-suppliers-comparison.jpg` |
| 11 | Locations — map, comparison table, ranked areas | `11-locations-results.jpg` |
| 12 | Location detail — strengths, trade-offs, research gaps, metric metadata | `12-location-detail.jpg` |
| 13 | Partial results (one demo source simulated to fail) | `13-partial-results.jpg` |
| 14 | Saved items and named lists | `14-saved-lists.jpg` |
| 15 | Sources page — licences, live coverage, AI settings and limits | `15-sources.jpg` |
| 16 | Component gallery under each example brand | `16-design-meridian.jpg`, `16-design-fieldstone.jpg` |
| 20–23 | Mobile: overview, tender results (results first), tender detail, locations | `20-…` to `23-…` |
| B | The real app run with `BRAND=meridian` and `BRAND=fieldstone`: overview, tender results, tender detail | `brand-meridian-*.jpg`, `brand-fieldstone-*.jpg` |

## Run and preview it yourself

Requirements: Node.js 20.9+ (tested on Node 22). No database install — an embedded Postgres is used.

```bash
git clone https://github.com/Mianrodev/msdev.git
cd msdev
git checkout claude/elegant-goodall-pwc8tu
npm ci
npm run dev                # migrates the embedded database, then serves http://localhost:3000
```

1. Open http://localhost:3000. The **first visit creates the owner password** (10+ characters).
2. Click **Opportunities** in the top bar (or go to http://localhost:3000/opportunities).
3. Optional: **Company profile** → add services (e.g. `website design, accessibility`), regions, certifications.
4. Open any module and press **Search** — demo mode needs no keys. Try the same searches as the screenshots:
   - Tenders: keywords `accessibility, website`
   - Sponsors: description `A community trail running and cycling festival for families`, audience `families, runners, cyclists`, location `United Kingdom`
   - Suppliers: product `tote bags`, certifications `GOTS, ISO 9001`, max MOQ `800`, tick private label
   - Locations: category `coffee shop`, target geography `Riverton`, existing location `Old Town`, profile *Young professionals*
5. **Live tenders:** in Tenders, choose **Live** and search (needs outbound internet to `www.find-tender.service.gov.uk`).
6. **Failure states:** set “Demo only → Simulate a source problem” to *One source times out* or *All sources fail*.
7. **Compare:** tick “Compare” on 2–6 results → **Compare selected**. **Export:** “Export CSV” on results or Saved & lists.
8. **Component gallery:** http://localhost:3000/design?brand=meridian (or `fieldstone`, `default`).
9. **Whole app in another brand:** stop the server and run `BRAND=meridian npm run dev` (or `fieldstone`).

Production-style run: `npm run build && npm start` (the build reads the database, so run `npm run db:migrate` first
if you build without `npm run dev` having run once). Checks: `npm run typecheck`, `npm run lint`, `npm test`.

Optional settings are listed in `.env.example` (live tender window, usage limits, AI summaries — off by default).
