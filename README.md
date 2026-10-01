# Prospect CRM

A single-user lead/prospect CRM that replaces the Excel prospect-tracking
workbook. It runs a four-stage pipeline — **Discovery → Screen → Triage → Verify**
— over leads, with the criteria stored as editable data, deduplication,
reconciliation of existing prospects, and an append-only audit log.

The core is generic (account, opportunity, stage, verdict), so the same app
works for sales leads, partnerships or recruiting pipelines. Every table is
scoped by `workspace_id`, so multi-tenant accounts can be added later without
rewriting the data layer.

It runs online (Vercel + a free Neon Postgres database) or on a computer.

**This tool only researches and prepares — it never acts.** It never submits
anything or contacts anyone. You approve and send outreach yourself; the app
only records that you did.

## Put it online (Vercel + free Neon database)

1. In Vercel: **Add New… → Project**, pick this GitHub repository, then **Deploy**.
   The site will say a database needs connecting. That's expected.
2. In the project: **Storage → Create Database → Neon (Postgres)**, then connect it to
   the project. This sets `DATABASE_URL` automatically.
3. **Deployments → ⋯ → Redeploy.** Every deploy sets up and upgrades the database
   automatically, before the new version goes live.
4. Open the site **right away**. The first visit asks you to create your password, and
   whoever does this first owns the app. After that, everyone must sign in.
5. Go to **Import** and upload the tracker workbook.
6. In **Rules & settings → Redaction**, add the identity terms that must never appear in
   shared exports.

The password is stored only as a salted hash, and you can change it in *Rules &
settings*. Optionally, an `APP_PASSWORD` environment variable overrides it.

## Run it on a computer (optional)

Requires Node.js 20.9+. No database install: an embedded Postgres keeps data in
`data/pglite` (gitignored).

```bash
npm install
npm run dev          # sets up the database, then serves http://localhost:3000
```

The first visit asks you to create a password, just like online. Set
`DATABASE_URL` to use a real Postgres instead of the embedded one.

### Import the workbook

Use the **Import** page in the app, or from a terminal:

```bash
npm run import -- "path/to/Local Prospect Weekly Tracker.xlsx"
```

- The import runs in a single transaction. It prints source rows vs imported
  rows for each sheet, and checks them against the counts in the workbook's own
  CONFIG › MIGRATION VALIDATION block. If anything doesn't match, nothing is
  written.
- Every source row is kept verbatim in `import_rows` and linked to the record it
  became.
- Importing the same file twice is refused, unless you choose to import it again
  anyway.
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

Enter the owner's name, personal email/phone, profile URL, home city and
current employer in *Rules & settings → Redaction*. They are redacted from
**shared** exports. When running on a computer, you can instead copy
`config/identity.example.json` to `data/identity.local.json` (gitignored); it is
loaded on every start.

## Using it

- **Find new leads** (Home, or the *Find leads* page) searches the public job
  boards (Lever, Greenhouse, Ashby, Workable, Recruitee, SmartRecruiters) of
  every company in your tracker, plus any careers link you add. It is free: no
  API key, no AI. It:
  1. Checks whether each active or held lead's listing is still on its board
     (sets *Verified open* and the source verification).
  2. Adds new jobs whose title matches your words, skips titles with a skip
     word, and drops jobs that fail your screen rules (on-site/hybrid, or only
     open to another region). New jobs land in **New to review**, where you
     press Yes / Not sure / No. Yes moves the job through to Ready.
  3. Reads remote-job sites (Remotive, Himalayas, Workable's job search —
     used by companies in every industry —, Jobicy, RemoteOK, Working Nomads,
     We Work Remotely) for matching jobs at companies not watched yet,
     and looks for each company's own careers board (`candidateBoards`). Only
     if that board lists the same job is it trusted: the board is watched from
     then on and its jobs are added as above, linking to the company's page.
     Unconfirmed jobs are listed on Find leads, never added; listings with scam
     warning signs (fees, WhatsApp/Telegram, crypto pay) are dropped
     (`src/sources/job-sites.ts`).
  4. Runs the weekly update below.

  It also runs by itself every Monday at 08:00 India time through Vercel Cron
  (`vercel.json` → `/api/cron/weekly`). Set `CRON_SECRET` in Vercel to lock
  that address down; without it only Vercel's scheduler may call it.
  LinkedIn and other sites can't be searched this way. Add those leads by hand.
- **Run update** is the weekly sorting step. It replaces the workbook's
  "Update this week's prospect tracker" trigger. In one transaction it:
  1. Reconciles every existing prospect and held record against the *current*
     rules. A prospect that no longer qualifies moves to Archive (genuine
     violation) or Hold (needs review / unverified source). Qualifying once is
     not a permanent pass.
  2. Runs every pending record through Screen → Triage → Verify, applying the
     stored rules and writing a verdict + reason at each stage. Jobs waiting
     in New to review are left for you.
  3. Returns a counts-only summary (in vs out per stage, moved to Hold/Archive,
     active prospects by tier) and logs every change to History.
- **Applied** (application tracker): every list and lead has a "Your
  application" drop-down (Not applied yet → Applied → Heard back →
  Interviewing → Offer / Not successful / Withdrew). Applied leads move to the
  Applied list whatever happens to the listing; the first applied date is
  kept. Only a signed-in person can set these (`core/permissions.ts`).
- **Your AI** (`/connect`): a private link the owner adds to Claude as a custom
  connector (Model Context Protocol, `src/app/api/mcp/[key]/route.ts`). Tools
  (`src/services/ai-tools.ts`) read leads, the last search and saved answers,
  and write prepared briefs/answers, notes and new leads — never decisions,
  application statuses, rules or settings. Only a hash of the link's key is
  stored; making a new link or switching it off stops the old one.
- **My answers**: the owner's reusable application answers (intro, notice
  period, pay…), shown with Copy buttons on every Ready lead. Stored in
  settings, never exported, logged without their text.
- **Password**: change it, or make a one-time recovery code (shown once,
  stored as a hash). "Forgot your password?" on the sign-in page uses it.
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
| Nothing hard-deleted; every change logged | Postgres triggers block `DELETE`/`TRUNCATE` on records, accounts and rules, and any `UPDATE`/`DELETE`/`TRUNCATE` on history (`drizzle/0001_append_only.sql`). |
| Research only, never acts | Permission layer: no send/submit capability exists; human-only outreach states need a human actor plus explicit confirmation (`core/permissions.ts`). ESLint forbids `fetch`/`http`/mail libraries in `src/`, except the read-only job-board reader `src/sources/job-boards.ts` (GET requests to public job listings only; `job-sites.ts` goes through its fetcher). |
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
src/db/         Drizzle schema + Postgres client (Neon/any Postgres online, embedded PGlite locally)
src/lib/        sign-in: first-visit password setup, scrypt hash, signed session cookie
src/proxy.ts    requires sign-in for every request
src/sources/    read-only readers for public job boards and remote-job sites (the only code allowed to go online)
src/services/   workspace-scoped persistence; every change writes History
src/app/        Next.js UI (server components + server actions) and CSV export routes
scripts/        migrate, workbook import (also used by the Import page), fixture generator
drizzle/        SQL migrations (incl. append-only triggers)
tests/          vitest: core rules, services, import (placeholder fixture only)
```

Checks: `npm test`, `npm run typecheck`, `npm run lint`.

### Team accounts

- **Owner**: created on first visit (password only; an email is optional) and
  runs the `default` workspace. The migration `0002_people.sql` moves an
  existing owner's password and recovery code into the `users` table.
- **Members**: invited from the **Team** page with a one-time link
  (`/join/<token>`, 7 days, only a SHA-256 of the token is stored). Accepting
  creates the person and a private workspace seeded with the default rules.
  They sign in with email + password.
- `src/services/request.ts` resolves the signed-in person and their workspace
  for every request; every query is scoped by `workspace_id`
  (`tests/isolation.test.ts`). The owner can open a member's workspace
  (`crm_view` cookie, owner only); changes there are recorded under the owner.
- Sessions carry the person's id and sign-out counter (`session_epoch`):
  "sign out everywhere", a password change, a password link or switching an
  account off ends that person's sessions. Recovery codes, the guessing
  throttle and AI links are per person/workspace.
- The daily cron searches every active person's workspace on Mondays (as many
  as fit in one run) and catches up missed ones on other days.
