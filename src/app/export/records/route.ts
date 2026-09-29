import type { NextRequest } from "next/server";
import { exportRecords, toCsv } from "@/services/export";
import { VIEWS, type View } from "@/services/records";
import { getCtx } from "@/services/request";
import { humanize } from "@/components/plain";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") === "internal" ? "internal" : "shared";
  const v = req.nextUrl.searchParams.get("view") ?? "all";
  const view = (v in VIEWS ? v : "all") as View;
  const csv = toCsv(await exportRecords(await getCtx(), mode, { view }), humanize);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${view}-${mode === "shared" ? "shared-copy" : "full-backup"}.csv"`,
    },
  });
}
