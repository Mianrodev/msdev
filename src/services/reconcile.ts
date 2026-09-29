import { and, eq, inArray } from "drizzle-orm";
import { records, type RecordRow } from "@/db/schema";
import { assertCan } from "@/core/permissions";
import { reconcileDecision } from "@/core/pipeline";
import { asSystem, type Ctx } from "./context";
import { logHistory } from "./history";
import { evaluateRecord } from "./records";
import { activeRules } from "./rules";

export interface ReconcileChange {
  id: string;
  account: string;
  opportunity: string;
  from: string;
  to: string;
  reason: string;
}

export interface ReconcileReport {
  prospectsChecked: number;
  heldChecked: number;
  kept: number;
  held: number;
  archived: number;
  changes: ReconcileChange[];
}

/**
 * Re-check existing records against the *current* criteria — qualifying once is
 * not a permanent pass.
 *
 *  - Active prospects: genuine violation → Archive; hold-effect violation or an
 *    unverified source → Hold; otherwise kept. Every decision is logged, including
 *    "still qualifies".
 *  - Held records: a genuine violation → Archive. Otherwise they stay in Hold for
 *    a human to restore (Hold is never auto-promoted).
 *
 * Does not open a transaction; callers do (see runReconciliation / runUpdate).
 */
export async function reconcileExisting(ctx: Ctx): Promise<ReconcileReport> {
  const sys: Ctx = { ...asSystem(ctx, "reconciliation"), rules: ctx.rules ?? (await activeRules(ctx)) };
  assertCan(sys.actor, "reconcile.run");
  const report: ReconcileReport = { prospectsChecked: 0, heldChecked: 0, kept: 0, held: 0, archived: 0, changes: [] };
  const ts = new Date().toISOString();

  const rows = (
    await sys.db
      .select()
      .from(records)
      .where(and(eq(records.workspaceId, ctx.workspaceId), inArray(records.status, ["active", "hold"])))
  ).filter((r) => r.status === "hold" || r.stage === "verify");

  const apply = async (r: RecordRow, to: "active" | "hold" | "archived", reason: string, criteria: unknown) => {
    const patch: Partial<RecordRow> = { lastReconciledAt: ts };
    if (to !== r.status) {
      patch.status = to;
      patch.updatedAt = ts;
      if (to === "hold") Object.assign(patch, { holdReason: reason, holdSince: ts });
      if (to === "archived") Object.assign(patch, { archiveReason: reason, archivedAt: ts });
      report.changes.push({ id: r.id, account: r.account, opportunity: r.opportunity, from: r.status, to, reason });
    }
    await sys.db
      .update(records)
      .set(patch)
      .where(and(eq(records.workspaceId, ctx.workspaceId), eq(records.id, r.id)));
    await logHistory(sys, {
      entityType: "record",
      entityId: r.id,
      event: "reconcile",
      priorStatus: `${r.stage}/${r.status}`,
      newStatus: `${r.stage}/${to}`,
      reason,
      detail: { criteria },
    });
  };

  for (const r of rows) {
    const evaluation = await evaluateRecord(sys, r, "all");
    if (r.status === "active") {
      report.prospectsChecked++;
      const d = reconcileDecision(r.sourceVerification, evaluation);
      const to = d.action === "keep" ? "active" : d.action === "hold" ? "hold" : "archived";
      await apply(r, to, d.reason, evaluation.results);
      if (to === "active") report.kept++;
      else if (to === "hold") report.held++;
      else report.archived++;
    } else {
      report.heldChecked++;
      if (evaluation.fails.length > 0) {
        const reason = `Weekly re-check: no longer fits your rules — ${evaluation.fails.map((f) => f.reason).join("; ")}`;
        await apply(r, "archived", reason, evaluation.results);
        report.archived++;
      }
      // Otherwise leave it held and untouched — no log noise for unchanged holds.
    }
  }
  return report;
}

/** Stand-alone reconciliation (also part of every Run update). */
export async function runReconciliation(ctx: Ctx): Promise<ReconcileReport> {
  return ctx.db.transaction(async (tx) => {
    const c = { ...ctx, db: tx as unknown as Ctx["db"] };
    const report = await reconcileExisting(c);
    await logHistory(asSystem(c, "reconciliation"), {
      entityType: "reconciliation",
      event: "run",
      reason: `Re-checked ${report.prospectsChecked} Ready and ${report.heldChecked} On-hold leads: ${report.held} moved to On hold, ${report.archived} moved to Archived`,
      detail: { changes: report.changes.map((x) => ({ id: x.id, from: x.from, to: x.to })) },
    });
    return report;
  });
}
