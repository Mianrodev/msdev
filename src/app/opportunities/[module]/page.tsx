import Link from "next/link";
import { notFound } from "next/navigation";
import { searchAction } from "../actions";
import { copyFor } from "@/brand/copy";
import { AreaMap, type MapPoint } from "@/components/opportunities/area-map";
import { ResultCard, ResultsTable, SearchForm } from "@/components/opportunities/results";
import { DemoBanner, EmptyState, ModeChip, SearchStatus } from "@/components/opportunities/ui";
import { Flash, one, type SearchParams } from "@/components/ui";
import { fmtWhen } from "@/components/plain";
import { valueOf } from "@/core/opportunities/fields";
import type { LatLng } from "@/core/opportunities/modules/expansion";
import { moduleDef } from "@/core/opportunities/modules";
import { isModuleId } from "@/core/opportunities/types";
import { searchResults } from "@/services/opportunities/items";
import { getCtx } from "@/services/request";
import { liveAvailability } from "@/sources/opportunities/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: SearchParams }) {
  const { module } = await params;
  if (!isModuleId(module)) notFound();
  const sp = await searchParams;
  const ctx = await getCtx();
  const def = moduleDef(module);
  const { t, mod } = copyFor();
  const searchId = one(sp.search);
  const view = one(sp.view) === "table" ? "table" : "cards";
  const result = searchId ? await searchResults(ctx, searchId) : null;
  const search = result && result.search.module === module ? result.search : null;
  const rows = search ? result!.rows : [];
  const live = liveAvailability(module);
  const back = `/opportunities/${module}${search ? `?search=${search.id}${view === "table" ? "&view=table" : ""}` : ""}`;
  const viewHref = (v: string) => `/opportunities/${module}?${search ? `search=${search.id}&` : ""}view=${v}`;

  const points: MapPoint[] =
    module === "expansion"
      ? rows
          .map((r) => ({ r, loc: valueOf(r.item.fields.location as never) as LatLng | null }))
          .filter((x): x is { r: (typeof rows)[number]; loc: LatLng } => !!x.loc)
          .map(({ r, loc }) => ({ id: r.item.id, name: r.item.title, lat: loc.lat, lng: loc.lng, rank: r.rank, score: r.match.score, href: `/opportunities/expansion/${r.item.id}?search=${search!.id}` }))
      : [];

  return (
    <>
      <Flash sp={sp} />
      <div className="op-head">
        <div>
          <h1>{mod(module, "name")}</h1>
          <p className="intro" style={{ marginBottom: 0 }}>
            {mod(module, "description")}
          </p>
        </div>
      </div>
      {searchId && !search && <p className="flash error">That search isn&apos;t in your workspace. Run a new search below.</p>}
      {search && (
        <a href="#filters" className="op-refine button small">
          Refine search ↓
        </a>
      )}
      <div className={`op-search${search ? " has-results" : ""}`}>
        <SearchForm module={module} def={def} query={(search?.query as Record<string, unknown>) ?? {}} action={searchAction.bind(null, module)} live={live} view={view} />
        <section aria-labelledby="results-h" aria-live="polite">
          <h2 id="results-h" className="sr-only">
            Results
          </h2>
          {!search ? (
            <EmptyState title={t("search.start.title")}>
              <p>{t("search.start.body")}</p>
            </EmptyState>
          ) : (
            <>
              {search.mode === "demo" && <DemoBanner />}
              <SearchStatus search={search} />
              {search.status !== "failed" && (
                <>
                  <div className="op-toolbar">
                    <div>
                      <span className="count">
                        {rows.length} result{rows.length === 1 ? "" : "s"}
                      </span>{" "}
                      <ModeChip mode={search.mode} />{" "}
                      <span className="muted small">
                        {search.summary} · {fmtWhen(search.finishedAt)}
                      </span>
                    </div>
                    <div className="row">
                      {module !== "expansion" && (
                        <nav className="op-seg" aria-label="Result layout">
                          <Link href={viewHref("cards")} aria-current={view === "cards" ? "true" : undefined}>
                            Cards
                          </Link>
                          <Link href={viewHref("table")} aria-current={view === "table" ? "true" : undefined}>
                            Table
                          </Link>
                        </nav>
                      )}
                      <form id="compare-form" action={`/opportunities/${module}/compare`} method="get">
                        <button type="submit" className="small" disabled={rows.length < 2}>
                          Compare selected
                        </button>
                      </form>
                      <a className="button small" href={`/opportunities/export?module=${module}&search=${search.id}&mode=shared`} download>
                        Export CSV
                      </a>
                    </div>
                  </div>
                  {rows.length > 0 && <p className="muted small" style={{ marginTop: 0 }}>{t("results.scoreHelp")}</p>}
                  {rows.length === 0 ? (
                    <EmptyState title={t("search.empty.title")}>
                      <p>{t("search.empty.body")}</p>
                    </EmptyState>
                  ) : module === "expansion" ? (
                    <>
                      <AreaMap points={points} caption={`Candidate areas for ${search.summary}`} />
                      <h3>Comparison table</h3>
                      <ResultsTable module={module} def={def} rows={rows} searchId={search.id} />
                      <h3>Areas, best first</h3>
                      <ol className="op-results">
                        {rows.map((r) => (
                          <ResultCard key={r.item.id} module={module} def={def} row={r} searchId={search.id} back={back} />
                        ))}
                      </ol>
                    </>
                  ) : view === "table" ? (
                    <ResultsTable module={module} def={def} rows={rows} searchId={search.id} />
                  ) : (
                    <ol className="op-results">
                      {rows.map((r) => (
                        <ResultCard key={r.item.id} module={module} def={def} row={r} searchId={search.id} back={back} />
                      ))}
                    </ol>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
