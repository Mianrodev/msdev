import { notFound } from "next/navigation";
import { accountStatusAction, updateAccountAction } from "../../actions";
import { AccountFields } from "@/components/account-fields";
import { CopyButton, SubmitButton } from "@/components/client";
import { actorName, eventName, fmtWhen, humanize } from "@/components/plain";
import { BackLink, Ext, Flash, type SearchParams } from "@/components/ui";
import { getAccount } from "@/services/accounts";
import { listHistory } from "@/services/history";
import { NotFoundError } from "@/services/records";
import { getSession, viewerFor } from "@/services/request";

export const dynamic = "force-dynamic";

const STATUS_NAMES: Record<string, string> = { tracking: "Active", hold: "On hold", archived: "Archived" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const ctx = session.ctx;
  const viewer = await viewerFor(session);
  let a;
  try {
    a = await getAccount(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const hist = await listHistory(ctx, { entityType: "target_account", entityId: id });
  const extras = Object.entries(a.attributes).filter(([k]) => k !== "section" && k !== "list");
  const facts: [string, string | null][] = [
    ["What they do", a.description],
    ["Evidence", a.evidence],
    ["Why they fit", a.fitRationale],
    ["Fit", a.fit],
    ...extras.map(([k, v]) => [humanize(k), String(v)] as [string, string]),
    ["Response notes", a.responseNotes],
    ["Notes", a.notes],
  ];
  const bind = <T,>(fn: (id: string, f: FormData) => Promise<T>) => fn.bind(null, id);
  return (
    <>
      <Flash sp={sp} />
      <BackLink href="/accounts">Back to Companies</BackLink>
      <div className="spread">
        <div>
          <h1>{a.name}</h1>
          <span className={`pill ${a.status === "archived" ? "archive" : a.status === "hold" ? "hold" : "ready"}`}>
            {STATUS_NAMES[a.status]}
          </span>
        </div>
        <Ext href={a.website ?? a.sourceUrl} label="Open website" />
      </div>
      {a.status === "archived" && a.archiveReason && (
        <p className="note" style={{ marginTop: "1rem" }}>
          Archived because: {a.archiveReason}
        </p>
      )}

      {(a.preparedBrief || a.preparedBriefLong) && (
        <section className="card" style={{ marginTop: "1rem" }}>
          <h2>Prepared message</h2>
          <p className="muted small">This app never sends anything. Copy it and send it yourself if you decide to.</p>
          {a.preparedBrief && (
            <>
              <div className="spread">
                <h3>Short version</h3>
                <CopyButton text={a.preparedBrief} />
              </div>
              <div className="package">{a.preparedBrief}</div>
            </>
          )}
          {a.preparedBriefLong && (
            <>
              <div className="spread">
                <h3>Long version</h3>
                <CopyButton text={a.preparedBriefLong} />
              </div>
              <div className="package">{a.preparedBriefLong}</div>
            </>
          )}
        </section>
      )}

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Details</h2>
        <dl className="kv">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          {(a.contactName || a.contactProfileUrl) && (
            <>
              <dt>Contact (private)</dt>
              <dd>
                {a.contactName} {a.contactProfileUrl && <Ext href={a.contactProfileUrl} label="profile" />}
              </dd>
            </>
          )}
        </dl>
        <details style={{ marginTop: "1rem" }}>
          <summary>Edit details</summary>
          <form action={bind(updateAccountAction)} className="stack">
            <AccountFields a={a} />
            <div>
              <SubmitButton pending="Saving…">Save changes</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>Change status (active, on hold, archived)</summary>
        <form action={bind(accountStatusAction)} className="inline">
          <label>
            Status
            <select name="status" defaultValue={a.status}>
              {Object.entries(STATUS_NAMES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: "1 1 240px" }}>
            Why? <span className="hint">(required)</span>
            <input name="reason" required />
          </label>
          <SubmitButton className="" pending="Saving…">
            Save status
          </SubmitButton>
        </form>
      </details>

      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>History ({hist.length})</summary>
        <ul className="plain small">
          {hist.map((h) => (
            <li key={h.id}>
              <strong>{eventName(h.event)}</strong>{" "}
              <span className="muted">
                · {fmtWhen(h.occurredAt)} · {actorName(h.actor, viewer)}
              </span>
              {h.reason && <div className="muted">{h.reason}</div>}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
