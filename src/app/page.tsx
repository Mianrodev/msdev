import Link from "next/link";
import { runUpdateAction } from "./actions";
import { SubmitButton } from "@/components/client";
import { describeRun, fmtWhen, LISTS, type ListKey } from "@/components/plain";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { countsByView } from "@/services/records";
import { getCtx } from "@/services/request";
import { listRuns, type RunSummary } from "@/services/run-update";
import { getSetupStatus } from "@/services/setup";

export const dynamic = "force-dynamic";

const STEPS = {
  password: { title: "Create your password", text: "Done — only you can sign in.", href: null, button: null },
  upload: {
    title: "Upload your tracker spreadsheet",
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
    title: "Run your first weekly check",
    text: "Press the Run weekly check button below. It sorts and re-checks all your leads.",
    href: "#weekly",
    button: "Go to weekly check",
  },
} as const;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const [setup, counts, runs] = await Promise.all([getSetupStatus(ctx), countsByView(ctx), listRuns(ctx, 1)]);
  const lastRun = runs[0];
  const next = setup.steps.find((s) => !s.done)?.key;
  const tiles: { list: ListKey; n: number }[] = [
    { list: "ready", n: counts.prospects },
    { list: "checking", n: counts.leads },
    { list: "hold", n: counts.hold },
    { list: "archive", n: counts.archive },
  ];

  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Home"
        intro="Your leads at a glance. Once a week, press Run weekly check — then open your Ready leads and apply to the ones you like."
      />

      {!setup.allDone && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: ".5rem" }}>Getting started — {setup.steps.filter((s) => s.done).length} of 4 done</h2>
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

      <section className="card" id="weekly" style={{ marginBottom: "1.5rem" }}>
        <div className="spread">
          <div style={{ flex: "1 1 380px" }}>
            <h2 style={{ marginTop: 0 }}>Weekly check</h2>
            <p className="muted">
              Re-checks every Ready and On-hold lead against your rules, then moves new leads through the checks. It only
              sorts and prepares — it never sends anything or contacts anyone.
            </p>
            <p className="small muted">
              {lastRun ? `Last run: ${fmtWhen(lastRun.finishedAt)}` : "Not run yet."}
            </p>
          </div>
          <form action={runUpdateAction}>
            <SubmitButton className="primary big" pending="Checking your leads…">
              Run weekly check
            </SubmitButton>
          </form>
        </div>
        {lastRun && (
          <div className="help" style={{ marginTop: ".8rem" }}>
            <strong>Last result</strong>
            <ul style={{ margin: ".3rem 0 0", paddingLeft: "1.2rem" }}>
              {describeRun(lastRun.summary as unknown as RunSummary).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <h2>Your lists</h2>
      <div className="tiles">
        {tiles.map((t) => (
          <Link key={t.list} href={`/records?list=${t.list}`} className={`tile ${t.list}`}>
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
          You don&apos;t have any leads yet. <Link href="/import">Upload your spreadsheet</Link> or{" "}
          <Link href="/records/new">add a lead by hand</Link>.
        </p>
      )}
      <p className="small muted" style={{ marginTop: "1.2rem" }}>
        Found something new? <Link href="/records/new">Add a lead by hand</Link>. Not sure what something means?{" "}
        <Link href="/help">Read the Help page</Link>.
      </p>
    </>
  );
}
