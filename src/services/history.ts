import { and, desc, eq, type SQL } from "drizzle-orm";
import { history } from "@/db/schema";
import { actorLabel } from "@/core/types";
import type { Ctx } from "./context";

export interface HistoryEntry {
  entityType: "record" | "target_account" | "rule" | "setting" | "import" | "reconciliation" | "pipeline_run";
  entityId?: string | null;
  event: string;
  priorStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
  occurredAt?: string;
}

export function logHistory(ctx: Ctx, e: HistoryEntry) {
  ctx.db
    .insert(history)
    .values({
      workspaceId: ctx.workspaceId,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      event: e.event,
      priorStatus: e.priorStatus ?? null,
      newStatus: e.newStatus ?? null,
      reason: e.reason ?? null,
      detail: e.detail ?? null,
      actor: actorLabel(ctx.actor),
      ...(e.occurredAt ? { occurredAt: e.occurredAt } : {}),
    })
    .run();
}

export function listHistory(
  ctx: Ctx,
  opts: { entityType?: string; entityId?: string; event?: string; limit?: number } = {},
) {
  const conds: SQL[] = [eq(history.workspaceId, ctx.workspaceId)];
  if (opts.entityType) conds.push(eq(history.entityType, opts.entityType));
  if (opts.entityId) conds.push(eq(history.entityId, opts.entityId));
  if (opts.event) conds.push(eq(history.event, opts.event));
  return ctx.db
    .select()
    .from(history)
    .where(and(...conds))
    .orderBy(desc(history.id))
    .limit(opts.limit ?? 500)
    .all();
}
