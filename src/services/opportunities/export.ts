/**
 * CSV export for every module. Each row carries its provenance (provider, source URL, retrieved
 * and published dates), the original wording of critical fields, and — for demo data — a label on
 * every row and in the file name. Reuses the CRM's CSV writer (formula-injection safe) and its
 * shared/internal redaction: the shared copy drops notes and scrubs identity terms, emails and phones.
 */
import { assertCan } from "@/core/permissions";
import { redactRow, type DataClass, type ExportMode } from "@/core/redaction";
import { sourcesOf } from "@/core/opportunities/fields";
import { moduleDef, statusLabel } from "@/core/opportunities/modules";
import type { MatchResult, ModuleId } from "@/core/opportunities/types";
import type { OppItemRow } from "@/db/schema";
import { providerInfo } from "@/sources/opportunities/registry";
import type { Ctx } from "../context";
import { logHistory } from "../history";
import { getIdentityTerms } from "../rules";
import { listNotes, listSaved, searchResults, toNormalized } from "./items";

export const DEMO_LABEL = "DEMO — fictional data";

export type ExportSource = { searchId: string } | { listId: string } | { saved: true; status?: string };

function rowFor(item: OppItemRow, match: MatchResult | null, notes: string): Record<string, unknown> {
  const mod = item.module as ModuleId;
  const def = moduleDef(mod);
  const it = toNormalized(item);
  const row: Record<string, unknown> = {
    "Data mode": item.mode === "demo" ? DEMO_LABEL : "Live",
    Name: item.title,
    Detail: item.subtitle ?? "",
  };
  for (const c of def.columns) row[c.label] = c.text(it);
  for (const k of def.criticalFields) {
    const f = it.fields[k];
    if (f && f.state !== "unknown" && f.raw) row[`${def.fieldLabels[k] ?? k} — original wording`] = f.raw;
    if (f?.state === "conflict") row[`${def.fieldLabels[k] ?? k} — conflict`] = (f.alternatives ?? []).map((a) => `${a.raw ?? a.value} (${a.evidence.map((e) => e.sourceUrl ?? e.provider).join(", ")})`).join(" | ");
  }
  if (match) {
    row["Score (0–100, comparative)"] = match.score ?? "";
    row["Data coverage"] = `${Math.round(match.coverage * 100)}%`;
    row["Why it matched"] = match.reasons.join(" ");
    row["Things to check"] = [...match.flags, ...(match.excluded ? [match.excluded] : [])].join(" ");
  }
  const enr = item.enrichment as { label?: string; summary?: string; model?: string } | null;
  if (enr?.summary) row["AI summary (may contain errors — not a published fact)"] = `${enr.summary} [${enr.model ?? "AI"}]`;
  row.Status = statusLabel(mod, item.status);
  row["Source URL"] = item.sourceUrl ?? "";
  row.Provider = item.provider
    .split("+")
    .map((p) => providerInfo(p)?.name ?? p)
    .join(" + ");
  row["Retrieved at"] = item.retrievedAt;
  row["Published at"] = item.publishedAt ?? "";
  row["Evidence sources"] = sourcesOf(it.fields)
    .map((e) => e.sourceUrl)
    .filter(Boolean)
    .join(" ");
  const attributions = [...new Set(item.provider.split("+").map((p) => providerInfo(p)?.attribution).filter(Boolean))];
  if (attributions.length) row.Attribution = attributions.join(" ");
  row.Notes = notes;
  row.Id = item.id;
  return row;
}

export async function exportItems(ctx: Ctx, module: ModuleId, source: ExportSource, mode: ExportMode): Promise<{ rows: Record<string, unknown>[]; demo: boolean }> {
  assertCan(ctx.actor, mode === "internal" ? "export.internal" : "export.shared");
  let entries: { item: OppItemRow; match: MatchResult | null }[];
  if ("searchId" in source) {
    const res = await searchResults(ctx, source.searchId);
    if (!res || res.search.module !== module) throw new Error("Search not found");
    entries = res.rows.map((r) => ({ item: r.item, match: r.match }));
  } else {
    const saved = await listSaved(ctx, "listId" in source ? { module, listId: source.listId } : { module, status: source.status });
    entries = saved.map((item) => ({ item, match: (item.lastMatch as unknown as MatchResult) ?? null }));
  }
  const terms = mode === "shared" ? await getIdentityTerms(ctx) : [];
  const rows: Record<string, unknown>[] = [];
  for (const e of entries) {
    const notes = mode === "internal" ? (await listNotes(ctx, e.item.id)).map((n) => `[${n.createdAt.slice(0, 10)}] ${n.body}`).join("\n") : "";
    const row = rowFor(e.item, e.match, notes);
    const classes: Record<string, DataClass> = Object.fromEntries(Object.keys(row).map((k) => [k, k === "Notes" ? "restricted" : "internal"]));
    rows.push(redactRow(row, classes, mode, terms));
  }
  const demo = entries.some((e) => e.item.mode === "demo");
  await logHistory(ctx, {
    entityType: "opportunity",
    event: `export.${mode}`,
    reason: `Downloaded ${rows.length} ${module} records (${mode === "shared" ? "shared copy" : "full"}${demo ? ", demo data" : ""})`,
    detail: { module, source },
  });
  return { rows, demo };
}
