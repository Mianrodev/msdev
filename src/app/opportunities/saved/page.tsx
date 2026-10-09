import Link from "next/link";
import { createListAction } from "../actions";
import { copyFor } from "@/brand/copy";
import { PendingButton } from "@/components/opportunities/client";
import { ResultCard } from "@/components/opportunities/results";
import { EmptyState } from "@/components/opportunities/ui";
import { Flash, one, type SearchParams } from "@/components/ui";
import { moduleDef } from "@/core/opportunities/modules";
import { isModuleId, MODULE_IDS, type MatchResult, type ModuleId } from "@/core/opportunities/types";
import { listLists, listSaved, NotFoundError } from "@/services/opportunities/items";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function SavedPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const m = one(sp.module);
  const moduleId: ModuleId = isModuleId(m) ? m : "tenders";
  const listId = one(sp.list) || undefined;
  const status = one(sp.status) || undefined;
  const ctx = await getCtx();
  const def = moduleDef(moduleId);
  const { t, mod } = copyFor();
  const lists = await listLists(ctx, moduleId);
  let items: Awaited<ReturnType<typeof listSaved>> = [];
  let missingList = false;
  try {
    items = await listSaved(ctx, { module: moduleId, listId, status });
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
    missingList = true;
  }
  const list = lists.find((l) => l.id === listId);
  const q = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { module: moduleId, list: listId, status, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/opportunities/saved?${p}`;
  };
  const back = q({});
  const exportBase = `/opportunities/export?module=${moduleId}${listId ? `&list=${listId}` : "&saved=1"}${status ? `&status=${status}` : ""}`;

  return (
    <>
      <Flash sp={sp} />
      <h1>Saved & lists</h1>
      <nav className="op-seg" aria-label="Module" style={{ marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
        {MODULE_IDS.map((id) => (
          <Link key={id} href={`/opportunities/saved?module=${id}`} aria-current={id === moduleId ? "true" : undefined}>
            {mod(id, "name")}
          </Link>
        ))}
      </nav>
      <div className="op-search">
        <aside className="op-filters" aria-label="Lists and filters">
          <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Lists</h2>
          <ul className="op-list-plain">
            <li>
              <Link href={q({ list: undefined })} aria-current={!listId ? "page" : undefined} style={{ fontWeight: !listId ? 700 : undefined }}>
                All saved
              </Link>
            </li>
            {lists.map((l) => (
              <li key={l.id}>
                <Link href={q({ list: l.id })} aria-current={l.id === listId ? "page" : undefined} style={{ fontWeight: l.id === listId ? 700 : undefined }}>
                  {l.name}
                </Link>{" "}
                <span className="muted small">({l.count})</span>
              </li>
            ))}
          </ul>
          <form action={createListAction.bind(null, moduleId)} className="stack" style={{ marginTop: "var(--space-3)" }}>
            <input type="hidden" name="back" value={back} />
            <label>
              New list
              <input name="name" required maxLength={120} placeholder={moduleId === "expansion" ? "e.g. Shortlist — north side" : "e.g. Q4 shortlist"} />
            </label>
            <PendingButton className="small">Create list</PendingButton>
          </form>
          <h2 style={{ fontSize: "1rem" }}>Status</h2>
          <ul className="op-list-plain">
            <li>
              <Link href={q({ status: undefined })} style={{ fontWeight: !status ? 700 : undefined }}>
                Any status
              </Link>
            </li>
            {def.statuses.map((s) => (
              <li key={s.id}>
                <Link href={q({ status: s.id })} aria-current={s.id === status ? "page" : undefined} style={{ fontWeight: s.id === status ? 700 : undefined }}>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <section aria-labelledby="saved-h">
          <div className="op-toolbar">
            <h2 id="saved-h" style={{ margin: 0, fontSize: "1.15rem" }}>
              {list ? list.name : `All saved ${mod(moduleId, "name").toLowerCase()}`} <span className="muted">({items.length})</span>
            </h2>
            {items.length > 0 && (
              <div className="row">
                <form id="compare-form" action={`/opportunities/${moduleId}/compare`} method="get">
                  <button type="submit" className="small" disabled={items.length < 2}>
                    Compare selected
                  </button>
                </form>
                <a className="button small" href={`${exportBase}&mode=shared`} download>
                  Export CSV (shared copy)
                </a>
                <a className="button small" href={`${exportBase}&mode=internal`} download title="Includes your notes">
                  Export with notes
                </a>
              </div>
            )}
          </div>
          {missingList ? (
            <EmptyState title="List not found">
              <p>That list isn&apos;t in your workspace.</p>
            </EmptyState>
          ) : items.length === 0 ? (
            <EmptyState title="Nothing here yet" icon="saved">
              <p>{t("saved.empty")}</p>
              <p style={{ marginTop: "var(--space-3)" }}>
                <Link className="button primary" href={`/opportunities/${moduleId}`}>
                  Search {mod(moduleId, "name").toLowerCase()}
                </Link>
              </p>
            </EmptyState>
          ) : (
            <ul className="op-results">
              {items.map((item) => (
                <ResultCard key={item.id} module={moduleId} def={def} row={{ item, match: (item.lastMatch as unknown as MatchResult) ?? null }} back={back} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
