import Link from "next/link";
import { createRuleAction, toggleRuleAction } from "../actions";
import { changePasswordAction } from "../login/actions";
import { SubmitButton } from "@/components/client";
import { ruleSentence, RuleFields, STEP_FROM } from "@/components/rule-form";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { MIN_PASSWORD_LENGTH, passwordManagedByHost } from "@/lib/auth";
import { listFieldNames } from "@/services/records";
import { getCtx } from "@/services/request";
import { listRules } from "@/services/rules";

export const dynamic = "force-dynamic";

export default async function RulesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const [rules, fieldNames] = await Promise.all([listRules(ctx), listFieldNames(ctx)]);
  const checks = rules.filter((r) => r.operator !== "note");
  const notes = rules.filter((r) => r.operator === "note");
  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Rules"
        intro="The automatic checks the weekly check uses to sort your leads. Change them any time — the next weekly check applies the new rules to every lead, including ones already Ready."
      />

      <h2>Automatic checks ({checks.filter((c) => c.enabled).length} switched on)</h2>
      <div className="help" style={{ marginBottom: ".8rem" }}>
        <strong>How checks work:</strong> a lead that fails a check is archived (or put on hold, if the check says so). A lead
        whose detail is <em>unknown</em> is never failed for it.
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>When</th>
              <th>On / off</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((r) => (
              <tr key={r.id}>
                <td className="wrap">
                  <Link href={`/settings/rules/${r.id}`}>
                    <strong>{r.label}</strong>
                  </Link>
                  <div className="small">{ruleSentence(r)}</div>
                </td>
                <td className="small">{STEP_FROM[r.appliesFrom]}</td>
                <td>
                  <form action={toggleRuleAction.bind(null, r.id, !r.enabled)}>
                    <SubmitButton className={r.enabled ? "small" : "small"} pending="…">
                      {r.enabled ? "✓ On — switch off" : "Off — switch on"}
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {checks.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No automatic checks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>+ Add a new check</summary>
        <form action={createRuleAction} className="stack">
          <RuleFields fieldNames={fieldNames} />
          <div>
            <SubmitButton pending="Saving…">Add check</SubmitButton>
          </div>
        </form>
      </details>

      <h2>Your process notes ({notes.length})</h2>
      <p className="muted">
        The written rules from your old spreadsheet (and a few built in). They describe how you work; the ones the app enforces
        say so.
      </p>
      <details className="card">
        <summary>Show all notes</summary>
        <ul className="plain">
          {notes.map((r) => (
            <li key={r.id}>
              <Link href={`/settings/rules/${r.id}`}>
                <strong>{r.label}</strong>
              </Link>
              <div className="muted small" style={{ whiteSpace: "pre-wrap" }}>
                {r.description}
              </div>
            </li>
          ))}
        </ul>
      </details>

      <h2>Your password</h2>
      {passwordManagedByHost() ? (
        <p className="muted">Your password is set in the hosting settings.</p>
      ) : (
        <details className="card">
          <summary>Change password</summary>
          <form action={changePasswordAction} className="stack" style={{ maxWidth: 440 }}>
            <label>
              Current password
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label>
              New password <span className="hint">(at least {MIN_PASSWORD_LENGTH} characters)</span>
              <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <label>
              Type the new password again
              <input type="password" name="confirm" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <div>
              <SubmitButton pending="Saving…">Change password</SubmitButton>
            </div>
          </form>
        </details>
      )}
      <p className="small muted" style={{ marginTop: "1.2rem" }}>
        Looking for the personal-details protection? It&apos;s on the <Link href="/privacy">Privacy</Link> page.
      </p>
    </>
  );
}
