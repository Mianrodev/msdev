import Link from "next/link";
import { Ext, Flash, one, StatusBadge, type SearchParams } from "@/components/ui";
import { listAccounts } from "@/services/accounts";
import { getCtx } from "@/services/request";
import { TARGET_ACCOUNT_STATUSES } from "@/core/types";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = one(sp.status) || undefined;
  const list = one(sp.list) || undefined;
  const q = one(sp.q) || undefined;
  const rows = (await listAccounts(await getCtx(), { status, q })).filter((a) => !list || a.attributes.list === list);
  return (
    <>
      <Flash sp={sp} />
      <div className="spread">
        <h1>Target accounts</h1>
        <div className="row">
          <a className="button" href="/export/accounts?mode=shared">
            Export CSV (shared)
          </a>
          <Link className="button primary" href="/accounts/new">
            New target account
          </Link>
        </div>
      </div>
      <p className="muted small">Accounts worth tracking for outreach even without a specific open opportunity.</p>
      <form className="inline" method="get" style={{ marginBottom: ".75rem" }}>
        <label>
          Search
          <input name="q" defaultValue={q} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Any</option>
            {TARGET_ACCOUNT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          List
          <select name="list" defaultValue={list ?? ""}>
            <option value="">Any</option>
            <option value="outreach">outreach</option>
            <option value="watchlist">watchlist</option>
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Fit</th>
              <th>List</th>
              <th>Status</th>
              <th>What they do</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/accounts/${a.id}`}>{a.name}</Link>
                </td>
                <td className="small">{a.fit ?? "—"}</td>
                <td className="small">{String(a.attributes.list ?? "—")}</td>
                <td>
                  <StatusBadge status={a.status} />
                </td>
                <td className="small wrap">{a.description?.slice(0, 160) ?? "—"}</td>
                <td className="small">
                  <Ext href={a.website ?? a.sourceUrl} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
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
