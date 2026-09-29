import type { NextRequest } from "next/server";
import { exportAccounts, toCsv } from "@/services/export";
import { getCtx } from "@/services/request";
import { humanize } from "@/components/plain";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") === "internal" ? "internal" : "shared";
  const csv = toCsv(await exportAccounts(await getCtx(), mode), humanize);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="companies-${mode === "shared" ? "shared-copy" : "full-backup"}.csv"`,
    },
  });
}
