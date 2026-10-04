import Link from "next/link";
import { makeAiLinkAction, removeAiLinkAction } from "../login/actions";
import { AiLinkMaker, SubmitButton } from "@/components/client";
import { fmtWhen } from "@/components/plain";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { aiLinkStatus } from "@/lib/ai-key";
import { getSession } from "@/services/request";
import { AI_TOOLS } from "@/services/ai-tools";

export const dynamic = "force-dynamic";

const CAN = [
  "Understand what this app is and how you use it",
  "Read your leads, and the jobs the search couldn't confirm",
  "Write a tailored cover letter and answers onto a lead (you copy them when applying)",
  "Add notes to a lead, e.g. company research or interview prep",
  "Add jobs it finds elsewhere, e.g. on LinkedIn (they go to Being checked)",
  "Rate your Ready jobs against your About me (fit + why) and sort them — Ready, On hold or Archived — with a reason on each; you can always move one back",
];
const CANNOT = [
  "Apply, send messages or contact anyone",
  "Apply, or mark anything as applied — that's yours",
  "Change your rules, words, password or settings",
  "Delete anything (nothing in this app can be deleted)",
];

export default async function ConnectPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { ctx, user, viewing } = await getSession();
  if (viewing)
    return (
      <>
        <PageHeader
          title="Your AI"
          intro={`AI links are made by each person for their own space. ${viewing.name} can make theirs here when signed in; switch back to your own space to manage yours.`}
        />
      </>
    );
  const status = await aiLinkStatus(ctx.db, user.workspaceId);
  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Your AI"
        intro="Connect Claude (or another AI assistant that supports connectors) to your tracker. Then just chat: “Look at my Ready leads and write a cover letter for the best one.” It uses your own AI plan — no extra cost here."
      />

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>
          1. Your private link{" "}
          {status.on ? <span className="pill ready small">On</span> : <span className="pill hold small">Not made yet</span>}
        </h2>
        {status.on && status.createdAt && <p className="muted small">Made {fmtWhen(status.createdAt)}.</p>}
        <AiLinkMaker make={makeAiLinkAction} on={status.on} />
        {status.on && (
          <form action={removeAiLinkAction} style={{ marginTop: ".8rem" }}>
            <SubmitButton
              className="small danger"
              pending="Switching off…"
              confirm="Switch off your AI's access? It stops working straight away."
            >
              Switch off AI access
            </SubmitButton>
          </form>
        )}
      </section>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>2. Add it to Claude (once)</h2>
        <ol>
          <li>
            Open <strong>claude.ai</strong> (or the Claude app) → click your name (bottom left) → <strong>Settings</strong> →{" "}
            <strong>Connectors</strong>.
          </li>
          <li>
            Click <strong>Add custom connector</strong>. Name: <em>My job tracker</em>. Paste your private link as the URL. Leave
            the advanced settings empty. Click <strong>Add</strong>.
          </li>
          <li>
            In a new chat, click the <strong>tools / + button</strong> under the message box and make sure <em>My job tracker</em>{" "}
            is switched on.
          </li>
          <li>
            Try: <em>&quot;Read about my job tracker, then show me my Ready leads.&quot;</em> Claude asks before using a tool the
            first time — choose <strong>Allow</strong>.
          </li>
        </ol>
        <p className="small muted">Works with Claude Pro and Max. Custom connectors are free to add.</p>
      </section>

      <details className="card" style={{ marginBottom: "1.5rem" }}>
        <summary>Using ChatGPT instead?</summary>
        <p>
          ChatGPT can use the same link, but what it can do depends on your ChatGPT plan (as of late 2026 — OpenAI changes this
          often):
        </p>
        <ul>
          <li>
            <strong>Business, Enterprise or Edu:</strong> everything above. An admin turns on <em>Developer mode</em> (Settings →
            Apps → Advanced settings), then <strong>Apps → Create</strong>: paste your private link as the address, choose{" "}
            <strong>No authentication</strong>, press <strong>Scan tools</strong>, then <strong>Create</strong>.
          </li>
          <li>
            <strong>Pro:</strong> read only — it can read your leads and explain them, but can&apos;t save cover letters or notes
            into the app (copy them in yourself). Same steps, from your own Settings → Apps.
          </li>
          <li>
            <strong>Plus or Free:</strong> custom connections aren&apos;t available.
          </li>
        </ul>
        <p className="small muted">ChatGPT connections work on the website only, not the phone app.</p>
      </details>

      <div className="grid cols-2">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>What your AI can do</h2>
          <ul>
            {CAN.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>What it can never do</h2>
          <ul>
            {CANNOT.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Things to ask</h2>
        <ul>
          <li>&quot;Which of my New to review jobs fit me best, and why?&quot;</li>
          <li>&quot;Write a cover letter for my top Ready lead using my saved answers, and save it to the lead.&quot;</li>
          <li>
            &quot;Check the jobs the search couldn&apos;t confirm — are any on the company&apos;s own website? Add the real
            ones.&quot;
          </li>
          <li>&quot;I have an interview with Stripe on Friday — add prep notes to that lead.&quot;</li>
        </ul>
        <p className="small muted">
          Everything your AI changes shows on the <Link href="/history">Activity</Link> page as &quot;Your AI&quot;. It has{" "}
          {AI_TOOLS.length} tools: {AI_TOOLS.map((t) => t.title.toLowerCase()).join(", ")}.
        </p>
      </section>
    </>
  );
}
