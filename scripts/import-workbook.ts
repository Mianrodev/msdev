/**
 * One-time migration tool: import the prospect-tracker workbook as seed data.
 *
 *   npm run import -- "path/to/Local Prospect Weekly Tracker.xlsx" [--force]
 *
 * Runs in a single transaction: if any sheet's imported row count doesn't match
 * its source data rows (or CONFIG's own migration-validation counts), nothing
 * is written.
 */
import { DEFAULT_DB_PATH, openDb } from "../src/db/client";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace, type Ctx } from "../src/services/context";
import { seedDefaultRules } from "../src/services/rules";
import { syncIdentityTerms } from "./lib/identity";
import { AlreadyImportedError, ImportCountMismatch, importWorkbook, type ImportReport } from "./lib/import-tracker";

function printReport(r: ImportReport) {
  const rows = r.sheets.map((s) => ({
    sheet: s.sheet,
    "source data rows": s.data,
    imported: s.imported,
    "expected (CONFIG)": s.expected ?? "—",
    "headers/sections/blank": `${s.header}/${s.section}/${s.blank}`,
    match: s.imported === s.data && (s.expected === undefined || s.expected === s.data) ? "✓" : "✗",
  }));
  console.table(rows);
  for (const s of r.sheets) {
    const parts = Object.entries(s.outcomes).map(([k, v]) => `${v} ${k}`);
    const secs = Object.keys(s.sections).length > 1 ? `  [blocks: ${Object.entries(s.sections).map(([k, v]) => `${k.slice(0, 40)}=${v}`).join("; ")}]` : "";
    console.log(`  ${s.sheet}: ${parts.join(", ")}${secs}`);
  }
  console.log(`  Hyperlink cells read: ${r.hyperlinks}`);
  if (r.statusConflicts.length) {
    console.log(`  ${r.statusConflicts.length} record(s) appeared in more than one status sheet; the later sheet (RAW → PRIORITY → HOLD → ARCHIVE) set the current status. See History.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error('Usage: npm run import -- "path/to/workbook.xlsx" [--force]');
    process.exit(2);
  }
  const db = openDb();
  ensureWorkspace(db);
  const ctx: Ctx = { db, workspaceId: DEFAULT_WORKSPACE_ID, actor: { kind: "human", id: "owner" } };
  seedDefaultRules(ctx);
  syncIdentityTerms(ctx);
  try {
    const report = await importWorkbook(ctx, file, { force: args.includes("--force") });
    console.log(`Imported ${report.file} into ${DEFAULT_DB_PATH} (batch ${report.batchId.slice(0, 8)})`);
    printReport(report);
  } catch (e) {
    if (e instanceof ImportCountMismatch) {
      console.error(e.message);
      printReport(e.report);
      process.exit(1);
    }
    if (e instanceof AlreadyImportedError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}

main();
