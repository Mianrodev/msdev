import { and, eq, inArray } from "drizzle-orm";
import { records, type RecordRow } from "@/db/schema";
import { assertCan } from "@/core/permissions";
import { reconcileDecision } from "@/core/pipeline";
import { asSystem, type Ctx } from "./context";
import { logHistory } from "./history";
import { evaluateRecord } from "./records";

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
export function reconcileExisting(ctx: Ctx): ReconcileReport {
  const sys = asSystem(ctx, "reconciliation");
  assertCan(sys.actor, "reconcile.run");
  const report: ReconcileReport = { prospectsChecked: 0, heldChecked: 0, kept: 0, held: 0, archived: 0, changes: [] };
  const ts = new Date().toISOString();

  const rows = sys.db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, ctx.workspaceId), inArray(records.status, ["active", "hold"])))
    .all()
    .filter((r) => r.status === "hold" || r.stage === "verify");

  const apply = (r: RecordRow, to: "active" | "hold" | "archived", reason: string, criteria: unknown) => {
    const patch: Partial<RecordRow> = { lastReconciledAt: ts };
    if (to !== r.status) {
      patch.status = to;
      patch.updatedAt = ts;
      if (to === "hold") Object.assign(patch, { holdReason: reason, holdSince: ts });
      if (to === "archived") Object.assign(patch, { archiveReason: reason, archivedAt: ts });
      report.changes.push({ id: r.id, account: r.account, opportunity: r.opportunity, from: r.status, to, reason });
    }
    sys.db
      .update(records)
      .set(patch)
      .where(and(eq(records.workspaceId, ctx.workspaceId), eq(records.id, r.id)))
      .run();
    logHistory(sys, {
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
    const evaluation = evaluateRecord(sys, r, "all");
    if (r.status === "active") {
      report.prospectsChecked++;
      const d = reconcileDecision(r.sourceVerification, evaluation);
      const to = d.action === "keep" ? "active" : d.action === "hold" ? "hold" : "archived";
      apply(r, to, d.reason, evaluation.results);
      if (to === "active") report.kept++;
      else if (to === "hold") report.held++;
      else report.archived++;
    } else {
      report.heldChecked++;
      if (evaluation.fails.length > 0) {
        const reason = `Reconciliation: no longer meets criteria — ${evaluation.fails.map((f) => f.reason).join("; ")}`;
        apply(r, "archived", reason, evaluation.results);
        report.archived++;
      }
      // Otherwise leave it held and untouched — no log noise for unchanged holds.
    }
  }
  return report;
}

/** Stand-alone reconciliation (also part of every Run update). */
export function runReconciliation(ctx: Ctx): ReconcileReport {
  return ctx.db.transaction((tx) => {
    const c = { ...ctx, db: tx as unknown as Ctx["db"] };
    const report = reconcileExisting(c);
    logHistory(asSystem(c, "reconciliation"), {
      entityType: "reconciliation",
      event: "run",
      reason: `Prospects checked ${report.prospectsChecked}, held checked ${report.heldChecked}: kept ${report.kept}, to hold ${report.held}, to archive ${report.archived}`,
      detail: { changes: report.changes.map((x) => ({ id: x.id, from: x.from, to: x.to })) },
    });
    return report;
  });
}
