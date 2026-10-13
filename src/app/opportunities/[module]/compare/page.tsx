import Link from "next/link";
import { notFound } from "next/navigation";
import { copyFor } from "@/brand/copy";
import { ExtLink, EmptyState, ModeChip, StatusChip } from "@/components/opportunities/ui";
import { BackLink, type SearchParams } from "@/components/ui";
import { completeness } from "@/core/opportunities/fields";
import { moduleDef } from "@/core/opportunities/modules";
import { isModuleId, type MatchResult } from "@/core/opportunities/types";
import { getItems, toNormalized } from "@/services/opportunities/items";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function ComparePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: SearchParams }) {
  const { module } = await params;
  if (!isModuleId(module)) notFound();
  const sp = await searchParams;
  const ids = (Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : []).slice(0, 6);
  const ctx = await getCtx();
  const rows = (await getItems(ctx, ids)).filter((r) => r.module === module);
  const def = moduleDef(module);
  const { t, mod } = copyFor();
  const scores = rows.map((r) => (r.lastMatch as unknown as MatchResult | null)?.score ?? null);
  const best = Math.max(...scores.map((s) => s ?? -1));

  return (
    <>
      <BackLink href={`/opportunities/${module}`}>Back to {mod(module, "name")}</BackLink>
      <h1>Compare {rows.length} {mod(module, "name").toLowerCase()}</h1>
      {rows.length < 2 ? (
        <EmptyState title="Pick at least two to compare">
          <p>Tick “Compare” on two to six results, then press “Compare selected”.</p>
        </EmptyState>
      ) : (
        <>
          {rows.some((r) => r.mode === "demo") && <p className="op-banner demo">{t("demo.banner")}</p>}
          <p className="muted small">{t("results.scoreHelp")} Unknown values are shown as unknown; nothing is filled in to make columns line up.</p>
          <div className="op-compare">
            <table>
              <caption className="sr-only">Side-by-side comparison</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Field</span>
                  </th>
                  {rows.map((r) => (
                    <th key={r.id} scope="col">
                      <Link href={`/opportunities/${module}/${r.id}`}>{r.title}</Link>
                      <div className="row" style={{ gap: ".3rem", marginTop: ".3rem" }}>
                        <ModeChip mode={r.mode} />
                        <StatusChip module={module} status={r.status} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Score (comparative)</th>
                  {rows.map((r, i) => (
                    <td key={r.id} className={scores[i] !== null && scores[i] === best ? "best" : undefined}>
                      {scores[i] === null ? <span className="op-unknown">Not scored</span> : `${scores[i]} / 100`}
                      {scores[i] !== null && scores[i] === best && <span className="sr-only"> (highest)</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Data coverage of score</th>
                  {rows.map((r) => {
                    const m = r.lastMatch as unknown as MatchResult | null;
                    return <td key={r.id}>{m ? `${Math.round(m.coverage * 100)}%` : "—"}</td>;
                  })}
                </tr>
                <tr>
                  <th scope="row">Evidence completeness</th>
                  {rows.map((r) => (
                    <td key={r.id}>{Math.round(completeness(toNormalized(r).fields, def.keyFields).ratio * 100)}%</td>
                  ))}
                </tr>
                {def.compareRows.map((c) => (
                  <tr key={c.key}>
                    <th scope="row">{c.label}</th>
                    {rows.map((r) => {
                      const text = c.text(toNormalized(r));
                      return (
                        <td key={r.id} className={text === "Unknown" ? "op-unknown" : text.startsWith("Conflicting") ? "op-conflict" : undefined}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row">Things to check</th>
                  {rows.map((r) => {
                    const m = r.lastMatch as unknown as MatchResult | null;
                    return (
                      <td key={r.id} className="small">
                        {m ? [...(m.excluded ? [m.excluded] : []), ...m.flags].slice(0, 4).join(" ") || "—" : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">Source</th>
                  {rows.map((r) => (
                    <td key={r.id}>{r.sourceUrl ? <ExtLink href={r.sourceUrl}>Open source</ExtLink> : "—"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
