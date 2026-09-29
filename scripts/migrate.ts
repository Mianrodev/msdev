/**
 * Create/upgrade the database, make sure the default workspace and default
 * process rules exist, and (locally) load redaction terms from the gitignored
 * identity file. Runs automatically before `npm run dev`, `npm start` and the
 * Vercel build.
 */
import { databaseUrl, localDataDir, migrateDb } from "../src/db/client";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace } from "../src/services/context";
import { seedDefaultRules } from "../src/services/rules";
import { syncIdentityTerms } from "./lib/identity";

async function main() {
  if (!databaseUrl() && process.env.VERCEL) {
    // Let the first deploy succeed; the site shows setup instructions until a database is connected.
    console.warn("No database connected yet — skipping migrations. Connect a Neon database in Vercel → Storage, then redeploy.");
    process.exit(0);
  }
  const db = await migrateDb();
  await ensureWorkspace(db);
  const ctx = { db, workspaceId: DEFAULT_WORKSPACE_ID, actor: { kind: "human" as const, id: "owner" } };
  await seedDefaultRules(ctx);
  const n = await syncIdentityTerms(ctx);
  console.log(`Database ready: ${databaseUrl() ? "Postgres (DATABASE_URL)" : localDataDir()}${n ? ` (${n} redaction terms loaded)` : ""}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
