# Opportunity Desk

Find **tenders & RFPs**, **sponsors**, **suppliers** and **expansion locations** in one workspace — with the
evidence behind every fact. Unknowns stay unknown, conflicting sources are shown side by side, and every score
shows its working. The app researches only: it never submits bids or contacts anyone.

| Module | Data today |
|---|---|
| Tenders & RFPs | Demo data, plus **live UK tenders** from Find a Tender (keyless, Open Government Licence) |
| Sponsors | Demo data (fictional, clearly labelled) |
| Suppliers | Demo data |
| Locations | Demo data |

Each module: search with filters, ranked results with explained scores, evidence-backed detail pages, saved
items and named lists, notes, statuses, side-by-side comparison and CSV export. Branding is configurable per
deployment (`BRAND`), with a component preview at `/design`.

## Run it locally

Requires Node.js 20.9+. No database install — an embedded Postgres keeps data in `data/pglite` (gitignored).

```bash
cp .env.example .env.local      # then edit OWNER_EMAIL and OWNER_PASSWORD (12+ characters)
npm install
npm run dev                     # sets up the database, then serves http://localhost:3000
```

Sign in with `OWNER_EMAIL` / `OWNER_PASSWORD`. Add teammates under **Account & team**.

## Put it online (Vercel + Neon)

1. In Vercel: **Add New… → Project**, pick this repository, and set the **production branch** to
   `opportunity-desk`.
2. **Settings → Environment Variables:** add `OWNER_EMAIL`, `OWNER_PASSWORD` (12+ characters) and `AUTH_SECRET`
   (any long random string). Optional: `BRAND`.
3. **Storage → Create Database → Neon**, connect it to the project (sets `DATABASE_URL`).
4. **Deployments → Redeploy.** Every deploy sets up and upgrades the database first.
5. Open the site and sign in.

**Forgot the owner password?** Change `OWNER_PASSWORD` in Vercel and redeploy. Team members get a new temporary
password from the owner.

## More

- Setup details, architecture, providers, AI cost controls, security and tenancy: [`docs/OPPORTUNITIES.md`](docs/OPPORTUNITIES.md)
- Designer handoff (tokens, components, brands, copy): [`docs/DESIGNERS.md`](docs/DESIGNERS.md)
- Live-data research and plan for the other modules: [`docs/LIVE-DATA-PLAN.md`](docs/LIVE-DATA-PLAN.md)

Checks: `npm run typecheck`, `npm run lint`, `npm test`.
