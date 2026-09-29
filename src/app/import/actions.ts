"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AlreadyImportedError, ImportCountMismatch, importWorkbook, type ImportReport } from "../../../scripts/lib/import-tracker";
import { getCtx } from "@/services/request";

function summary(r: ImportReport) {
  return r.sheets
    .map((s) => `${s.sheet}: ${s.imported} of ${s.data} rows${s.expected !== undefined ? ` (workbook says ${s.expected})` : ""} ${s.imported === s.data && (s.expected === undefined || s.expected === s.data) ? "✓" : "✗"}`)
    .join("\n");
}

export async function importAction(f: FormData) {
  const ctx = await getCtx();
  const file = f.get("file");
  let target = "/import";
  if (!(file instanceof File) || file.size === 0) {
    target = `/import?error=${encodeURIComponent("Choose an .xlsx file first.")}`;
  } else if (!/\.xlsx$/i.test(file.name)) {
    target = `/import?error=${encodeURIComponent("That isn't an .xlsx file.")}`;
  } else {
    try {
      const report = await importWorkbook(ctx, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, { force: f.get("force") === "on" });
      revalidatePath("/", "layout");
      target = `/import?ok=${encodeURIComponent(`Imported ${report.file}. Nothing was lost:\n${summary(report)}`)}`;
    } catch (e) {
      const msg =
        e instanceof ImportCountMismatch
          ? `Row counts didn't match, so nothing was saved:\n${summary(e.report)}`
          : e instanceof AlreadyImportedError
            ? "This exact file was already imported. Tick “import again anyway” if you really want to re-import it."
            : `Import failed: ${e instanceof Error ? e.message : String(e)}`;
      target = `/import?error=${encodeURIComponent(msg)}`;
    }
  }
  redirect(target);
}
