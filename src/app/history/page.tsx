import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { actorName, eventName, fmtWhen, statusPhrase } from "@/components/plain";
import { Empty, one, PageHeader, type SearchParams } from "@/components/ui";
import { records, rules, targetAccounts } from "@/db/schema";
import { listHistory } from "@/services/history";
import { getSession, viewerFor } from "@/services/request";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; entityType?: string; event?: string }> = {
  all: { label: "Everything" },
  weekly: { label: "Weekly checks", entityType: "pipeline_run" },
  leads: { label: "Leads", entityType: "record" },
  companies: { label: "Companies", entityType: "target_account" },
  rules: { label: "Rule changes", entityType: "rule" },
  uploads: { label: "Uploads", entityType: "import" },
};

export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const session = await getSession();
  const ctx = session.ctx;
  const viewer = await viewerFor(session);
  const f = FILTERS[one(sp.show) ?? "all"] ? (one(sp.show) ?? "all") : "all";
  const rows = await listHistory(ctx, { entityType: FILTERS[f].entityType, limit: 300 });

  // Names to show instead of ids.
  const ids = (t: string) => [...new Set(rows.filter((h) => h.entityType === t && h.entityId).map((h) => h.entityId!))];
  const [recs, accts, rls] = await Promise.all([
    ids("record").length ? ctx.db.select({ id: records.id, a: records.account, o: records.opportunity }).from(records).where(and(eq(records.workspaceId, ctx.workspaceId), inArray(records.id, ids("record")))) : [],
    ids("target_account").length ? ctx.db.select({ id: targetAccounts.id, n: targetAccounts.name }).from(targetAccounts).where(and(eq(targetAccounts.workspaceId, ctx.workspaceId), inArray(targetAccounts.id, ids("target_account")))) : [],
    ids("rule").length ? ctx.db.select({ id: rules.id, l: rules.label }).from(rules).where(and(eq(rules.workspaceId, ctx.workspaceId), inArray(rules.id, ids("rule")))) : [],
  ]);
  const name = new Map<string, { text: string; href: string }>();
  recs.forEach((r) => name.set(r.id, { text: `${r.a} — ${r.o}`, href: `/records/${r.id}` }));
  accts.forEach((a) => name.set(a.id, { text: a.n, href: `/accounts/${a.id}` }));
  rls.forEach((r) => name.set(r.id, { text: `Rule: ${r.l}`, href: `/settings/rules/${r.id}` }));

  return (
    <>
      <PageHeader
        title="Activity"
        intro="Everything that has happened, newest first: every decision, move, upload and weekly check. Nothing here can be changed or deleted."
      />
      <nav className="tabs">
        {Object.entries(FILTERS).map(([k, v]) => (
          <Link key={k} href={`/history?show=${k}`} className={f === k ? "on" : ""}>
            {v.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty title="Nothing here yet." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>What happened</th>
                <th>About</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const about = h.entityId ? name.get(h.entityId) : undefined;
                const moved = h.newStatus && h.priorStatus !== h.newStatus && h.entityType === "record";
                return (
                  <tr key={h.id}>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>
                      {fmtWhen(h.occurredAt)}
                    </td>
                    <td className="wrap">
                      <strong>{eventName(h.event)}</strong>
                      {moved && <> → {statusPhrase(h.newStatus)}</>}
                      {h.reason && <div className="muted small">{h.reason.slice(0, 300)}</div>}
                    </td>
                    <td className="small">{about ? <Link href={about.href}>{about.text}</Link> : <span className="muted">—</span>}</td>
                    <td className="small">{actorName(h.actor, viewer)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginTop: ".8rem" }}>
        Showing the latest 300 entries.
      </p>
    </>
  );
}
