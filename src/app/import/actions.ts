"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlreadyImportedError, ImportCountMismatch, importWorkbook, type ImportReport } from "../../../scripts/lib/import-tracker";
import { getCtx } from "@/services/request";

function summary(r: ImportReport) {
  return r.sheets
    .map((s) => `${s.imported === s.data && (s.expected === undefined || s.expected === s.data) ? "✓" : "✗"} ${s.sheet}: ${s.imported} of ${s.data} rows`)
    .join("\n");
}

export async function importAction(f: FormData) {
  const ctx = await getCtx();
  const file = f.get("file");
  let target = "/import";
  if (!(file instanceof File) || file.size === 0) {
    target = `/import?error=${encodeURIComponent("Choose an .xlsx file first.")}`;
  } else if (!/\.xlsx$/i.test(file.name)) {
    target = `/import?error=${encodeURIComponent("That isn't an Excel .xlsx file. In Excel, use File → Save As → Excel Workbook (.xlsx), then upload that.")}`;
  } else {
    try {
      const report = await importWorkbook(ctx, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, { force: f.get("force") === "on" });
      revalidatePath("/", "layout");
      target = `/import?done=1&ok=${encodeURIComponent(`Uploaded ${report.file}. Every row was brought in:\n${summary(report)}`)}`;
    } catch (e) {
      const msg =
        e instanceof ImportCountMismatch
          ? `Some rows couldn't be matched up, so nothing was saved (your data is safe):\n${summary(e.report)}`
          : e instanceof AlreadyImportedError
            ? "You've already uploaded this exact file, so nothing changed. (If you really want to upload it again, tick the box under the button.)"
            : `The upload didn't work, and nothing was changed. Check it's your tracker spreadsheet and try again. (Details: ${e instanceof Error ? e.message : String(e)})`;
      target = `/import?error=${encodeURIComponent(msg)}`;
    }
  }
  redirect(target);
}
