/**
 * Read an .xlsx into sheets → blocks → rows, handling what the tracker workbook
 * actually contains: repeated header rows, section-title rows ("WATCHLIST — …"),
 * blank separator rows, native hyperlinks and HYPERLINK() formulas.
 *
 * Every physical row is classified (header / section / blank / data) so the
 * import can prove nothing was dropped.
 */
import ExcelJS from "exceljs";

export type RowKind = "header" | "section" | "blank" | "data";

export interface SheetRow {
  rowNumber: number;
  kind: RowKind;
  /** Section title in effect for this row ("" before any section title). */
  section: string;
  /** header → value; only for data rows. */
  values: Record<string, string>;
  /** Raw cell texts in column order (all kinds). */
  cells: string[];
}

export interface Sheet {
  name: string;
  hidden: boolean;
  rows: SheetRow[];
  hyperlinks: number;
}

export const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function dateText(d: Date): string {
  // Excel dates arrive as UTC midnight; keep calendar dates as YYYY-MM-DD.
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

/** Cell → { text, link }. `link` is the hyperlink target when there is one. */
export function readCell(cell: ExcelJS.Cell): { text: string; link: string | null } {
  const v = cell.value as unknown;
  let text = "";
  let link: string | null = cell.hyperlink ?? null;
  if (v == null) text = "";
  else if (v instanceof Date) text = dateText(v);
  else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) text = (o.richText as { text: string }[]).map((t) => t.text).join("");
    else if ("hyperlink" in o) {
      link = String(o.hyperlink ?? "") || link;
      const t = o.text as unknown;
      text =
        t && typeof t === "object" && Array.isArray((t as Record<string, unknown>).richText)
          ? ((t as { richText: { text: string }[] }).richText.map((x) => x.text).join(""))
          : String(t ?? "");
    } else if ("formula" in o || "sharedFormula" in o) {
      const f = String(o.formula ?? "");
      const m = f.match(/^HYPERLINK\(\s*"([^"]+)"\s*(?:,\s*"([^"]*)")?/i);
      if (m) link = m[1];
      const r = o.result;
      text = r instanceof Date ? dateText(r) : r == null ? (m?.[2] ?? "") : String(r);
    } else if ("error" in o) text = String(o.error);
    else text = String(v);
  } else text = String(v);
  if (link?.startsWith("mailto:")) link = null; // never treat an email as a source link
  return { text: text.trim(), link: link?.trim() || null };
}

/**
 * @param knownHeaders header names per sheet, used to recognise repeated header rows
 * @param urlColumns   column names whose hyperlink target should replace display text
 * @param keyValueSheets sheets with no header row: each row is read as { key, value }
 */
export async function readWorkbook(
  data: Buffer,
  knownHeaders: Record<string, string[][]>,
  urlColumns: Set<string>,
  keyValueSheets: Set<string> = new Set(),
): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs's typings predate Node's generic Buffer; the runtime accepts any Buffer.
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const out: Sheet[] = [];

  for (const ws of wb.worksheets) {
    const known = (knownHeaders[ws.name] ?? []).map((h) => new Set(h.map(norm)));
    const width = Math.max(ws.columnCount, 1);
    const raw: { rowNumber: number; cells: { text: string; link: string | null }[] }[] = [];
    let hyperlinks = 0;
    for (let n = 1; n <= ws.rowCount; n++) {
      const row = ws.getRow(n);
      const cells: { text: string; link: string | null }[] = [];
      for (let c = 1; c <= width; c++) {
        const cell = readCell(row.getCell(c));
        if (cell.link) hyperlinks++;
        cells.push(cell);
      }
      raw.push({ rowNumber: n, cells });
    }

    const isHeader = (cells: { text: string }[]) => {
      const texts = cells.map((c) => norm(c.text)).filter(Boolean);
      if (texts.length < 2) return false;
      if (!known.length) return false;
      return known.some((set) => texts.filter((t) => set.has(t)).length >= Math.min(3, set.size) && set.has(texts[0]));
    };

    const rows: SheetRow[] = [];
    let header: string[] | null = null;
    let section = "";
    raw.forEach((r, i) => {
      const texts = r.cells.map((c) => c.text);
      const filled = texts.filter(Boolean).length;
      if (filled === 0) {
        rows.push({ rowNumber: r.rowNumber, kind: "blank", section, values: {}, cells: texts });
        return;
      }
      if (keyValueSheets.has(ws.name)) {
        const [k, v] = r.cells;
        const values: Record<string, string> = { key: k?.text ?? "", value: v?.link && !v.text ? v.link : (v?.text ?? "") };
        r.cells.slice(2).forEach((c, j) => c.text && (values[`Column ${j + 3}`] = c.text));
        rows.push({ rowNumber: r.rowNumber, kind: "data", section, values, cells: texts });
        return;
      }
      if (known.length ? isHeader(r.cells) : header === null) {
        header = texts;
        rows.push({ rowNumber: r.rowNumber, kind: "header", section, values: {}, cells: texts });
        return;
      }
      // A lone first-column cell directly before a header row is a section title.
      const next = raw.slice(i + 1).find((x) => x.cells.some((c) => c.text));
      if (filled === 1 && texts[0] && next && isHeader(next.cells)) {
        section = texts[0];
        rows.push({ rowNumber: r.rowNumber, kind: "section", section, values: {}, cells: texts });
        return;
      }
      const values: Record<string, string> = {};
      (header ?? texts.map((_, c) => `Column ${c + 1}`)).forEach((h, c) => {
        if (!h) return;
        const cell = r.cells[c];
        if (!cell) return;
        const v = urlColumns.has(norm(h)) && cell.link ? cell.link : cell.text;
        if (v) values[h] = v;
        // Keep a hyperlink's target even on non-URL columns, so no link is lost.
        if (cell.link && !urlColumns.has(norm(h))) values[`${h} (link)`] = cell.link;
      });
      rows.push({ rowNumber: r.rowNumber, kind: "data", section, values, cells: texts });
    });
    out.push({ name: ws.name, hidden: ws.state !== "visible", rows, hyperlinks });
  }
  return out;
}
