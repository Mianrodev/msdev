import Link from "next/link";
import { reconcileAction, runUpdateAction } from "./actions";
import { Flash, fmtDate, type SearchParams } from "@/components/ui";
import { countsByStage, countsByView, VIEWS, type View } from "@/services/records";
import { formatSummary, listRuns, type RunSummary } from "@/services/run-update";
import { listAccounts } from "@/services/accounts";
import { getCtx } from "@/services/request";
import { STAGE_LABELS, STAGES, STATUSES } from "@/core/types";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = (await getCtx());
  const views = await countsByView(ctx);
  const matrix = await countsByStage(ctx);
  const runs = await listRuns(ctx, 5);
  const accounts = await listAccounts(ctx);
  const cell = (stage: string, status: string) => matrix.find((m) => m.stage === stage && m.status === status)?.n ?? 0;

  return (
    <>
      <Flash sp={sp} />
      <div className="spread">
        <h1>Pipeline</h1>
        <div className="row">
          <form action={reconcileAction}>
            <button type="submit" title="Re-check prospects and held records against current rules only">
              Reconcile only
            </button>
          </form>
          <form action={runUpdateAction}>
            <button type="submit" className="primary" title="Reconcile, then run Screen → Triage → Verify on everything pending">
              Run update
            </button>
          </form>
        </div>
      </div>
      <p className="muted small">
        <strong>Run update</strong> re-checks existing prospects and held records against the current rules, then takes every
        pending record through Screen → Triage → Verify. It never deletes, contacts or submits anything. Unverified sources land
        in Hold.
      </p>

      <div className="grid cols-4">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={`/records?view=${v}`} className="card stat">
            <div className="muted small">{VIEWS[v]}</div>
            <div className="n">{views[v]}</div>
          </Link>
        ))}
        <Link href="/accounts" className="card stat">
          <div className="muted small">Target accounts</div>
          <div className="n">{accounts.length}</div>
        </Link>
      </div>

      <h2>By stage and status</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stage reached</th>
              {STATUSES.map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => (
              <tr key={stage}>
                <td>{STAGE_LABELS[stage]}</td>
                {STATUSES.map((status) => (
                  <td key={status}>
                    <Link href={`/records?stage=${stage}&status=${status}`}>{cell(stage, status)}</Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Recent runs</h2>
      {runs.length === 0 ? (
        <p className="muted">No runs yet.</p>
      ) : (
        <ul className="plain">
          {runs.map((r) => (
            <li key={r.id}>
              <span className="muted small">{fmtDate(r.finishedAt)}</span> — {formatSummary(r.summary as unknown as RunSummary)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
