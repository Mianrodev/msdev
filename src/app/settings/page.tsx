import Link from "next/link";
import { createRuleAction, toggleRuleAction } from "../actions";
import { SubmitButton } from "@/components/client";
import { ruleSentence, RuleFields, STEP_FROM } from "@/components/rule-form";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { listFieldNames } from "@/services/records";
import { getSession } from "@/services/request";
import { listRules } from "@/services/rules";

export const dynamic = "force-dynamic";

export default async function RulesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { ctx, user } = await getSession();
  const [rules, fieldNames] = await Promise.all([listRules(ctx), listFieldNames(ctx)]);
  const checks = rules.filter((r) => r.operator !== "note");
  const notes = rules.filter((r) => r.operator === "note");
  return (
    <>
      <Flash sp={sp} />
      <PageHeader title="Settings" intro="Everything you set up once. Your rules are further down this page." />
      <div className="tiles" style={{ marginBottom: "1.5rem" }}>
        <Link className="tile" href="/import">
          <div className="t">Upload spreadsheet</div>
          <div className="d">Bring in (or update from) your Excel tracker.</div>
        </Link>
        <Link className="tile" href="/about-me">
          <div className="t">About me</div>
          <div className="d">Your profile: roles you want, deal-breakers, pay, your voice. Your AI uses it.</div>
        </Link>
        <Link className="tile" href="/privacy">
          <div className="t">Privacy</div>
          <div className="d">Personal details that must never appear in anything you share.</div>
        </Link>
        <Link className="tile" href="/account">
          <div className="t">Password</div>
          <div className="d">Change your password and make a recovery code.</div>
        </Link>
        {user.role === "owner" && (
          <Link className="tile" href="/team">
            <div className="t">Team</div>
            <div className="d">Invite someone to run their own job search here, in their own private space.</div>
          </Link>
        )}
        <Link className="tile" href="/discover">
          <div className="t">What to look for</div>
          <div className="d">The job titles, places and companies the search uses.</div>
        </Link>
      </div>

      <h2 id="rules">Your rules</h2>
      <p className="muted">
        Each rule looks at one detail of a job (location, pay, who can apply…). A job that breaks a rule is archived, or put on
        hold if the rule says so. Change them any time — the next Find new leads applies them to every lead, including ones
        already Ready.
      </p>

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

      <p className="small muted" style={{ marginTop: "1.2rem" }}>
        Looking for the personal-details protection? It&apos;s on the <Link href="/privacy">Privacy</Link> page. Your password and
        recovery code are on the <Link href="/account">Password</Link> page.
      </p>
    </>
  );
}
