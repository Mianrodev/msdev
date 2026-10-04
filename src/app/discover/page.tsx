import Link from "next/link";
import { addBoardAction, discoveryWordsAction, findLeadsAction, toggleBoardAction, toggleSiteAction } from "../actions";
import { SubmitButton } from "@/components/client";
import { describeSearch, fmtWhen } from "@/components/plain";
import { Ext, Flash, PageHeader, type SearchParams } from "@/components/ui";
import { getDiscoverySettings, lastDiscovery, listBoards } from "@/services/discovery";
import { getCtx } from "@/services/request";
import { PROVIDER_NAMES } from "@/sources/job-boards";
import { SITES, type Site } from "@/sources/job-sites";

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
        intro="The app reads the careers pages of the companies you're watching and adds new jobs that match your words and rules. It also looks at remote-job sites to find new companies — but only trusts a job once it's on the company's own careers page. It runs by itself every Monday; you can also run it now. It only reads job listings — it never applies or contacts anyone."
      >
        <form action={findLeadsAction}>
          <input type="hidden" name="back" value="/discover" />
          <SubmitButton className="primary big" pending="Searching… this can take up to 5 minutes.">
            Find new leads now
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
          {last.timing && (
            <details className="small muted" style={{ margin: ".4rem 0 0" }}>
              <summary>
                Took{" "}
                {last.timing.total >= 90
                  ? `about ${Math.round(last.timing.total / 60)} minutes`
                  : `${Math.round(last.timing.total)} seconds`}
              </summary>
              Reading job boards {Math.round(last.timing.boards)}s, remote-job sites {Math.round(last.timing.sites)}s, saving{" "}
              {Math.round(last.timing.saving)}s; database reply time {last.timing.dbMs} ms.
            </details>
          )}

          {!!last.companiesConfirmed?.length && (
            <details style={{ marginTop: ".5rem" }}>
              <summary>New companies found ({last.companiesConfirmed.length})</summary>
              <ul className="small" style={{ margin: ".3rem 0 0", paddingLeft: "1.2rem" }}>
                {last.companiesConfirmed.map((c) => (
                  <li key={c.company}>
                    <strong>{c.company}</strong> — seen on {c.site}, confirmed on its own careers page ({c.board})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!!last?.skippedJobs?.length && (
        <details className="card" style={{ marginTop: "1rem" }}>
          <summary>Jobs skipped, and why ({last.skippedTotal})</summary>
          <p className="small muted" style={{ marginTop: ".4rem" }}>
            These matched your words but failed a check, so they weren&apos;t added. If one looks wrong to you, open it and tell
            us the wording, so the check can be improved.
          </p>
          <div className="table-wrap">
            <table className="small">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Job</th>
                  <th>Where</th>
                  <th>Why it was skipped</th>
                </tr>
              </thead>
              <tbody>
                {last.skippedJobs.map((n, i) => (
                  <tr key={`${n.url}-${i}`}>
                    <td>{n.company}</td>
                    <td>
                      <Ext href={n.url} label={n.title} />
                    </td>
                    <td>{n.location ?? "Not stated"}</td>
                    <td>{n.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(last.skippedTotal ?? 0) > last.skippedJobs.length && (
            <p className="small muted">Showing the first {last.skippedJobs.length}.</p>
          )}
        </details>
      )}

      {!!last?.notConfirmed?.length && (
        <details className="card" style={{ marginBottom: "1rem" }}>
          <summary>Jobs we couldn&apos;t confirm with the company ({last.notConfirmedTotal})</summary>
          <p className="small muted">
            These match your words, but the app couldn&apos;t find them on the company&apos;s own careers page (the company may
            use a careers system the app can&apos;t read). They were <strong>not</strong> added. If one interests you, look for it
            on the company&apos;s own website — if it&apos;s there, it&apos;s genuine: add it with{" "}
            <Link href="/records/new">Add a lead by hand</Link>. Never pay a fee or move to WhatsApp/Telegram for a job.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Job</th>
                  <th>Where</th>
                  <th>Seen on</th>
                </tr>
              </thead>
              <tbody>
                {last.notConfirmed.map((n) => (
                  <tr key={n.url}>
                    <td>
                      <strong>{n.company}</strong>
                    </td>
                    <td className="small">{n.title}</td>
                    <td className="small">{n.location ?? "Not stated"}</td>
                    <td className="small">
                      <Ext href={n.url} label={n.site} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(last.notConfirmedTotal ?? 0) > last.notConfirmed.length && (
            <p className="small muted">Showing the first {last.notConfirmed.length}.</p>
          )}
        </details>
      )}

      <h2 id="words">What to look for</h2>
      <form action={discoveryWordsAction} className="card stack">
        <p className="muted small" style={{ marginTop: 0 }}>
          One word or phrase per line. A job is added when its <strong>title</strong> contains any word from the first list and
          none from the second. Your rules then check the location.
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
          Jobs listed as on-site or hybrid, or tied to a place that isn&apos;t yours, are skipped (your Remote-only and region
          rules — change them under <Link href="/settings#rules">Settings → Your rules</Link>). Only jobs that clearly say
          they&apos;re remote are added — an office city on its own (&quot;Bengaluru, India&quot;) isn&apos;t enough.
        </p>
        <div>
          <SubmitButton pending="Saving…">Save words</SubmitButton>
        </div>
      </form>

      <h2>Remote-job sites</h2>
      <p className="muted">
        Used only to discover companies you don&apos;t watch yet. When a matching job appears on one of these sites, the app looks
        for the same job on the company&apos;s own careers page. Found → the job is genuine: it&apos;s added and the company is
        watched from then on. Not found → it isn&apos;t added (listed above for you to check). Listings with scam warning signs —
        a fee, WhatsApp or Telegram contact, pay in crypto, &quot;no interview&quot; — are always dropped.
      </p>
      <div className="card table-wrap" style={{ marginBottom: "1.5rem" }}>
        <table>
          <tbody>
            {(Object.keys(SITES) as Site[]).map((site) => {
              const off = settings.offSites.includes(site);
              const failedSite = last?.sitesFailed?.find((f) => f.site === SITES[site].name);
              return (
                <tr key={site}>
                  <td>
                    <strong>{SITES[site].name}</strong>
                    {failedSite && (
                      <div className="small" style={{ color: "var(--warn)" }}>
                        Last time: {failedSite.error}
                      </div>
                    )}
                  </td>
                  <td className="small">
                    <Ext href={SITES[site].home} label={SITES[site].home.replace(/^https:\/\/(www\.)?/, "")} />
                  </td>
                  <td>
                    <form action={toggleSiteAction.bind(null, site, off)}>
                      <SubmitButton className="small" pending="…">
                        {off ? "Off — switch on" : "✓ On — switch off"}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Companies being watched ({on})</h2>
      <p className="muted">
        Every company in your tracker whose careers page runs on Lever, Greenhouse, Ashby, Workable, Recruitee or SmartRecruiters
        is watched automatically, plus companies found through remote-job sites. Add others by pasting a link to their careers
        page.
      </p>
      <form action={addBoardAction} className="inline card" style={{ marginBottom: "1rem" }}>
        <label style={{ flex: "1 1 360px" }}>
          Careers page link
          <input name="link" required placeholder="e.g. https://jobs.lever.co/companyname" />
        </label>
        <SubmitButton pending="Adding…">Add company</SubmitButton>
      </form>
      {!!last?.boardsFailed?.length && (
        <div className="card" style={{ marginBottom: "1rem", borderLeft: "5px solid var(--warn)" }}>
          <strong>
            Couldn&apos;t read{" "}
            {last.boardsFailed.length === 1 ? "one company's job board" : `${last.boardsFailed.length} companies' job boards`}{" "}
            last time
          </strong>
          <ul className="small" style={{ margin: ".3rem 0 0", paddingLeft: "1.2rem" }}>
            {last.boardsFailed.slice(0, 20).map((f) => (
              <li key={`${f.company}-${f.error}`}>
                <strong>{f.company}</strong> — {f.error}
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: ".4rem 0 0" }}>
            A board that no longer exists twice in a row is switched off by itself, and its leads go On hold for you to check. The
            others are tried again next time.
          </p>
        </div>
      )}
      <details className="card">
        <summary>Show all {boards.length} companies</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Job board</th>
                <th>Your leads there</th>
                <th>Added</th>
                <th>Searched?</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.key}>
                  <td>
                    <strong>{b.company}</strong>
                    {failed.has(b.company) && (
                      <div className="small" style={{ color: "var(--warn)" }}>
                        Last time: {failed.get(b.company)}
                      </div>
                    )}
                  </td>
                  <td className="small">
                    {PROVIDER_NAMES[b.ref.provider]} <span className="muted">({b.ref.slug})</span>
                  </td>
                  <td className="small">{b.leads}</td>
                  <td className="small">
                    {b.addedByHand ? "By you" : b.foundVia ? `Found via ${b.foundVia}` : "From your tracker"}
                  </td>
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
