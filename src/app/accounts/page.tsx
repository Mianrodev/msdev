import Link from "next/link";
import { Empty, Ext, Flash, one, PageHeader, type SearchParams } from "@/components/ui";
import { listAccounts } from "@/services/accounts";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

const LIST_NAMES: Record<string, string> = { outreach: "Ready to approach", watchlist: "Watching" };
const STATUS_NAMES: Record<string, string> = { tracking: "Active", hold: "On hold", archived: "Archived" };

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const show = one(sp.show) ?? "active";
  const q = one(sp.q)?.trim() || undefined;
  const all = await listAccounts(ctx, { q });
  const rows = all.filter((a) => (show === "active" ? a.status !== "archived" : show === "archived" ? a.status === "archived" : true));
  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Companies"
        intro="Companies worth approaching even when they don't have a specific opening. Keep notes and a prepared message for each."
      >
        <Link className="button primary" href="/accounts/new">
          + Add a company
        </Link>
      </PageHeader>
      <nav className="tabs">
        {[
          ["active", "Active"],
          ["archived", "Archived"],
          ["all", "All"],
        ].map(([k, label]) => (
          <Link key={k} href={`/accounts?show=${k}`} className={show === k ? "on" : ""}>
            {label}
          </Link>
        ))}
      </nav>
      <form className="inline" method="get" style={{ margin: ".6rem 0 .9rem" }}>
        <input type="hidden" name="show" value={show} />
        <label style={{ flex: "1 1 260px" }}>
          Search
          <input name="q" defaultValue={q} placeholder="Company name or what they do" />
        </label>
        <button type="submit">Show</button>
      </form>
      {rows.length === 0 ? (
        <Empty title={q ? `No companies match "${q}".` : "No companies here yet."}>
          <p className="muted">
            <Link href="/accounts/new">Add a company</Link> or <Link href="/import">upload your spreadsheet</Link>.
          </p>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>List</th>
                <th>What they do</th>
                <th>Website</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/accounts/${a.id}`}>
                      <strong>{a.name}</strong>
                    </Link>
                    {a.status !== "tracking" && <div className="muted small">{STATUS_NAMES[a.status]}</div>}
                  </td>
                  <td className="small">{LIST_NAMES[String(a.attributes.list)] ?? "—"}</td>
                  <td className="why">{a.description ? a.description.slice(0, 180) + (a.description.length > 180 ? "…" : "") : "—"}</td>
                  <td className="small">
                    <Ext href={a.website ?? a.sourceUrl} label="Open" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginTop: "1rem" }}>
        Need a copy to share? <a href="/export/accounts?mode=shared">Download shared copy</a> (contacts and prepared messages
        removed).
      </p>
    </>
  );
}
