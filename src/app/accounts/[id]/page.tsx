import Link from "next/link";
import { notFound } from "next/navigation";
import { accountStatusAction, updateAccountAction } from "../../actions";
import { AccountFields } from "@/components/account-fields";
import { Flash, fmtDate, StatusBadge, type SearchParams } from "@/components/ui";
import { getAccount } from "@/services/accounts";
import { listHistory } from "@/services/history";
import { NotFoundError } from "@/services/records";
import { getCtx } from "@/services/request";
import { TARGET_ACCOUNT_STATUSES } from "@/core/types";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = getCtx();
  let a;
  try {
    a = getAccount(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const hist = listHistory(ctx, { entityType: "target_account", entityId: id });
  const attrs = Object.entries(a.attributes).filter(([k]) => k !== "section");
  return (
    <>
      <Flash sp={sp} />
      <p className="small">
        <Link href="/accounts">← Target accounts</Link>
      </p>
      <div className="row">
        <h1 style={{ margin: 0 }}>{a.name}</h1>
        <StatusBadge status={a.status} />
      </div>
      {a.status === "archived" && <p className="note">Archived: {a.archiveReason}</p>}
      {attrs.length > 0 && (
        <dl className="kv small" style={{ margin: ".75rem 0" }}>
          {attrs.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <form action={accountStatusAction.bind(null, id)} className="inline card" style={{ marginBottom: "1rem" }}>
        <label>
          Status
          <select name="status" defaultValue={a.status}>
            {TARGET_ACCOUNT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Reason
          <input name="reason" required />
        </label>
        <button type="submit">Change status</button>
      </form>
      <form action={updateAccountAction.bind(null, id)} className="card stack">
        <AccountFields a={a} />
        <label>
          Change note (optional)
          <input name="reason" />
        </label>
        <div>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
      <h2>History</h2>
      <ul className="plain small">
        {hist.map((h) => (
          <li key={h.id}>
            <span className="muted">{fmtDate(h.occurredAt)}</span> {h.event} — {h.reason} <span className="muted">({h.actor})</span>
          </li>
        ))}
      </ul>
    </>
  );
}
