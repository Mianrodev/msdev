import Link from "next/link";
import { fmtDate, one, type SearchParams } from "@/components/ui";
import { listHistory } from "@/services/history";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

const TYPES = ["record", "target_account", "rule", "setting", "pipeline_run", "reconciliation", "import"];

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const entityType = one(sp.type) || undefined;
  const event = one(sp.event) || undefined;
  const rows = listHistory(getCtx(), { entityType, event, limit: 500 });
  const link = (type: string, id: string | null) =>
    !id ? null : type === "record" ? `/records/${id}` : type === "target_account" ? `/accounts/${id}` : type === "rule" ? `/settings/rules/${id}` : null;
  return (
    <>
      <h1>History</h1>
      <p className="muted small">Append-only audit log of every status change, decision, reconciliation, run, import and rule change. Latest 500 shown.</p>
      <form className="inline" method="get" style={{ marginBottom: ".75rem" }}>
        <label>
          Type
          <select name="type" defaultValue={entityType ?? ""}>
            <option value="">Any</option>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Event
          <input name="event" defaultValue={event} placeholder="e.g. reconcile, run_update, stage.verify" />
        </label>
        <button type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Event</th>
              <th>From → to</th>
              <th>Reason</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const href = link(h.entityType, h.entityId);
              return (
                <tr key={h.id}>
                  <td className="small">{fmtDate(h.occurredAt)}</td>
                  <td className="small">{href ? <Link href={href}>{h.entityType}</Link> : h.entityType}</td>
                  <td className="small">{h.event}</td>
                  <td className="small">
                    {h.priorStatus ?? "—"} → {h.newStatus ?? "—"}
                  </td>
                  <td className="small wrap">{h.reason}</td>
                  <td className="small muted">{h.actor}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
