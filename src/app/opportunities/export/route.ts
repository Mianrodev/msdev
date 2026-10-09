import type { NextRequest } from "next/server";
import { isModuleId } from "@/core/opportunities/types";
import { toCsv } from "@/services/export";
import { exportItems, type ExportSource } from "@/services/opportunities/export";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

/** CSV download. Access is checked server-side: every lookup is scoped to the signed-in workspace. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const moduleId = p.get("module");
  if (!isModuleId(moduleId)) return new Response("Unknown module", { status: 400 });
  const mode = p.get("mode") === "internal" ? "internal" : "shared";
  const search = p.get("search");
  const list = p.get("list");
  const source: ExportSource = search ? { searchId: search } : list ? { listId: list } : { saved: true, status: p.get("status") || undefined };
  const ctx = await getCtx();
  try {
    const { rows, demo } = await exportItems(ctx, moduleId, source, mode);
    const csv = rows.length ? toCsv(rows) : "No records\r\n";
    const name = `${demo ? "DEMO-" : ""}${moduleId}-${search ? "search" : list ? "list" : "saved"}-${mode === "shared" ? "shared-copy" : "with-notes"}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error && /not found/i.test(e.message) ? "Not found in your workspace" : "Export failed";
    return new Response(msg, { status: msg.startsWith("Not found") ? 404 : 500 });
  }
}
