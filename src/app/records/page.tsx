import Link from "next/link";
import { fmtDay, LIST_TO_VIEW, LISTS, OUTREACH_NAMES, TIER_NAMES, type ListKey } from "@/components/plain";
import { Empty, Ext, Flash, one, PageHeader, StatusBadge, type SearchParams } from "@/components/ui";
import type { RecordRow } from "@/db/schema";
import { countsByView, listRecords, type SortKey } from "@/services/records";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

const PAGE = 300;
const LIST_ORDER: ListKey[] = ["ready", "checking", "hold", "archive", "all"];
const VIEW_TO_LIST: Record<string, ListKey> = { prospects: "ready", leads: "checking", hold: "hold", archive: "archive", all: "all" };

const SORTS: Record<string, { label: string; key: SortKey; dir: "asc" | "desc" }> = {
  recent: { label: "Recently changed", key: "updated", dir: "desc" },
  company: { label: "Company A–Z", key: "account", dir: "asc" },
  found: { label: "Newest found", key: "found", dir: "desc" },
  fit: { label: "Best fit first", key: "tier", dir: "asc" },
};

type Col = { head: string; cell: (r: RecordRow) => React.ReactNode; className?: string };

const COLS: Record<ListKey, Col[]> = {
  ready: [
    { head: "Fit", cell: (r) => (r.fitTier ? TIER_NAMES[r.fitTier] : "—") },
    { head: "Effort to apply", cell: (r) => (typeof r.attributes.effortToApply === "string" ? r.attributes.effortToApply : "—") },
    { head: "Application", cell: (r) => OUTREACH_NAMES[r.outreachStatus] },
    { head: "Link", cell: (r) => <Ext href={r.nextStepUrl ?? r.sourceUrl} label="Open" /> },
  ],
  checking: [
    { head: "Where it is", cell: (r) => <StatusBadge r={r} /> },
    { head: "Found", cell: (r) => fmtDay(r.dateFound) },
  ],
  hold: [
    { head: "Why it's on hold", cell: (r) => r.holdReason ?? "—", className: "why" },
    { head: "What's needed", cell: (r) => r.nextAction ?? "—", className: "why" },
  ],
  archive: [
    { head: "Why it was archived", cell: (r) => r.archiveReason ?? "—", className: "why" },
    { head: "Archived", cell: (r) => fmtDay(r.archivedAt) },
  ],
  all: [
    { head: "Where it is", cell: (r) => <StatusBadge r={r} /> },
    { head: "Found", cell: (r) => fmtDay(r.dateFound) },
  ],
};

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const requested = one(sp.list) ?? VIEW_TO_LIST[one(sp.view) ?? ""] ?? "ready";
  const list: ListKey = (LIST_ORDER as string[]).includes(requested) ? (requested as ListKey) : "ready";
  const q = one(sp.q)?.trim() || undefined;
  const sortName = one(sp.sort) && SORTS[one(sp.sort)!] ? one(sp.sort)! : list === "ready" ? "fit" : "recent";
  const sort = SORTS[sortName];
  const limit = Math.min(Number(one(sp.limit)) || PAGE, 5000);

  const [rows, counts] = await Promise.all([
    listRecords(ctx, { view: LIST_TO_VIEW[list], q, sort: sort.key, dir: sort.dir, limit: limit + 1 }),
    countsByView(ctx),
  ]);
  const shown = rows.slice(0, limit);
  const countOf: Record<ListKey, number> = {
    ready: counts.prospects,
    checking: counts.leads,
    hold: counts.hold,
    archive: counts.archive,
    all: counts.all,
  };
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { list, q, sort: sortName, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/records?${p}`;
  };

  return (
    <>
      <Flash sp={sp} />
      <PageHeader title="Leads" intro="Every lead is on one of four lists. Click a list, then click a lead to open it.">
        <Link className="button primary" href="/records/new">
          + Add a lead
        </Link>
      </PageHeader>

      <nav className="tabs" aria-label="Lists">
        {LIST_ORDER.map((l) => (
          <Link key={l} href={`/records?list=${l}`} className={l === list ? "on" : ""} aria-current={l === list ? "page" : undefined}>
            {LISTS[l].title} ({countOf[l]})
          </Link>
        ))}
      </nav>
      <p className="muted" style={{ marginTop: 0 }}>
        {LISTS[list].help}
      </p>

      <form className="inline" method="get" action="/records" style={{ margin: ".6rem 0 .9rem" }}>
        <input type="hidden" name="list" value={list} />
        <label style={{ flex: "1 1 260px" }}>
          Search
          <input name="q" defaultValue={q} placeholder="Company, opportunity, location or notes" />
        </label>
        <label>
          Order
          <select name="sort" defaultValue={sortName}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Show</button>
        {q && (
          <Link href={href({ q: undefined })} className="small">
            Clear search
          </Link>
        )}
      </form>

      {shown.length === 0 ? (
        <Empty title={q ? `Nothing on this list matches "${q}".` : `Nothing on the ${LISTS[list].title} list right now.`}>
          {list === "ready" && !q && (
            <p className="muted">
              Leads land here after they pass every check. Run the <Link href="/#weekly">weekly check</Link> to move leads along.
            </p>
          )}
        </Empty>
      ) : (
        <>
          <p className="small muted">
            {rows.length > limit ? `Showing the first ${limit}.` : `${shown.length} ${shown.length === 1 ? "lead" : "leads"}.`}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Opportunity</th>
                  {COLS[list].map((c) => (
                    <th key={c.head}>{c.head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/records/${r.id}`}>
                        <strong>{r.account}</strong>
                      </Link>
                    </td>
                    <td className="wrap">
                      <Link href={`/records/${r.id}`}>{r.opportunity}</Link>
                      {r.location && <div className="muted small">{r.location}</div>}
                    </td>
                    {COLS[list].map((c) => (
                      <td key={c.head} className={c.className}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <p style={{ textAlign: "center" }}>
              <Link className="button" href={href({ limit: String(limit + PAGE) })}>
                Show more
              </Link>
            </p>
          )}
        </>
      )}

      <details className="card" style={{ marginTop: "1.5rem" }}>
        <summary>Download this list</summary>
        <div className="grid cols-2">
          <div>
            <a className="button primary" href={`/export/records?mode=shared&view=${LIST_TO_VIEW[list]}`}>
              Download shared copy
            </a>
            <p className="small muted">
              Safe to send to someone. Personal details, prepared briefs and answers, notes and contacts are removed.
            </p>
          </div>
          <div>
            <a className="button" href={`/export/records?mode=internal&view=${LIST_TO_VIEW[list]}`}>
              Download full backup
            </a>
            <p className="small muted">Everything, for your own safekeeping. Don&apos;t send this one to anyone.</p>
          </div>
        </div>
        <p className="small muted">Files open in Excel or Google Sheets.</p>
      </details>
    </>
  );
}
