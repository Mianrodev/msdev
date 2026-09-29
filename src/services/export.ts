import { assertCan } from "@/core/permissions";
import { RECORD_FIELD_CLASSES, redactRow, TARGET_ACCOUNT_FIELD_CLASSES, type ExportMode } from "@/core/redaction";
import type { Ctx } from "./context";
import { listAccounts } from "./accounts";
import { logHistory } from "./history";
import { listRecords, type ListFilter } from "./records";
import { getIdentityTerms } from "./rules";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/**
 * Export records. `shared` (the default) drops restricted fields and scrubs
 * identity terms, emails and phone numbers — safe to hand to a third party.
 * `internal` is everything, for the owner's own backups.
 */
export async function exportRecords(ctx: Ctx, mode: ExportMode, filter: ListFilter = {}) {
  assertCan(ctx.actor, mode === "internal" ? "export.internal" : "export.shared");
  const terms = await getIdentityTerms(ctx);
  const rows = (await listRecords(ctx, { ...filter, limit: 100_000 })).map((r) => {
    const { workspaceId: _w, dedupKey: _d, ...rest } = r;
    return redactRow(rest, RECORD_FIELD_CLASSES, mode, terms);
  });
  await logHistory(ctx, {
    entityType: "record",
    event: `export.${mode}`,
    reason: `Exported ${rows.length} records (${mode})`,
    detail: { filter: { ...filter } },
  });
  return rows;
}

export async function exportAccounts(ctx: Ctx, mode: ExportMode) {
  assertCan(ctx.actor, mode === "internal" ? "export.internal" : "export.shared");
  const terms = await getIdentityTerms(ctx);
  const rows = (await listAccounts(ctx)).map((a) => {
    const { workspaceId: _w, dedupKey: _d, ...rest } = a;
    return redactRow(rest, TARGET_ACCOUNT_FIELD_CLASSES, mode, terms);
  });
  await logHistory(ctx, {
    entityType: "target_account",
    event: `export.${mode}`,
    reason: `Exported ${rows.length} target accounts (${mode})`,
  });
  return rows;
}
