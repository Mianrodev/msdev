import Link from "next/link";
import { addBoardAction, discoveryWordsAction, findLeadsAction, toggleBoardAction } from "../actions";
import { SubmitButton } from "@/components/client";
import { describeSearch, fmtWhen } from "@/components/plain";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { getDiscoverySettings, lastDiscovery, listBoards } from "@/services/discovery";
import { getCtx } from "@/services/request";
import { PROVIDER_NAMES } from "@/sources/job-boards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function Words({ name, label, hint, words }: { name: string; label: string; hint: string; words: string[] }) {
  return (
    <label>
      {label} <span className="hint">{hint}</span>
      <textarea name={name} rows={8} defaultValue={words.join("\n")} />
    </label>
  );
}

export default async function FindLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const [settings, boards, last] = await Promise.all([getDiscoverySettings(ctx), listBoards(ctx), lastDiscovery(ctx)]);
  const failed = new Map((last?.boardsFailed ?? []).map((f) => [f.company, f.error]));
  const on = boards.filter((b) => b.enabled).length;

  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Find leads"
        intro="The app reads the public job boards of the companies you're tracking and adds new jobs that match your words and rules. It runs by itself every Monday; you can also run it now. It only reads job listings — it never applies or contacts anyone."
      >
        <form action={findLeadsAction}>
          <input type="hidden" name="back" value="/discover" />
          <SubmitButton className="primary big" pending="Searching job boards… (up to a minute)">
            Search now
          </SubmitButton>
        </form>
      </PageHeader>

      {last && (
        <div className="help" style={{ marginBottom: "1rem" }}>
          <strong>Last search — {fmtWhen(last.finishedAt)}</strong>
          <ul style={{ margin: ".3rem 0 0", paddingLeft: "1.2rem" }}>
            {describeSearch(last).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {last.newLeads > 0 && (
            <p style={{ marginTop: ".5rem" }}>
              <Link href="/records?list=review">Review the new jobs →</Link>
            </p>
          )}
        </div>
      )}

      <h2>What to look for</h2>
      <form action={discoveryWordsAction} className="card stack">
        <p className="muted small" style={{ marginTop: 0 }}>
          One word or phrase per line. A job is added when its <strong>title</strong> contains any word from the first list
          and none from the second. Your rules then check the location.
        </p>
        <div className="fields">
          <Words name="titleWords" label="Job titles to look for" hint="(e.g. implementation, CRM)" words={settings.titleWords} />
          <Words name="skipWords" label="Skip titles containing" hint="(e.g. intern, director)" words={settings.skipWords} />
          <Words
            name="regionWords"
            label="Places that work for you"
            hint="(a job naming one of these is kept)"
            words={settings.regionWords}
          />
          <Words
            name="otherRegionWords"
            label="Places that don't"
            hint="(a job only for these is skipped)"
            words={settings.otherRegionWords}
          />
        </div>
        <p className="muted small">
          Jobs listed as on-site or hybrid, or tied to a place that isn&apos;t yours, are skipped (your Remote-only and
          region rules — change them on the <Link href="/settings">Rules</Link> page). A job that just says &quot;Remote&quot;
          is kept for you to check.
        </p>
        <div>
          <SubmitButton pending="Saving…">Save words</SubmitButton>
        </div>
      </form>

      <h2>Companies being watched ({on})</h2>
      <p className="muted">
        Every company in your tracker whose jobs are on Lever, Greenhouse, Ashby or Workable is watched automatically. Add
        others by pasting a link to their careers page.
      </p>
      <form action={addBoardAction} className="inline card" style={{ marginBottom: "1rem" }}>
        <label style={{ flex: "1 1 360px" }}>
          Careers page link
          <input name="link" required placeholder="e.g. https://jobs.lever.co/companyname" />
        </label>
        <SubmitButton pending="Adding…">Add company</SubmitButton>
      </form>
      <details className="card">
        <summary>Show all {boards.length} companies</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Job board</th>
                <th>Your leads there</th>
                <th>Searched?</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.key}>
                  <td>
                    <strong>{b.company}</strong>
                    {failed.has(b.company) && <div className="small" style={{ color: "var(--warn)" }}>Last time: {failed.get(b.company)}</div>}
                  </td>
                  <td className="small">
                    {PROVIDER_NAMES[b.ref.provider]} <span className="muted">({b.ref.slug})</span>
                  </td>
                  <td className="small">{b.leads}</td>
                  <td>
                    <form action={toggleBoardAction.bind(null, b.key, !b.enabled)}>
                      <SubmitButton className="small" pending="…">
                        {b.enabled ? "✓ On — switch off" : "Off — switch on"}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
