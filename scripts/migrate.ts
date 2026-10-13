/**
 * Create/upgrade the database and make sure the default workspace exists. Runs automatically before
 * `npm run dev`, `npm start` and the Vercel build.
 */
import { sql } from "drizzle-orm";
import { connect, databaseUrl, localDataDir, migrateDb } from "../src/db/client";
import { ensureWorkspace } from "../src/services/context";

/**
 * Refuse to touch a database that belongs to the old Prospect CRM (or any app with its tables).
 * Read-only check; nothing is written when it fails.
 */
async function assertOwnDatabase() {
  const db = await connect();
  // postgres-js returns an array of rows; PGlite returns { rows }.
  const res: unknown = await db.execute(
    sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('records', 'target_accounts', 'rules', 'import_rows', 'pipeline_runs')`,
  );
  const rows = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as { n?: number }[];
  const n = Number(rows[0]?.n ?? 0);
  if (n > 0) {
    console.error(
      "This database belongs to another app (it has Prospect CRM tables). Nothing was changed.\n" +
        "Connect a new, empty database for Opportunity Desk (Vercel → Storage → Neon) and redeploy.",
    );
    process.exit(1);
  }
}

async function main() {
  if (!databaseUrl() && process.env.VERCEL) {
    // Let the first deploy succeed; the site shows setup instructions until a database is connected.
    console.warn("No database connected yet — skipping migrations. Connect a Neon database in Vercel → Storage, then redeploy.");
    process.exit(0);
  }
  await assertOwnDatabase();
  const db = await migrateDb();
  await ensureWorkspace(db);
  console.log(`Database ready: ${databaseUrl() ? "Postgres (DATABASE_URL)" : localDataDir()}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
