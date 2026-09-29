import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveAction,
  decideAction,
  fitTierAction,
  holdAction,
  outreachAction,
  restoreAction,
  sourceVerificationAction,
  updateRecordAction,
} from "../../actions";
import { AttributeFields, RecordFields } from "@/components/record-fields";
import { Ext, Flash, fmtDate, Outcome, StageLabel, StatusBadge, Verdict, type SearchParams } from "@/components/ui";
import { listHistory } from "@/services/history";
import { evaluateRecord, getRecord, NotFoundError, pendingDecision } from "@/services/records";
import { getCtx } from "@/services/request";
import {
  FIT_TIERS,
  HUMAN_ONLY_OUTREACH,
  OUTREACH_STATUSES,
  SOURCE_VERIFICATION,
  VERDICT_LABELS,
  VERDICTS,
} from "@/core/types";

export const dynamic = "force-dynamic";

export default async function RecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = getCtx();
  let r;
  try {
    r = getRecord(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const pending = pendingDecision(ctx, r);
  const overall = evaluateRecord(ctx, r, "all");
  const hist = listHistory(ctx, { entityType: "record", entityId: id, limit: 200 });
  const bind = <T,>(fn: (id: string, f: FormData) => Promise<T>) => fn.bind(null, id);

  return (
    <>
      <Flash sp={sp} />
      <p className="small">
        <Link href="/records">← Records</Link>
      </p>
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: ".2rem" }}>{r.opportunity}</h1>
          <div className="row">
            <strong>{r.account}</strong>
            <span className="muted">·</span>
            <StageLabel stage={r.stage} />
            <StatusBadge status={r.status} />
            {r.fitTier && <span className="badge">tier: {r.fitTier}</span>}
            <span className="badge">source: {r.sourceVerification}</span>
            <span className="badge">outreach: {r.outreachStatus.replace(/_/g, " ")}</span>
          </div>
        </div>
        <div className="small muted">
          Source: <Ext href={r.sourceUrl} />
          <br />
          Next step: <Ext href={r.nextStepUrl} />
        </div>
      </div>
      {r.status === "hold" && <p className="note">On hold: {r.holdReason}{r.nextAction ? ` — next: ${r.nextAction}` : ""}</p>}
      {r.status === "archived" && <p className="note">Archived: {r.archiveReason}</p>}

      <div className="grid cols-2" style={{ marginTop: "1rem" }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Pipeline</h2>
          <dl className="kv small">
            <dt>1. Discovery</dt>
            <dd>
              {r.discoveryVerdict ?? "—"}
              {r.discoveryReason ? <span className="muted"> — {r.discoveryReason}</span> : null}
            </dd>
            <dt>2. Screen</dt>
            <dd>
              <Verdict v={r.screenVerdict} />
              {r.screenReason ? <span className="muted"> — {r.screenReason}</span> : null}
            </dd>
            <dt>2.5 Triage</dt>
            <dd>
              <Verdict v={r.triageVerdict} />
              {r.triageReason ? <span className="muted"> — {r.triageReason}</span> : null}
            </dd>
            <dt>3. Verify</dt>
            <dd>
              <Verdict v={r.verifyVerdict} />
              {r.verifyReason ? <span className="muted"> — {r.verifyReason}</span> : null}
            </dd>
          </dl>

          {pending ? (
            <>
              <h3>Decide: {pending.stage}</h3>
              <ul className="plain small">
                {pending.evaluation.results.map((x) => (
                  <Outcome key={x.key} r={x} />
                ))}
                {pending.evaluation.results.length === 0 && <li className="muted">No evaluable criteria apply at this stage.</li>}
              </ul>
              <form action={bind(decideAction)} className="stack" style={{ marginTop: ".5rem" }}>
                <input type="hidden" name="stage" value={pending.stage} />
                <div className="fields">
                  <label>
                    Verdict (suggested: {VERDICT_LABELS[pending.suggested ?? ""] ?? "—"})
                    <select name="verdict" defaultValue={pending.suggested}>
                      {VERDICTS[pending.stage].map((v) => (
                        <option key={v} value={v}>
                          {VERDICT_LABELS[v]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Confidence (0–100, optional)
                    <input name="confidence" type="number" min={0} max={100} />
                  </label>
                  <label className="full">
                    Reason (required)
                    <textarea name="reason" rows={2} required />
                  </label>
                </div>
                <div>
                  <button type="submit" className="primary">
                    Record decision
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h3>Current criteria check</h3>
              <ul className="plain small">
                {overall.results.map((x) => (
                  <Outcome key={x.key} r={x} />
                ))}
                {overall.results.length === 0 && <li className="muted">No evaluable criteria.</li>}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Status</h2>
          {r.status !== "active" ? (
            <form action={bind(restoreAction)} className="inline">
              <label style={{ flex: 1 }}>
                Reason to restore
                <input name="reason" required />
              </label>
              <button type="submit">Restore to active</button>
            </form>
          ) : null}
          {r.status !== "hold" && (
            <form action={bind(holdAction)} className="inline" style={{ marginTop: ".5rem" }}>
              <label style={{ flex: 1 }}>
                Hold reason
                <input name="reason" required />
              </label>
              <label style={{ flex: 1 }}>
                Next action needed
                <input name="nextAction" />
              </label>
              <button type="submit">Move to Hold</button>
            </form>
          )}
          {r.status !== "archived" && (
            <form action={bind(archiveAction)} className="inline" style={{ marginTop: ".5rem" }}>
              <label style={{ flex: 1 }}>
                Archive reason
                <input name="reason" required />
              </label>
              <button type="submit" className="danger">
                Archive
              </button>
            </form>
          )}
          <p className="muted small">Records are never deleted. Archive keeps everything and can be restored.</p>

          <h3>Source verification</h3>
          <form action={bind(sourceVerificationAction)} className="inline">
            <select name="value" defaultValue={r.sourceVerification}>
              {SOURCE_VERIFICATION.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <label style={{ flex: 1 }}>
              How verified
              <input name="reason" placeholder="e.g. listing loads, title matches" />
            </label>
            <button type="submit">Save</button>
          </form>

          {r.stage === "verify" && (
            <>
              <h3>Fit tier</h3>
              <form action={bind(fitTierAction)} className="inline">
                <select name="tier" defaultValue={r.fitTier ?? ""}>
                  <option value="">none</option>
                  {FIT_TIERS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <label style={{ flex: 1 }}>
                  Reason
                  <input name="reason" required />
                </label>
                <button type="submit">Save</button>
              </form>
            </>
          )}

          <h3>Outreach hand-off</h3>
          <p className="muted small">
            This app never sends or submits anything. Mark a package ready here; after <em>you</em> approve and send it yourself,
            record that below.
          </p>
          <form action={bind(outreachAction)} className="stack">
            <div className="fields">
              <label>
                Status
                <select name="status" defaultValue={r.outreachStatus}>
                  {OUTREACH_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                      {HUMAN_ONLY_OUTREACH.includes(s) ? " (you did this)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Note
                <input name="reason" />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" name="confirm" /> I approved / sent / received this myself, outside the app
            </label>
            <div>
              <button type="submit">Update outreach</button>
            </div>
          </form>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Details</h2>
        <form action={bind(updateRecordAction)} className="stack">
          <RecordFields r={r} />
          <h3>Criteria attributes</h3>
          <p className="muted small">Values the rules evaluate (field names in Rules &amp; settings). Use UNKNOWN when not known.</p>
          <AttributeFields attributes={r.attributes} />
          <label>
            Change note (optional)
            <input name="reason" />
          </label>
          <div>
            <button type="submit" className="primary">
              Save details
            </button>
          </div>
        </form>
        {Object.keys(r.extra).length > 0 && (
          <details style={{ marginTop: "1rem" }}>
            <summary>Unmapped imported columns</summary>
            <pre className="mono">{JSON.stringify(r.extra, null, 2)}</pre>
          </details>
        )}
        <p className="muted small">
          Created {fmtDate(r.createdAt)} ({r.origin}) · updated {fmtDate(r.updatedAt)} · last reconciled {fmtDate(r.lastReconciledAt)}
        </p>
      </section>

      <h2>History</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>From → to</th>
              <th>Reason</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {hist.map((h) => (
              <tr key={h.id}>
                <td className="small">{fmtDate(h.occurredAt)}</td>
                <td className="small">{h.event}</td>
                <td className="small">
                  {h.priorStatus ?? "—"} → {h.newStatus ?? "—"}
                </td>
                <td className="small wrap">{h.reason}</td>
                <td className="small muted">{h.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
