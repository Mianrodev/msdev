/**
 * Create/upgrade the database, make sure the default workspace and default
 * process rules exist, and (locally) load redaction terms from the gitignored
 * identity file. Runs automatically before `npm run dev`, `npm start` and the
 * Vercel build.
 */
import { databaseUrl, localDataDir, migrateDb } from "../src/db/client";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace } from "../src/services/context";
import { and, eq, inArray } from "drizzle-orm";
import { records, rules } from "../src/db/schema";
import { effortFrom } from "../src/core/types";
import { logHistory } from "../src/services/history";
import { DEFAULT_RULES, seedDefaultRules } from "../src/services/rules";
import { syncIdentityTerms } from "./lib/identity";
import { DERIVED_CRITERIA } from "./lib/import-tracker";
import type { Ctx } from "../src/services/context";

/** Old built-in wording that pointed at code or used jargon — safe to replace. */
const OLD_WORDING = /Enforced in core\/|From CONFIG ›|Example criterion|^A fact that isn't known|^A source that can't be reached|^The tool never submits|^A record can advance/;

/** Earlier imports put effort ratings ("MEDIUM") into Next action; move them to "Effort to apply". */
async function moveEffortRatings(ctx: Ctx) {
  const rows = await ctx.db.select().from(records).where(eq(records.workspaceId, ctx.workspaceId));
  for (const r of rows) {
    const effort = effortFrom(r.nextAction);
    if (!effort || !r.origin.startsWith("import:")) continue;
    await ctx.db
      .update(records)
      .set({ nextAction: null, attributes: { ...r.attributes, effortToApply: effort }, updatedAt: new Date().toISOString() })
      .where(and(eq(records.workspaceId, ctx.workspaceId), eq(records.id, r.id)));
    await logHistory(ctx, {
      entityType: "record",
      entityId: r.id,
      event: "updated",
      reason: `Moved "${r.nextAction}" from How to proceed to Effort to apply`,
    });
  }
}

/** Keep the built-in rules' names and descriptions current, unless the owner has reworded them. */
async function refreshBuiltInWording(ctx: Ctx) {
  const builtIn = new Map([...DEFAULT_RULES, ...DERIVED_CRITERIA].map((r) => [r.key, r]));
  const rows = await ctx.db
    .select()
    .from(rules)
    .where(and(eq(rules.workspaceId, ctx.workspaceId), inArray(rules.key, [...builtIn.keys()])));
  let n = 0;
  for (const row of rows) {
    const latest = builtIn.get(row.key)!;
    if (!OLD_WORDING.test(row.description)) continue;
    await ctx.db
      .update(rules)
      .set({ label: latest.label, description: latest.description ?? "" })
      .where(and(eq(rules.workspaceId, ctx.workspaceId), eq(rules.id, row.id)));
    n++;
  }
  if (n) await logHistory(ctx, { entityType: "rule", event: "updated", reason: `Clearer wording for ${n} built-in rules` });
}

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
  await refreshBuiltInWording(ctx);
  await moveEffortRatings(ctx);
  const n = await syncIdentityTerms(ctx);
  console.log(`Database ready: ${databaseUrl() ? "Postgres (DATABASE_URL)" : localDataDir()}${n ? ` (${n} redaction terms loaded)` : ""}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
