import Link from "next/link";
import { findLeadsAction } from "./actions";
import { SubmitButton } from "@/components/client";
import { describeRun, describeSearch, fmtWhen, LISTS, type ListKey } from "@/components/plain";
import { lastDiscovery } from "@/services/discovery";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { countsByView } from "@/services/records";
import { getSession } from "@/services/request";
import { listRuns, type RunSummary } from "@/services/run-update";
import { getSetupStatus } from "@/services/setup";

export const dynamic = "force-dynamic";
// Searching a few hundred job boards takes up to a minute.
export const maxDuration = 300;

const STEPS = {
  password: { title: "Create your password", text: "Done — only you can sign in.", href: null, button: null },
  recovery: {
    title: "Save a recovery code",
    text: "If you ever forget your password, this code gets you back in. Make it and write it down.",
    href: "/account#recovery",
    button: "Make recovery code",
  },
  words: {
    title: "Choose what jobs to look for",
    text: 'Type the job titles you want (e.g. "sales operations"), words to skip, and the places that work for you.',
    href: "/discover#words",
    button: "Choose words",
  },
  profile: {
    title: "Tell the app about you",
    text: "The roles you want, deal-breakers, where you can work, your experience. Every job is rated against this.",
    href: "/about-me",
    button: "Write About me",
  },
  ai: {
    title: "Connect your AI",
    text: "Your AI rates the jobs the app finds and writes cover letters. Without it, jobs are filtered but not rated.",
    href: "/connect",
    button: "Connect your AI",
  },
  upload: {
    title: "Upload your tracker spreadsheet (optional)",
    text: "Bring in your existing leads from the Excel file. Nothing in the file is lost.",
    href: "/import",
    button: "Upload spreadsheet",
  },
  privacy: {
    title: "Protect personal details",
    text: "Type the name, email, phone and employer that must never appear in anything you share.",
    href: "/privacy",
    button: "Open Privacy",
  },
  weekly: {
    title: "Find your first new leads",
    text: "Press Find new leads below. It searches company job boards, checks every job and sorts them for you.",
    href: "#weekly",
    button: "Go to Find new leads",
  },
} as const;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { ctx, user, viewing } = await getSession();
  const [setup, counts, runs, search] = await Promise.all([
    getSetupStatus(ctx, viewing ?? user),
    countsByView(ctx),
    listRuns(ctx, 1),
    lastDiscovery(ctx),
  ]);
  const lastRun = runs[0];
  const next = setup.steps.find((s) => !s.done)?.key;
  const tiles: { list: ListKey; n: number }[] = [
    { list: "ready", n: counts.prospects },
    { list: "applied", n: counts.applied },
    { list: "hold", n: counts.hold },
    { list: "review", n: counts.review },
    ...(counts.leads ? [{ list: "checking" as const, n: counts.leads }] : []),
    { list: "archive", n: counts.archive },
  ];

  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Home"
        intro="Every Monday the app finds remote jobs, checks each one (really remote? open to you? still listed? genuine?) and puts the good ones on Ready. Your job: open Ready, apply, then mark each one Applied."
      />

      {!setup.allDone && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: ".5rem" }}>
            Getting started — {setup.steps.filter((s) => s.done).length} of {setup.steps.length} done
          </h2>
          <ol className="steps">
            {setup.steps.map((s, i) => {
              const step = STEPS[s.key];
              return (
                <li key={s.key} className={s.done ? "done" : s.key === next ? "next" : undefined}>
                  <span className="num">{s.done ? "✓" : i + 1}</span>
                  <div className="body">
                    <div className="t">{step.title}</div>
                    {!s.done && <div className="muted small">{step.text}</div>}
                  </div>
                  {!s.done && step.href && (
                    <Link className={`button${s.key === next ? " primary" : ""}`} href={step.href}>
                      {step.button}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {counts.prospects > 0 && (
        <section className="next-box" style={{ marginBottom: "1.5rem" }}>
          <h2>
            {counts.prospects} {counts.prospects === 1 ? "job" : "jobs"} ready to apply to
          </h2>
          <p>
            Each one is remote, open to you and still listed — the app checked. Open the top one, copy your answers, apply, then
            set it to Applied.
          </p>
          <Link className="button primary big" href="/records?list=ready">
            Start applying →
          </Link>
        </section>
      )}
      {counts.review > 0 && (
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>
            {counts.review} {counts.review === 1 ? "job needs" : "jobs need"} your call
          </h2>
          <p className="muted">
            The app couldn&apos;t sort these by itself (a fact is missing). Open each one and choose Yes, Not sure or No.
          </p>
          <Link className="button" href="/records?list=review">
            Look at them →
          </Link>
        </section>
      )}

      <section className="card" id="weekly" style={{ marginBottom: "1.5rem" }}>
        <div className="spread">
          <div style={{ flex: "1 1 380px" }}>
            <h2 style={{ marginTop: 0 }}>Find new leads</h2>
            <p className="muted">
              Searches the careers pages of every company you watch (and remote-job sites, for new companies) for jobs matching
              your words, checks each one — really remote, open to you, who can apply, still listed, posted by the employer — and
              sorts them: Ready, On hold or Archived, each with the reason. It happens by itself every Monday; press the button to
              do it now. It never applies or contacts anyone.
            </p>
            <p className="small muted">
              {search ? `Last search: ${fmtWhen(search.finishedAt)}` : "Not searched yet."}{" "}
              <Link href="/discover">Change what it looks for</Link>
            </p>
          </div>
          <form action={findLeadsAction}>
            <input type="hidden" name="back" value="/" />
            <SubmitButton
              className="primary big"
              pending="Searching… this can take up to 5 minutes. You can leave this page; the result shows here."
            >
              Find new leads
            </SubmitButton>
          </form>
        </div>
        {(search || lastRun) && (
          <div className="help" style={{ marginTop: ".8rem" }}>
            <strong>Last result</strong>
            <ul style={{ margin: ".3rem 0 0", paddingLeft: "1.2rem" }}>
              {search && describeSearch(search).map((l) => <li key={l}>{l}</li>)}
              {lastRun &&
                describeRun(lastRun.summary as unknown as RunSummary)
                  .slice(-1)
                  .map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        )}
      </section>

      <h2>Your lists</h2>
      <div className="tiles">
        {tiles.map((t) => (
          <Link
            key={t.list}
            href={`/records?list=${t.list}`}
            className={`tile ${t.list}${t.list === "review" && t.n > 0 ? " has" : ""}`}
          >
            <div className="t">{LISTS[t.list].title}</div>
            <div className="n">{t.n}</div>
            <div className="d">{LISTS[t.list].help}</div>
          </Link>
        ))}
        <Link href="/accounts" className="tile">
          <div className="t">Companies to watch</div>
          <div className="n">{setup.accounts}</div>
          <div className="d">Companies worth approaching even without a specific opening.</div>
        </Link>
      </div>

      {setup.records === 0 && (
        <p className="note" style={{ marginTop: "1rem" }}>
          No leads yet. Choose what jobs to look for, then press Find new leads — the app fills this in for you.{" "}
          {user.role === "owner" && !viewing && (
            <>
              Have a spreadsheet? <Link href="/import">Upload it</Link>.
            </>
          )}
        </p>
      )}
      <p className="small muted" style={{ marginTop: "1.2rem" }}>
        Found something new? <Link href="/records/new">Add a lead by hand</Link>. Not sure what something means?{" "}
        <Link href="/help">Read the Help page</Link>.
      </p>
    </>
  );
}
