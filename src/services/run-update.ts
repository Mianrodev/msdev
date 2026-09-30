/**
 * "Run update" — the weekly workflow as a repeatable, manually triggered action.
 * (Replaces the workbook's trigger phrase "Update this week's prospect tracker".)
 *
 * Order, all inside one transaction:
 *   0. Reconcile existing prospects and held records against the current rules.
 *   1. Discovery intake — records captured since they were last processed.
 *   2. Screen  every active record awaiting screen.
 *   3. Triage  every active record awaiting triage (including ones just screened).
 *   4. Verify  every active record awaiting verification.
 *
 * Each stage applies the stored rules and writes a verdict + reason. It never
 * deletes (records move to Hold/Archive), never contacts anyone, and never
 * promotes an unverified source. It runs as a system actor, so the permission
 * layer refuses anything outside research/preparation.
 *
 * Designed as a plain function so a scheduler could call it later; v1 only
 * exposes it as a button.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { pipelineRuns, records } from "@/db/schema";
import { suggestVerdict, verdictEffect } from "@/core/pipeline";
import { summarize } from "@/core/rules";
import { actorLabel, VERDICT_LABELS, type DecisionStage, type FitTier } from "@/core/types";
import { asSystem, type Ctx } from "./context";
import { logHistory } from "./history";
import { decideStage, evaluateRecord } from "./records";
import { reconcileExisting, type ReconcileReport } from "./reconcile";
import { activeRules } from "./rules";

export interface StageCounts {
  in: number;
  advanced: number;
  held: number;
  archived: number;
}

export interface RunSummary {
  runId: string;
  intake: number;
  reconciliation: Omit<ReconcileReport, "changes">;
  stages: Record<DecisionStage, StageCounts>;
  movedToHold: number;
  movedToArchive: number;
  activeProspectsByTier: Record<string, number>;
  changes: { id: string; account: string; opportunity: string; from: string; to: string }[];
}

const STAGE_FROM: Record<DecisionStage, "discovery" | "screen" | "triage"> = {
  screen: "discovery",
  triage: "screen",
  verify: "triage",
};

export async function runUpdate(ctx: Ctx): Promise<RunSummary> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();

  return ctx.db.transaction(async (tx) => {
    // Rules are loaded once for the whole run: every stage sees the same criteria.
    const c: Ctx = { ...ctx, db: tx as unknown as Ctx["db"] };
    c.rules = await activeRules(c);
    const sys: Ctx = { ...asSystem(c, `run-update:${runId.slice(0, 8)}`), rules: c.rules };
    const scoped = (stage: "discovery" | "screen" | "triage") =>
      sys.db
        .select()
        .from(records)
        .where(and(eq(records.workspaceId, c.workspaceId), eq(records.status, "active"), eq(records.stage, stage)))
        .orderBy(asc(records.createdAt), asc(records.id));

    const intake = (await scoped("discovery")).length;
    const rec = await reconcileExisting(c);
    const changes: RunSummary["changes"] = rec.changes.map(({ id, account, opportunity, from, to }) => ({
      id,
      account,
      opportunity,
      from,
      to,
    }));

    const stages = {} as Record<DecisionStage, StageCounts>;
    for (const stage of ["screen", "triage", "verify"] as const) {
      const counts: StageCounts = { in: 0, advanced: 0, held: 0, archived: 0 };
      for (const r of await scoped(STAGE_FROM[stage])) {
        // Jobs found automatically get the automatic first look, then wait for the owner's review
        // (the "New to review" list) rather than being promoted by rules alone.
        if (stage !== "screen" && r.origin === "discovery" && r.stage === "screen") continue;
        counts.in++;
        const evaluation = await evaluateRecord(sys, r, stage);
        const verdict = suggestVerdict(stage, evaluation, r.sourceVerification)!;
        const why =
          stage === "verify" && verdict === "hold_needs_info" && r.sourceVerification !== "verified" && !evaluation.holds.length
            ? `the listing ${r.sourceVerification === "unreachable" ? "couldn't be reached" : "hasn't been checked yet"} — check the link is still open`
            : summarize(evaluation);
        const after = await decideStage(sys, r.id, {
          stage,
          verdict,
          reason: `Weekly check: ${VERDICT_LABELS[verdict]} — ${why}`,
        });
        const effect = verdictEffect(verdict);
        if (effect === "advance") counts.advanced++;
        else if (effect === "hold") counts.held++;
        else counts.archived++;
        if (after.status !== r.status) {
          changes.push({ id: r.id, account: r.account, opportunity: r.opportunity, from: r.status, to: after.status });
        }
      }
      stages[stage] = counts;
    }

    const tiers: Record<string, number> = {};
    for (const r of await sys.db
      .select({ tier: records.fitTier })
      .from(records)
      .where(and(eq(records.workspaceId, c.workspaceId), eq(records.status, "active"), eq(records.stage, "verify")))) {
      const k = (r.tier as FitTier | null) ?? "untiered";
      tiers[k] = (tiers[k] ?? 0) + 1;
    }

    const { changes: _c, ...recCounts } = rec;
    const summary: RunSummary = {
      runId,
      intake,
      reconciliation: recCounts,
      stages,
      movedToHold: changes.filter((x) => x.to === "hold").length,
      movedToArchive: changes.filter((x) => x.to === "archived").length,
      activeProspectsByTier: tiers,
      changes,
    };

    await sys.db
      .insert(pipelineRuns)
      .values({
        id: runId,
        workspaceId: c.workspaceId,
        actor: actorLabel(ctx.actor),
        summary: summary as unknown as Record<string, unknown>,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    await logHistory(sys, {
      entityType: "pipeline_run",
      entityId: runId,
      event: "run_update",
      reason: formatSummary(summary),
      detail: { requestedBy: actorLabel(ctx.actor), changes: changes.map((x) => ({ id: x.id, from: x.from, to: x.to })) },
    });
    return summary;
  });
}

/** The brief, neutral summary — counts only, no narrative. */
export function formatSummary(s: RunSummary): string {
  const st = s.stages;
  const processed = st.screen.in + (st.triage.in - st.screen.advanced) + (st.verify.in - st.triage.advanced);
  const ready = Object.values(s.activeProspectsByTier).reduce((x, y) => x + y, 0);
  return [
    `Re-checked ${s.reconciliation.prospectsChecked} Ready and ${s.reconciliation.heldChecked} On-hold leads`,
    `moved ${processed} waiting leads through the checks (${st.verify.advanced} became Ready)`,
    `${s.movedToHold} moved to On hold, ${s.movedToArchive} moved to Archived`,
    `${ready} Ready now`,
  ].join("; ") + ".";
}

export async function listRuns(ctx: Ctx, limit = 20) {
  return ctx.db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.workspaceId, ctx.workspaceId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit);
}
