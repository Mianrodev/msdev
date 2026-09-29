import type { NextRequest } from "next/server";
import { exportRecords, toCsv } from "@/services/export";
import { VIEWS, type View } from "@/services/records";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") === "internal" ? "internal" : "shared";
  const v = req.nextUrl.searchParams.get("view") ?? "all";
  const view = (v in VIEWS ? v : "all") as View;
  const csv = toCsv(exportRecords(getCtx(), mode, { view }));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="records-${view}-${mode}.csv"`,
    },
  });
}
