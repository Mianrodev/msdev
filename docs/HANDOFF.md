# Prospect CRM — hand-off

Status as of 7 Oct 2026. Written so the owner (or ChatGPT, or a developer) can carry on without the earlier chats.

---

## 1. In one minute

- **What it is:** a private job-search tracker. Every day it searches company job boards and remote-job sites for **remote jobs open to someone living in India** (worldwide/APAC remote and contracts are fine). It checks each job strictly and sorts it onto **Ready** (apply to these), **On hold** (something unclear) or **Archived** (fails a check). You apply yourself — the app never applies or contacts anyone.
- **Live site:** https://msdev-mu.vercel.app (sign in with your password).
- **Code:** GitHub `Mianrodev/msdev`, branch **`claude/lucid-wozniak-yusexf`** (this is the branch Vercel deploys to production).
- **Hosting:** Vercel (Hobby) + Neon Postgres. A daily job runs the search at 02:30 UTC (08:00 IST).
- **Today:** Ready **50** (every one passes all six checks and was rated against your profile), On hold ~25, Applied 57, Archived ~800.

---

## 2. Using it day to day

1. Open **Leads → Ready**. Sort by **Best fit first**. Each row shows the fit (Exceptional / Strong / Good / Stretch), a one-line "why", and six check badges.
2. Open the job, apply on the company's site, then set **Applied** in the last column.
3. **On hold** = the app couldn't confirm something (e.g. the posting doesn't say India can apply, no posting date, recruiter posting). If you check it yourself and it's fine, open it and press **"Yes — worth applying"** — that moves it to Ready and records that *you* confirmed it.
4. **Find leads** page: your title words, skip words and region words; the company boards being watched; "Jobs skipped, and why". Press **Find new leads now** to search immediately (it also runs daily).
5. **About me**: your profile — the reference for fit. Keep it up to date.

### The six checks on Ready (all must be a clear YES)
| Badge | Means |
|---|---|
| Remote | The board or posting clearly says remote (an office city alone isn't enough; hybrid/office days fail). |
| Open to you | The location, title or description names India / an Indian city / APAC / worldwide ("Remote" alone → On hold). "IND" counts as India. |
| Who can apply | The **whole** posting and application form were read; no "US residents only", "must be based in the UK", work-authorisation-elsewhere, W-2, etc. |
| Still listed | Still open on the company's own job board or careers page. |
| Employer | Posted by the employer itself — recruiter/agency/repost sites (e.g. Jobgether, "on behalf of our client") go On hold. |
| Posted recently | Posted within 45 days, by the company's own date (job sites often re-date old jobs). |

---

## 3. How the search works (plain version)

1. **Sources:** ~500 watched company boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee) plus remote-job sites (Himalayas, Remotive, Jobicy, RemoteOK, Working Nomads, We Work Remotely, Remote Rocketship, Workable search). Site jobs are only added once confirmed on the company's own board/careers page.
2. **Title words** decide what's relevant (e.g. RevOps, GTM, implementation, solutions consultant, technical program/product manager, chief of staff, founder's office, automation, CRM/HubSpot). **Skip words** drop engineering, sales/SDR, support, junior, HR, and platform-specialist titles (Salesforce, NetSuite, SAP…).
3. Each job is checked (section 2). Fails → Archived with the reason; unclear → On hold; all YES → Ready as "Not yet rated".
4. Existing leads are **re-checked on every search** against the live posting; closed jobs are archived automatically.
5. **Fit rating** (Exceptional/Strong/Good/Stretch + why) is done by an AI or by you; the checks never invent a rating. Your AI cannot put a job on Ready that the app hasn't fully checked.

### Measured quality
A stress test over ~140,000 real listings (graded by reading every posting in full):
- Before the fixes, only 27% of auto-Ready jobs were worth applying to; after, ~86% passed the machine checks *and* a human-style read.
- About half of jobs that pass the machine checks are still poor fits on reading (wrong specialism, too senior, etc.) — that is why the AI/you rate each Ready job.

---

## 4. Moving to ChatGPT

### Connect ChatGPT to the tracker (optional)
1. In the app: **Your AI → Make my AI link** (needs your password). Copy the link — treat it like a password.
2. ChatGPT: depends on plan (late 2026):
   - **Business / Enterprise / Edu:** admin enables Developer mode (Settings → Apps → Advanced), then **Apps → Create**, paste the link as the address, **No authentication**, **Scan tools**, **Create**. Full access.
   - **Pro:** same steps; read-only (it can read and explain leads, not save notes).
   - **Plus / Free:** custom connections aren't available — use the export below instead.
3. Tools ChatGPT gets: about the app, list leads, get a lead, your saved answers, your profile, last search, save cover letter/answers, add note, **sort_lead** (rate fit + why; ready/hold/archive), add a job it found. It can never apply, mark Applied, change rules/password, or delete anything. Everything it does shows on **Activity** as "Your AI".
4. Switch the link off on the same page when you're done.

### Without a connection
- **Leads → Ready → Download this list** (CSV, opens in Excel/Sheets). Upload that file to ChatGPT with your profile (copy from **About me**) and ask it to help prioritise and write applications.
- **Download full backup** = everything (keep private). **Download shared copy** = personal details removed.

### Paste-ready starter prompt for ChatGPT
> I use a job tracker that finds remote jobs open to people in India and checks each one (remote, open to India, who can apply, still listed, real employer, posted within 45 days). Attached are my profile and my Ready list (CSV). For each job, rate fit as Exceptional / Strong / Good / Stretch / Not a fit against my profile, with one sentence why, and flag anything that needs checking before I apply. Then help me write tailored applications for the top 10, one at a time. Never apply or contact anyone for me.

---

## 5. Open items (not done)

- **On hold that you may want to check yourself** (good fits the app can't fully confirm): Datahash (RevOps & AI Systems, careers page unreadable), Mashreq (Oracle careers page unreadable), Hershey and UTTR (no posting date on page), Welocalize (flagged "recruiter" only because its text says "staffing" — likely a false alarm).
- **Coming on the next searches:** Primal Storm (AI Automation & Integration), JoVE (Marketing Ops), T-Tech — on Workable boards that were rate-limiting.
- Recruiter detection can misfire on employers whose descriptions mention "staffing" (see Welocalize).
- Not built yet: phone-friendly card layout, pay-floor rule, a "never show this company" button, times shown in IST, validation on Add-a-lead, team member progress view.
- Firecrawl (used only by the AI helpers for searching the web) is low on credits; the app itself doesn't need it.

## 6. Security to-dos

- **Change your password now** (Settings). A temporary password was used during the work.
- Check **Your AI** shows the link is **off** (it was switched off at the end) — make a new one only when you need it.
- Vercel → Settings → Environment variables: keep `CRON_SECRET` and `AUTH_SECRET` set; never paste them into chats.

---

## 7. For a developer (or ChatGPT helping with code)

- **Stack:** Next.js 16 (App Router, server actions — note this version has breaking changes; read `node_modules/next/dist/docs/` before changing framework code), React 19, Drizzle ORM, Postgres (Neon in production, embedded PGlite locally/tests), Vitest.
- **Run locally:** Node 20.9+, `npm ci`, `npm run dev` (embedded DB in `data/pglite`). **Checks:** `npm run typecheck`, `npm run lint`, `npm test` (97 tests).
- **Deploy:** push to `claude/lucid-wozniak-yusexf` → Vercel builds, runs `db:migrate`, then `next build`.
- **Env vars:** `DATABASE_URL` / `POSTGRES_URL` (Neon), `AUTH_SECRET` (session signing), `CRON_SECRET` (required on Vercel for the daily job), optional `APP_PASSWORD`, `IDENTITY_FILE`, `PGLITE_DIR` (local).
- **Daily job:** `vercel.json` → `/api/cron/weekly` at `30 2 * * *`, time-budgeted per account.

### Where things are
| Area | File |
|---|---|
| Search, checks, re-checks, check rules (`DISCOVERY_RULES`), default words | `src/services/discovery.ts` |
| "Who can apply" limits + recruiter detection | `src/sources/restrictions.ts` |
| Job boards (fetch lists, single-posting descriptions) | `src/sources/job-boards.ts` |
| Remote-job sites; careers-page reader (`readJobPage`: Workday, BambooHR, schema.org JobPosting, text) | `src/sources/job-sites.ts` |
| Rule engine (rules are data, editable in Settings) | `src/core/rules.ts`, `src/core/pipeline.ts` |
| Daily sort to Ready/Hold/Archive + re-check of existing leads | `src/services/run-update.ts`, `src/services/reconcile.ts` |
| AI connector tools (MCP) | `src/services/ai-tools.ts`, `src/app/api/mcp/[key]/route.ts` |
| Lists, badges, job page | `src/app/records/page.tsx`, `src/app/records/[id]/page.tsx`, `src/components/ui.tsx` |
| Stress-test script (reads boards, applies the same checks, writes JSONL) | `scripts/stress-test.mts` |

### Design rules worth keeping
- The app **never applies or contacts anyone**; it only records what the owner did.
- An unknown value never fails a rule; a rule that names `UNKNOWN` sends it **On hold**. Ready means every check is a clear YES.
- Re-checks never overwrite a fact the owner confirmed ("… checked it").
- Board copies are cached 12 h and keyed to the current title words; the "skipped jobs" memory (30 days) resets when words, rules or `CHECKS_VERSION` change.
- Keep personal details out of the repo; the profile lives only in the app (About me).
