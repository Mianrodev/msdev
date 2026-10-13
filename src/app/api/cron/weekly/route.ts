/**
 * Automatic search (Vercel Cron, see vercel.json): for each person's space, search the
 * job boards, then run the weekly check — the same as pressing "Find new leads".
 *
 * The scheduler calls this daily. On Mondays every space is searched (the owner's first), as
 * many as fit in one run; on other days only spaces that were missed catch up. If CRON_SECRET is set, Vercel sends it and it is required; otherwise only the
 * scheduler's user agent is accepted. Either way the route reveals nothing (it returns
 * counts only) and each space's run is claimed atomically before it starts, so a stray
 * call can't do more than trigger one early search.
 */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { OWNER_ID } from "@/lib/auth";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace, type Ctx } from "@/services/context";
import {
  claimScheduledRun,
  clearFailure,
  hasSavedWords,
  lastDiscovery,
  noteFailure,
  releaseScheduledRun,
  runDiscovery,
} from "@/services/discovery";
import { runUpdate } from "@/services/run-update";
import { pruneCache } from "@/services/source-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Mondays: every space not searched this week. Other days: only spaces missed for over 8 days (catch-up). */
const hoursSinceLast = () => (new Date().getUTCDay() === 1 ? 7 * 24 - 4 : 8 * 24);
/** Don't start another space after this much of the time allowed. */
const START_BUDGET_MS = 150_000;
/** The whole run must finish inside Vercel's limit (300 s), with room to save. */
const TOTAL_BUDGET_MS = 280_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Hosted: the secret is required (set CRON_SECRET in Vercel → Settings → Environment variables).
  if (!secret && process.env.VERCEL) {
    console.error("weekly search: CRON_SECRET is not set, so the scheduler can't be trusted; refusing");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const allowed = secret
    ? req.headers.get("authorization") === `Bearer ${secret}`
    : /vercel-cron/i.test(req.headers.get("user-agent") ?? "");
  if (!allowed) return NextResponse.json({ ok: false }, { status: 401 });

  const started = Date.now();
  const db = await getDb();
  await ensureWorkspace(db);
  await pruneCache(db).catch((e) => console.error("cache prune failed", e)); // cheap, keeps the free database small
  const people = await db.select({ id: users.id, workspaceId: users.workspaceId }).from(users).where(eq(users.status, "active"));
  const spaces = [
    ...new Set([...people].sort((a, b) => (a.id === OWNER_ID ? -1 : b.id === OWNER_ID ? 1 : 0)).map((p) => p.workspaceId)),
  ];
  const done: { newLeads: number; closed: number }[] = [];
  let skipped = 0;
  for (const workspaceId of spaces) {
    if (Date.now() - started > START_BUDGET_MS) break; // the rest go tomorrow
    const ctx: Ctx = { db, workspaceId, actor: { kind: "system", process: "weekly-schedule" } };
    // A member who hasn't chosen their words yet isn't searched with somebody else's.
    if (workspaceId !== DEFAULT_WORKSPACE_ID && !(await hasSavedWords(ctx))) {
      skipped++;
      continue;
    }
    const last = await lastDiscovery(ctx);
    // A search pressed by hand in the last 20 hours is enough.
    if (last && Date.now() - new Date(last.finishedAt).getTime() < 20 * 3_600_000) {
      skipped++;
      continue;
    }
    if (!(await claimScheduledRun(ctx, hoursSinceLast()))) {
      skipped++;
      continue;
    }
    let search;
    try {
      // The time left is shared out: the sites and the company checks get a third of it each, at most 90 s.
      const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
      search = await runDiscovery(ctx, {
        siteBudgetMs: Math.max(20_000, Math.min(90_000, remaining / 3)),
        sites: remaining > 120_000,
      });
    } catch (e) {
      // One space's problem never stops the others; it's tried again on the next daily run.
      await noteFailure(ctx, "search", e).catch(() => undefined);
      await releaseScheduledRun(ctx).catch(() => undefined);
      continue;
    }
    try {
      await runUpdate(ctx);
      await clearFailure(ctx);
      done.push({ newLeads: search.newLeads, closed: search.closed });
    } catch (e) {
      await noteFailure(ctx, "sorting", e).catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true, searched: done.length, skipped });
}
