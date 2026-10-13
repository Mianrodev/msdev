/**
 * Usage controls per workspace: searches per minute, live-provider calls per day, AI summaries per
 * day. Counted atomically in the database, so many requests at once still count (same approach as
 * the sign-in throttle in lib/auth.ts).
 */
import { sql } from "drizzle-orm";
import { oppUsage } from "@/db/schema";
import type { Ctx } from "../context";

export const LIMITS = {
  searchesPerMinute: () => num(process.env.OPP_SEARCHES_PER_MINUTE, 20),
  liveSearchesPerDay: () => num(process.env.OPP_LIVE_SEARCHES_PER_DAY, 100),
  aiSummariesPerDay: () => num(process.env.OPP_AI_SUMMARIES_PER_DAY, 25),
};

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

export class UsageLimitError extends Error {}

/** Count one use in `bucket`; false (and nothing counted) when the limit is already reached. */
export async function reserve(ctx: Ctx, bucket: string, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const rows = await ctx.db
    .insert(oppUsage)
    .values({ workspaceId: ctx.workspaceId, bucket, count: 1 })
    .onConflictDoUpdate({
      target: [oppUsage.workspaceId, oppUsage.bucket],
      set: { count: sql`${oppUsage.count} + 1`, updatedAt: new Date().toISOString() },
      where: sql`${oppUsage.count} < ${limit}`,
    })
    .returning({ count: oppUsage.count });
  return rows.length === 1;
}

export const minuteBucket = (kind: string, now: Date) => `${kind}:${now.toISOString().slice(0, 16)}`;
export const dayBucket = (kind: string, now: Date) => `${kind}:${now.toISOString().slice(0, 10)}`;
