# Prospect CRM

A local, single-user lead/prospect CRM that replaces the Excel prospect-tracking
workbook. It runs a four-stage pipeline — **Discovery → Screen → Triage → Verify**
— over leads, with the criteria stored as editable data, deduplication,
reconciliation of existing prospects, and an append-only audit log.

The core is generic (account, opportunity, stage, verdict), so the same app
works for sales leads, partnerships or recruiting pipelines. Every table is
scoped by `workspace_id`, so multi-tenant accounts can be added later without
rewriting the data layer.

**This tool only researches and prepares — it never acts.** It never submits
anything or contacts anyone. You approve and send outreach yourself; the app
only records that you did.

## Quick start

Requires Node.js 20.9+.

```bash
npm install
npm run dev          # creates/migrates data/crm.db, then serves http://localhost:3000
```

No accounts, API keys or paid services are needed.

### Import the workbook (one-time)

```bash
npm run import -- "path/to/Local Prospect Weekly Tracker.xlsx"
```

- The import runs in a single transaction. It prints source rows vs imported
  rows for each sheet, and checks them against the counts in the workbook's own
  CONFIG › MIGRATION VALIDATION block. If anything doesn't match, nothing is
  written.
- Every source row is kept verbatim in `import_rows` and linked to the record it
  became.
- Importing the same file twice is refused. Pass `--force` to import it again anyway.
- Keep the workbook **out of the repo**. `*.xlsx` is gitignored, except for the
  placeholder test fixture.

| Sheet | Becomes |
|---|---|
| RAW LEADS | Records, with stage 1/2/2.5/3 verdict + reason pairs. Stage and status are derived from the verdicts. Other columns become criteria attributes. |
| PRIORITY | Records at Verify / active, with tier, prepared brief/answers and outreach status. |
| HOLD / ARCHIVE | Record status `hold` / `archived`, with reason, date and next action. |
| TARGET ACCOUNTS | Target accounts. Both the outreach and watchlist blocks are imported, and contacts go into restricted fields. |
| HISTORY | History entries. Both the reconciliation and activity-log blocks are imported, linked to records where they match. |
| CONFIG (hidden) | Rules: criteria, exclusions, stage definitions, standing and trigger rules. Also settings: profile, sheet/column maps, validation counts. |

A lead that appears on several sheets is **one** record. It is deduplicated on
(account, opportunity, source/next-step URL), and the later sheet sets its
current state (RAW → PRIORITY → HOLD → ARCHIVE).

### Redaction terms (keep private)

Copy `config/identity.example.json` to `data/identity.local.json` (gitignored)
and fill in the owner's name, personal email/phone, profile URL, home city and
current employer. They are loaded on every `npm run dev` / import, and are
redacted from **shared** exports. You can also edit them in *Rules & settings*.

## Using it

- **Run update** (dashboard) is the weekly workflow; it replaces the workbook's
  "Update this week's prospect tracker" trigger. In one transaction it:
  1. Reconciles every existing prospect and held record against the *current*
     rules. A prospect that no longer qualifies moves to Archive (genuine
     violation) or Hold (needs review / unverified source). Qualifying once is
     not a permanent pass.
  2. Runs every pending record through Screen → Triage → Verify, applying the
     stored rules and writing a verdict + reason at each stage.
  3. Returns a counts-only summary (in vs out per stage, moved to Hold/Archive,
     active prospects by tier) and logs every change to History.

  It is manual-only for v1. `runUpdate()` in `src/services/run-update.ts` is a
  plain function, so a scheduler can call it later.
- **Records**: list, filter and sort by view (Leads / Prospects / Hold /
  Archive), stage, status and tier, or search. Open a record to edit it, make
  the next stage decision (a reason is always required), hold, archive or
  restore it, mark source verification, set the tier, and record outreach
  hand-offs.
- **Rules & settings**: edit the criteria each stage applies, and whether a
  violation archives or holds. Rules are disabled, never deleted.
- **Exports**: *shared* CSV drops restricted fields (prepared packages, notes,
  contacts, gaps, unmapped columns) and scrubs identity terms, emails and phone
  numbers. *Internal* CSV is everything, for your own backups.

## Business rules and where they're enforced

| Rule | Enforcement |
|---|---|
| Never fabricate; unknown = `UNKNOWN` | Blank/"unknown" input is stored as UNKNOWN, and a known value is never overwritten by an unknown one (`services/records.ts`). |
| UNKNOWN doesn't auto-reject | UNKNOWN evaluates as "unknown", never "fail" (`core/rules.ts`). |
| Unverifiable sources → Hold | Verify-stage promotion requires `source = verified`; reconciliation holds unverified prospects (`core/pipeline.ts`). |
| Dedup on (account, opportunity, URL) | Unique index plus in-place update, logged as `dedup_merge`. URLs and company names are normalised (`core/dedup.ts`). |
| Reconciliation every run | `services/reconcile.ts`, called first by Run update. |
| Nothing hard-deleted; every change logged | SQLite triggers block `DELETE` on records, accounts and rules, and any `UPDATE`/`DELETE` on history (`drizzle/0001_append_only.sql`). |
| Research only, never acts | Permission layer: no send/submit capability exists; human-only outreach states need a human actor plus explicit confirmation (`core/permissions.ts`). ESLint forbids `fetch`/`http`/mail libraries in `src/`. |
| No identity leakage | Every exported field is classified (unclassified = restricted), and shared exports are scrubbed (`core/redaction.ts`). Contacts live only in labelled contact fields, never in the dedup key. |

### Criteria derived from CONFIG

CONFIG's rules are prose, so they're imported as process notes. The import also
adds a few **evaluable** criteria derived from them. Each one cites its source
and can be edited or disabled:

- Location confidence is not `BLOCKED` (Screen).
- Verified location fit does not start with `NO` (Verify).
- Verified open does not start with `NO` (Verify).
- Verified value doesn't say "below floor" (Verify).
- Gig/marketplace accounts (e.g. micro1) → **Hold**, not reject (Triage).

The compensation floor is **not** a numeric rule. The workbook's pay text mixes
currencies and monthly/annual periods, so applying a number would mean guessing.
It stays a note for human judgement at Verify.

## Project layout

```
src/core/       pure domain logic (no DB): rules, pipeline, dedup, permissions, redaction
src/db/         Drizzle schema + SQLite client
src/services/   workspace-scoped persistence; every change writes History
src/app/        Next.js UI (server components + server actions) and CSV export routes
scripts/        migrate, one-time workbook import, fixture generator
drizzle/        SQL migrations (incl. append-only triggers)
tests/          vitest: core rules, services, import (placeholder fixture only)
```

Checks: `npm test`, `npm run typecheck`, `npm run lint`.

### Moving to Postgres / multi-tenant later

- **Postgres**: port `src/db/schema.ts` to `drizzle-orm/pg-core` (same column
  names), swap the client in `src/db/client.ts`, and regenerate migrations. The
  services only use Drizzle's query builder. Recreate the append-only triggers
  as Postgres triggers.
- **Multi-tenant**: `src/services/request.ts#getCtx` is the single place that
  decides the workspace and actor. Resolve them from an authenticated session.
