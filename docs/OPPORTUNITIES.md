# Opportunity workspace — setup, architecture and providers

The opportunity workspace (`/opportunities`) is a discovery product with four modules, built into this app
alongside the existing lead CRM:

| Module | Route | Demo sources | Live sources |
|---|---|---|---|
| Tenders & RFPs | `/opportunities/tenders` | Demo Public Notice Portal, Demo Regional Tender Bulletin | **Find a Tender (UK)** — working |
| Sponsors | `/opportunities/sponsors` | Demo Brand Directory, Demo Partnerships Index | none yet |
| Suppliers | `/opportunities/suppliers` | Demo Supplier Directory, Demo Trade Fair Catalogue | none yet |
| Locations (expansion) | `/opportunities/expansion` | Demo Statistics Office, Demo Business Register | none yet |

Each module has search with filters, progress and loading states, ranked results (cards or table, plus a
map for locations), a detail page with field-level evidence, saving, named lists, notes, statuses,
comparison (2–6 items), and CSV export. The app researches only: it never submits bids, sends
outreach or contacts anyone.

## Run it

Same as the rest of the app: `npm install`, then `npm run dev` (embedded Postgres, no setup). Sign in, open
**Opportunities**. Demo mode needs no accounts or keys. See `.env.example` for every setting.

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Architecture

```
src/core/opportunities/         pure logic, no I/O
  types.ts                      Field / Evidence / NormalizedItem / MatchResult
  fields.ts                     known / unknown / conflict, evidence merging, completeness
  dates.ts  money.ts            deterministic deadline and amount parsing (original wording kept)
  scoring.ts                    weighted aggregation, min–max normalisation, coverage
  dedup.ts                      provider-independent identity and merging
  modules/{tenders,sponsors,suppliers,expansion}.ts   query schema, filters, ranking, columns, statuses
src/sources/opportunities/      retrieval + normalisation (the replaceable part)
  types.ts                      Provider contract
  registry.ts                   which providers serve which module/mode; planned live sources
  demo/*.ts                     fictional fixtures
  find-a-tender.ts              live connector (OCDS)
  safe-fetch.ts                 the only network module: allowlist, private-network block, timeouts, retries
  ai-enricher.ts                optional AI summaries (Anthropic SDK), off by default
src/services/opportunities/     workspace-scoped persistence
  search.ts                     orchestration: validate → limits → providers → dedupe → filter → rank → store
  items.ts                      saved items, statuses, notes, lists, enrichment
  export.ts  profile.ts  usage.ts
src/app/opportunities/          pages, server actions, export route
src/components/opportunities/   shared UI (also previewed at /design)
src/brand/                      brand tokens and editable copy
```

The layers are separate on purpose:

| Concern | Where | Rule |
|---|---|---|
| Source retrieval | `src/sources/opportunities/*` | Providers return `NormalizedItem`s; nothing else sees raw formats. |
| Normalisation and dedup | provider `normalize…`, `core/opportunities/dedup.ts` | Identical values merge their evidence; different values become a **conflict** that keeps both. |
| Evidence storage | `opp_items.fields` (JSON) | Every known value has ≥1 evidence entry: kind, provider, source URL, retrieved-at, published-at, verbatim quote. |
| AI enrichment | `ai-enricher.ts` | Optional, on request, schema-validated, labelled; never sets dates, amounts or eligibility. No automatic model fallback unless `OPP_AI_FALLBACKS` is set. |
| Matching and ranking | `core/opportunities/modules/*` | Deterministic rules. Unknown inputs are left out of the score (not counted as zero or as a pass); `coverage` says how much weight was scorable. |
| Presentation | `src/app/opportunities`, `src/components/opportunities` | Reads only normalised items and match results. |

### Data rules

- **Unknown stays unknown.** Blank/"TBC"/"not stated" values are stored as unknown and shown as “Unknown — reason”.
- **Original wording is kept** for consequential fields (deadlines, budgets, eligibility, documents,
  certifications, MOQs, metrics) next to any normalised value.
- **Deadlines**: no timezone is ever assumed. A deadline without one is a window across all timezones
  (UTC+14…UTC−12) and is only “passed” once it has passed everywhere. Ambiguous dates (03/04/2027) and
  ambiguous zones (IST, CST) are not guessed. A notice still marked open after its deadline is flagged.
- **Budgets** are compared only within the same currency; no conversion.
- **Sponsors**: “accepting sponsorship requests” is only shown when a source says so. No contacts or
  budgets are inferred. Suggested angles are labelled as suggestions.
- **Suppliers**: claims vs. independently verified facts are kept apart; certifications score
  verified 1, claimed with source 0.5, claimed without source 0.25. No “trusted” label exists.
- **Locations**: metrics are min–max normalised across the candidate set before weighting; scores are
  relative to that set. Missing metrics lower coverage and are listed as research gaps. Competitor counts
  from incomplete sources are shown as lower bounds and **not scored**. Foot traffic, rents, demand,
  revenue and market size are never estimated.
- Retrieved pages are untrusted data: they are never executed and, if AI is enabled, are passed inside a
  delimited block with instructions to ignore any instructions in them.

### Demo vs live

- Demo providers produce only `mode: "demo"` items; live providers only `"live"`. The orchestrator drops any
  item whose mode doesn't match the search, and demo and live copies of the same record are separate rows.
- **A failed live search is recorded as failed. It never falls back to demo data.** Modules without a live
  source refuse live mode with the reason shown.
- Demo data is labelled on results, detail pages, comparisons, every CSV row (`Data mode = DEMO — fictional
  data`) and the file name (`DEMO-…csv`). Demo links use the reserved `.example` domain.
- Demo-only switches simulate one or all sources failing, to show partial-result and error states.

## Providers

### Find a Tender (UK) — live, working

- API: `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?updatedFrom=…&limit=100` (keyless).
- Licence: Open Government Licence v3.0 — storage and reuse allowed with attribution. The attribution line
  is shown on detail pages and included in exports.
- **What one live search reads** (`src/sources/opportunities/find-a-tender.ts`):
  - every release of every notice type updated in the last `OPP_FTS_LOOKBACK_DAYS` days (default **3**),
    newest first, in pages of 100, up to `OPP_FTS_MAX_PAGES` pages (default **20 = 2,000 releases**);
  - a contracting process is kept only if its **newest** release in that window is a tender, tender update,
    amendment or cancellation — processes that have moved to award/contract (or are only at planning) are left out;
  - then the module's filters run locally (keywords, buyer, geography, type, deadline range, budget), and
    notices whose published deadline has passed are hidden unless “Include notices whose deadline has passed” is ticked.
- **It does not use `stages=tender`.** In this review that filter returned only older-regime notices (legal basis
  `32014L0024`/`32014L0025`) and silently left out Procurement Act 2023 notices (`2023/54`) — 15 of 141 tender
  releases over two days. The official docs describe `stages` only as “stage of the contracting process”.
- **Not covered:** tenders published before the window and not updated since; notices only on Contracts Finder or
  devolved portals (Public Contracts Scotland, Sell2Wales, eTendersNI); private-sector RFPs; other countries.
  Procurement Act notices marked “below threshold” *are* published on Find a Tender and are included.
- **Measured on 9 Oct 2026** (real API, default settings): the whole 3-day window was 1,368 releases in 14 pages,
  read in about 5 seconds; 286 were open-stage tender notices; 0 failed validation.
- Coverage is stated before a live search (“What live search covers”), in a “Coverage of this live search” banner
  next to results (including when there are none), and on the Sources page. An empty live result says it is not
  evidence that no relevant tenders exist.
- Pages are cached for 30 minutes (shared `source_cache` table). Switch off with `OPP_LIVE_FIND_A_TENDER=off`.
- **Broader coverage needs** a background sync rather than read-at-search-time: a scheduled job (the app already
  has a Vercel cron) that pages the API with `updatedFrom` incrementally and keeps a local index of open notices,
  so every search covers *all* currently open tenders; plus Contracts Finder (legacy below-threshold, rate-limited)
  and devolved portals where they publish OCDS, then TED (EU) and SAM.gov (US) behind their own terms/keys.
  See `docs/LIVE-DATA-PLAN.md`.

### Planned (need credentials or a data-provider decision)

Listed in `src/sources/opportunities/registry.ts` and on the **Sources** page:

| Module | Source | Needs |
|---|---|---|
| Tenders | Contracts Finder (UK, below threshold) | Keyless but rate-limited to a few requests/minute; add once a background queue is acceptable |
| Tenders | SAM.gov (US federal) | Free `SAM_GOV_API_KEY` + terms |
| Tenders | TED (EU) | Decision on API v3 usage and reuse terms |
| Sponsors | Company/brand data | A licensed business-data provider |
| Suppliers | Supplier directories, certifier registers | A licensed supplier-data provider; each certifier's register terms |
| Locations | US Census ACS + County Business Patterns | Free `CENSUS_API_KEY` (the API now refuses keyless requests) |
| Locations | UK ONS / Nomis | Dataset and geography choice (LSOA/MSOA) and centroids |

### Adding a provider

1. Create `src/sources/opportunities/<name>.ts` exporting a `Provider<QueryType>`: `id`, `name`, `module`,
   `mode`, `allowHosts`, `licence`, `attribution`, `storagePolicy`, `cacheTtlMs` (0 if the terms forbid
   storage), `requiresEnv`, `available()` and `search(query, io)`.
2. Fetch only through `io.getJson(url)` (safe fetcher, limited to `allowHosts`); cache through `io.cache` only
   if the provider's terms allow it.
3. Normalise into `NormalizedItem`s with `known()/unknown()/fromSource()` and an `Evidence` for every value.
   Use the module's field keys (see `fieldLabels` in the module file). Use `itemKey()` for identity.
4. Register it in `registry.ts`. Add a normaliser test with a small fixture (see `tests/opportunities-services.test.ts`).
5. Read credentials from `process.env` inside the provider only; never send them to the browser.

## AI enrichment (optional)

- **Off by default.** Runs only when both `OPP_AI_ENRICHMENT=on` and `ANTHROPIC_API_KEY` are set, and only when a
  signed-in user presses “Generate AI summary” on one record. Searches never call the AI.
- **Model:** `OPP_AI_MODEL`, default `claude-opus-5-5`, at low effort with structured (schema-constrained) output.
- **Automatic fallback: off.** Nothing is sent to another model unless the administrator sets `OPP_AI_FALLBACKS`
  (`default` = Anthropic picks the fallback by refusal category; or a comma-separated list of model ids). Fallback
  requests are billed at the fallback model's rates.
- **Per-request bounds:** input capped at 40,000 characters of the record's published text (roughly 10k tokens);
  output capped by `OPP_AI_MAX_TOKENS` (default 4,000, includes thinking); SDK timeout 60 s, 2 retries.
- **Usage limits:** `OPP_AI_SUMMARIES_PER_DAY` per workspace (default 25), counted before the call.
- **Cost control:** worst case per summary ≈ input tokens × input price + `OPP_AI_MAX_TOKENS` × output price. Using Anthropic's
  model price table as of 6 Oct 2026 for `claude-opus-5-5` ($4 / $20 per million input / output tokens), that is about $0.04 + $0.08 ≈ **$0.12 at most per summary**, so the default daily cap bounds one
  workspace at about $3/day. Lower it by: lowering `OPP_AI_SUMMARIES_PER_DAY` or `OPP_AI_MAX_TOKENS`, choosing a
  cheaper `OPP_AI_MODEL`, leaving fallbacks off, and setting a spend limit in the Anthropic Console. Check current
  prices before relying on these figures. A Claude subscription (e.g. Max) does not cover API usage.
- **Verification status:** the adapter is tested only with a **mocked client** (`tests/opportunities-services.test.ts`:
  request shape, no fallback by default, token cap, schema validation, rejection of figures not in the source). It
  has **not** been called against the real API — no key is configured in this environment.

## Security and multi-customer deployment

- Every page, action and export requires sign-in (`getSession()`); every query is scoped by `workspace_id`
  (searches, items, results, lists, notes, profile, usage, exports). `tests/opportunities-services.test.ts`
  checks that another workspace can't read, change, list or export them.
- Automated actors can't set statuses that record a person's action (submitted, contacted, sample requested,
  site visit) — the existing permission layer (`core/permissions.ts`).
- Outbound requests: https only, per-provider host allowlist, DNS results checked against private/loopback/
  link-local/CGNAT/ULA ranges, redirects re-checked (max 3), 15 s timeout, size cap, ≤2 retries on 429/5xx.
  Residual risk: DNS rebinding between the check and the connection; the strict host allowlist limits this.
  There is no user-supplied URL fetching and no file upload in this feature.
- Usage controls: searches per minute, live searches per day, AI summaries per day, per workspace.
- Exports reuse the CRM's CSV writer (formula-injection safe); the shared copy drops notes and scrubs
  identity terms, emails and phone numbers.

**Tenancy.** This app has per-person workspaces (an owner plus invited members, each with a private
space; the owner can open members' spaces). It does **not** have organisation-level tenancy with separate
admins and billing. To resell safely, run **one deployment and one database per customer**:

1. Create a new Vercel project from this repository and a new Neon database for that customer.
2. Set `BRAND` (or add a new brand file), `AUTH_SECRET`, `CRON_SECRET`, and only the provider keys that
   customer is licensed for.
3. The customer's admin creates the owner password on first visit and invites their team.
4. Never point two customers at the same database.

## Verification done

- Unit and service tests: `tests/opportunities-core.test.ts` (deadlines, money, evidence merging, scoring,
  each module's ranking and missing-data behaviour) and `tests/opportunities-services.test.ts` (persistence
  and provenance, re-search keeps user state, partial/failed searches, input validation, rate limits,
  demo/live separation, lists/status/notes/export, human-only statuses, workspace isolation, network
  safety, Find a Tender normalisation and caching, AI output guard).
- Browser walkthrough (Playwright, desktop 1360px and mobile 390px): all four modules searched, detail
  pages, save, lists, notes, status, comparison, partial and failed states, live tender search, CSV export,
  brand previews, keyboard skip link, no horizontal overflow on mobile. Screenshots: `docs/review/`.
