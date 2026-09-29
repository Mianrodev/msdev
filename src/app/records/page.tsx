import Link from "next/link";
import { Flash, fmtDate, one, StageLabel, StatusBadge, Verdict, type SearchParams } from "@/components/ui";
import { listRecords, SORT_KEYS, VIEWS, type SortKey, type View } from "@/services/records";
import { getCtx } from "@/services/request";
import { FIT_TIERS, STAGE_LABELS, STAGES, STATUSES } from "@/core/types";

export const dynamic = "force-dynamic";

const LIMIT = 500;

export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = (one(sp.view) ?? "all") as View;
  const f = {
    view: view in VIEWS ? view : ("all" as View),
    stage: one(sp.stage) || undefined,
    status: one(sp.status) || undefined,
    tier: one(sp.tier) || undefined,
    q: one(sp.q) || undefined,
    sort: (SORT_KEYS.includes(one(sp.sort) as SortKey) ? one(sp.sort) : "updated") as SortKey,
    dir: (one(sp.dir) === "asc" ? "asc" : one(sp.dir) === "desc" ? "desc" : undefined) as "asc" | "desc" | undefined,
  };
  const rows = await listRecords((await getCtx()), { ...f, limit: LIMIT + 1 });
  const shown = rows.slice(0, LIMIT);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: f.view, stage: f.stage, status: f.status, tier: f.tier, q: f.q, sort: f.sort, dir: f.dir, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/records?${p}`;
  };
  const sortLink = (key: SortKey, label: string) => {
    const active = f.sort === key;
    const nextDir = active && f.dir !== "desc" && (f.dir === "asc" || !["updated", "created"].includes(key)) ? "desc" : "asc";
    return (
      <Link href={qs({ sort: key, dir: nextDir })}>
        {label}
        {active ? (nextDir === "asc" ? " ↓" : " ↑") : ""}
      </Link>
    );
  };

  return (
    <>
      <Flash sp={sp} />
      <div className="spread">
        <h1>{VIEWS[f.view]}</h1>
        <div className="row">
          <a className="button" href={`/export/records?mode=shared&view=${f.view}`} title="Restricted fields dropped; identity terms, emails and phones redacted">
            Export CSV (shared)
          </a>
          <a className="button" href={`/export/records?mode=internal&view=${f.view}`} title="Everything — for your own backups only">
            Export CSV (internal)
          </a>
          <Link className="button primary" href="/records/new">
            New lead
          </Link>
        </div>
      </div>

      <div className="tabs">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={`/records?view=${v}`} className={v === f.view ? "on" : ""}>
            {VIEWS[v]}
          </Link>
        ))}
      </div>

      <form className="inline" method="get" action="/records" style={{ marginBottom: ".75rem" }}>
        <input type="hidden" name="view" value={f.view} />
        <label>
          Search
          <input name="q" defaultValue={f.q} placeholder="account, opportunity, location, notes" />
        </label>
        <label>
          Stage reached
          <select name="stage" defaultValue={f.stage ?? ""}>
            <option value="">Any</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={f.status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Tier
          <select name="tier" defaultValue={f.tier ?? ""}>
            <option value="">Any</option>
            {FIT_TIERS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="sort" value={f.sort} />
        {f.dir && <input type="hidden" name="dir" value={f.dir} />}
        <button type="submit">Filter</button>
        <Link href={`/records?view=${f.view}`} className="small">
          Clear
        </Link>
      </form>

      <p className="muted small">
        {rows.length > LIMIT ? `Showing first ${LIMIT} — narrow the filter to see more.` : `${shown.length} records`}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{sortLink("account", "Account")}</th>
              <th>{sortLink("opportunity", "Opportunity")}</th>
              <th>{sortLink("stage", "Stage")}</th>
              <th>{sortLink("status", "Status")}</th>
              <th>{sortLink("tier", "Tier")}</th>
              <th>Latest verdict</th>
              <th>Source</th>
              <th>{sortLink("found", "Found")}</th>
              <th>{sortLink("updated", "Updated")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="clip">
                  <Link href={`/records/${r.id}`}>{r.account}</Link>
                </td>
                <td className="wrap">
                  <Link href={`/records/${r.id}`}>{r.opportunity}</Link>
                </td>
                <td>
                  <StageLabel stage={r.stage} />
                </td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>{r.fitTier ?? <span className="muted">—</span>}</td>
                <td className="small">
                  <Verdict v={r.verifyVerdict ?? r.triageVerdict ?? r.screenVerdict} />
                </td>
                <td className="small">{r.sourceBoard ?? <span className="muted">—</span>}</td>
                <td className="small">{r.dateFound ?? "—"}</td>
                <td className="small muted">{fmtDate(r.updatedAt)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
