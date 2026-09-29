import Link from "next/link";
import { createRuleAction, identityTermsAction, toggleRuleAction } from "../actions";
import { changePasswordAction } from "../login/actions";
import { MIN_PASSWORD_LENGTH, passwordManagedByHost } from "@/lib/auth";
import { RuleFields } from "@/components/rule-form";
import { Flash, type SearchParams } from "@/components/ui";
import { getIdentityTerms, listRules } from "@/services/rules";
import { getCtx } from "@/services/request";
import { OPERATOR_LABELS } from "@/core/rules";
import type { RuleRow } from "@/db/schema";

export const dynamic = "force-dynamic";

function RuleTable({ rules, evaluable }: { rules: RuleRow[]; evaluable: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rule</th>
            <th>From</th>
            {evaluable && <th>Criterion</th>}
            {evaluable && <th>On violation</th>}
            <th>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td className="wrap">
                <Link href={`/settings/rules/${r.id}`}>{r.label}</Link>
                <div className="muted small">{evaluable ? r.description : r.description.slice(0, 220) + (r.description.length > 220 ? "…" : "")}</div>
                <div className="mono muted">{r.key}</div>
              </td>
              <td className="small">{r.appliesFrom}</td>
              {evaluable && (
                <td className="small">
                  <span className="mono">{r.field}</span> {OPERATOR_LABELS[r.operator]}{" "}
                  <strong>{Array.isArray(r.value) ? (r.value as string[]).join(", ") : String(r.value)}</strong>
                </td>
              )}
              {evaluable && <td className="small">{r.effect === "hold" ? "Hold" : "Archive"}</td>}
              <td>
                <form action={toggleRuleAction.bind(null, r.id, !r.enabled)}>
                  <button type="submit" className="small">
                    {r.enabled ? "On — disable" : "Off — enable"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = (await getCtx());
  const rules = await listRules(ctx);
  const criteria = rules.filter((r) => r.operator !== "note");
  const notes = rules.filter((r) => r.operator === "note");
  const terms = await getIdentityTerms(ctx);
  return (
    <>
      <Flash sp={sp} />
      <h1>Rules &amp; settings</h1>
      <p className="muted">
        The criteria each stage applies. Rules are data: edit them here, and the next <strong>Run update</strong> (or
        reconciliation) applies the change to every record — including existing prospects. Rules are never deleted, only
        disabled, so past verdicts stay explainable.
      </p>

      <h2>Evaluable criteria ({criteria.length})</h2>
      <p className="muted small">
        An UNKNOWN value never fails a criterion. &quot;Reject&quot; violations send a record to Archive; &quot;Hold&quot;
        violations park it in Hold for a human.
      </p>
      <RuleTable rules={criteria} evaluable />

      <details style={{ marginTop: "1rem" }}>
        <summary>Add a criterion</summary>
        <form action={createRuleAction} className="card stack" style={{ marginTop: ".5rem" }}>
          <RuleFields />
          <div>
            <button type="submit" className="primary">
              Add rule
            </button>
          </div>
        </form>
      </details>

      <h2>Process rules &amp; notes ({notes.length})</h2>
      <p className="muted small">Standing rules, stage definitions and exclusions imported from the workbook&apos;s CONFIG sheet. Humans apply these when deciding; the code-enforced ones say so.</p>
      <RuleTable rules={notes} evaluable={false} />

      <h2>Redaction: identity terms</h2>
      <p className="muted small">
        Terms that must never appear in shared exports (owner name, personal email/phone, profile URL, home city, current
        employer). Stored only in the local database. {terms.length} term(s) configured. You can also load them from a local
        file — see README.
      </p>
      <details>
        <summary>Edit identity terms</summary>
        <form action={identityTermsAction} className="stack" style={{ marginTop: ".5rem" }}>
          <textarea name="terms" rows={6} defaultValue={terms.join("\n")} placeholder="One per line" />
          <div>
            <button type="submit">Save terms</button>
          </div>
        </form>
      </details>

      <h2>Your password</h2>
      {passwordManagedByHost() ? (
        <p className="muted small">Your password is set in the hosting settings (APP_PASSWORD).</p>
      ) : (
        <details>
          <summary>Change password</summary>
          <form action={changePasswordAction} className="stack" style={{ marginTop: ".5rem", maxWidth: 420 }}>
            <label>
              Current password
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label>
              New password (at least {MIN_PASSWORD_LENGTH} characters)
              <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <label>
              Type it again
              <input type="password" name="confirm" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <div>
              <button type="submit">Change password</button>
            </div>
          </form>
        </details>
      )}
    </>
  );
}
