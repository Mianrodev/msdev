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

Requires Node.js 20.9+. No database install: the app runs on Cloudflare's local runtime with a local D1
database under `.wrangler/` (gitignored).

```bash
cp .dev.vars.example .dev.vars  # then edit OWNER_EMAIL and OWNER_PASSWORD (12+ characters)
npm install
npm run dev                     # sets up the local database, then serves http://localhost:3000
```

Sign in with `OWNER_EMAIL` / `OWNER_PASSWORD`. Add teammates under **Account & team**.
`npm run preview` builds the real Worker and serves it locally (closest to production).

## Put it online (Cloudflare Workers + D1)

The app is one Cloudflare Worker with one D1 database (binding `DB`), configured in `wrangler.jsonc`.

**From the dashboard (deploys on every push):**

1. **Workers & Pages → Create → Import a repository**, pick this repository. Name the Worker
   `opportunity-desk` (it must match `name` in `wrangler.jsonc`).
2. Build settings: production branch `opportunity-desk`; **Build command** `npx opennextjs-cloudflare build`;
   **Deploy command** `npx opennextjs-cloudflare deploy && npx wrangler d1 migrations apply opportunity-desk --remote`.
3. Deploy. The first deploy creates the D1 database `opportunity-desk` and sets up its tables.
4. In the Worker → **Settings → Variables and Secrets**, add **secrets** `OWNER_EMAIL`, `OWNER_PASSWORD`
   (12+ characters) and `AUTH_SECRET` (any long random string). Optional: `BRAND` (plain text).
5. Open the `*.workers.dev` address (or add your own domain under **Settings → Domains & Routes**) and sign in.

**From a terminal instead:** `npx wrangler login`, then `npm run deploy`, then
`npx wrangler secret put OWNER_EMAIL` (and `OWNER_PASSWORD`, `AUTH_SECRET`).

If the first deploy can't create the database itself, create it under **Storage & Databases → D1** with the
name `opportunity-desk`, put its ID in `wrangler.jsonc` (`database_id`) and deploy again.

**Cost:** Workers and D1 usage is billed to the Cloudflare account under its plan's included allowances
(Workers Paid includes D1 reads, writes and storage); one team's searches use a small fraction of them. Nothing
here enables extra paid products.

**Forgot the owner password?** Change the `OWNER_PASSWORD` secret and deploy again; that also signs the owner out
everywhere. Team members get a new temporary password from the owner.

## More

- Setup details, architecture, providers, AI cost controls, security and tenancy: [`docs/OPPORTUNITIES.md`](docs/OPPORTUNITIES.md)
- Designer handoff (tokens, components, brands, copy): [`docs/DESIGNERS.md`](docs/DESIGNERS.md)
- Live-data research and plan for the other modules: [`docs/LIVE-DATA-PLAN.md`](docs/LIVE-DATA-PLAN.md)

Checks: `npm run typecheck`, `npm run lint`, `npm test`.
