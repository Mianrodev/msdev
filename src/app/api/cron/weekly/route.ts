/**
 * Weekly automatic search (Vercel Cron, see vercel.json): search the job boards,
 * then run the weekly check — the same as pressing "Find new leads".
 *
 * Called by Vercel's scheduler. If CRON_SECRET is set, Vercel sends it and it is
 * required; otherwise only the scheduler's user agent is accepted. Either way the
 * route reveals nothing (it returns counts only) and starts at most once every 20
 * hours (claimed atomically before it runs), so a stray call can't do more than
 * trigger one early search.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace, type Ctx } from "@/services/context";
import { claimScheduledRun, lastDiscovery, runDiscovery } from "@/services/discovery";
import { runUpdate } from "@/services/run-update";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const allowed = secret
    ? req.headers.get("authorization") === `Bearer ${secret}`
    : /vercel-cron/i.test(req.headers.get("user-agent") ?? "");
  if (!allowed) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  await ensureWorkspace(db);
  const ctx: Ctx = { db, workspaceId: DEFAULT_WORKSPACE_ID, actor: { kind: "system", process: "weekly-schedule" } };
  const last = await lastDiscovery(ctx);
  // A search pressed by hand in the last 20 hours is enough; and only one scheduled run can
  // start per 20 hours, however many requests arrive at once.
  if (last && Date.now() - new Date(last.finishedAt).getTime() < 20 * 3_600_000) {
    return NextResponse.json({ ok: true, skipped: "searched recently" });
  }
  if (!(await claimScheduledRun(ctx, 20))) return NextResponse.json({ ok: true, skipped: "already running or ran recently" });
  const search = await runDiscovery(ctx);
  const run = await runUpdate(ctx);
  return NextResponse.json({ ok: true, newLeads: search.newLeads, closed: search.closed, movedToArchive: run.movedToArchive });
}
