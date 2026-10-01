import Link from "next/link";
import { answersAction } from "../actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { getAnswers, STARTER_TITLES } from "@/services/answers";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function AnswersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const answers = await getAnswers(ctx);
  const rows = [
    ...answers,
    ...(answers.length ? [] : STARTER_TITLES.map((title) => ({ title, text: "" }))),
    { title: "", text: "" },
    { title: "", text: "" },
  ];
  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="My answers"
        intro="Write the answers that almost every application asks for, once. They then appear on every Ready lead with a Copy button, so applying takes minutes."
      />

      {answers.length > 0 && (
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>Your saved answers ({answers.length})</h2>
          {answers.map((a, i) => (
            <div key={i} style={{ marginBottom: ".8rem" }}>
              <div className="spread">
                <h3 style={{ margin: 0 }}>{a.title}</h3>
                <CopyButton text={a.text} />
              </div>
              <div className="package">{a.text}</div>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{answers.length ? "Change or add answers" : "Write your answers"}</h2>
        <p className="muted small">
          Change the heading to anything you like. To remove an answer, empty its text. Only you see these — they&apos;re never
          included in a shared download, and the app never sends them anywhere. Tip: tweak an answer for each company after
          you paste it.
        </p>
        <form action={answersAction} className="stack">
          {rows.map((a, i) => (
            <fieldset key={i} className="stack" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: ".8rem" }}>
              <label>
                Heading
                <input name={`title:${i}`} defaultValue={a.title} placeholder="e.g. Why this kind of role" maxLength={120} />
              </label>
              <label>
                Answer
                <textarea name={`text:${i}`} defaultValue={a.text} rows={4} placeholder="Leave empty if you don't need this one." />
              </label>
            </fieldset>
          ))}
          <div>
            <SubmitButton pending="Saving…">Save answers</SubmitButton>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Need more boxes? Save, and two new empty ones appear. Your prepared briefs for specific leads are still on each
            lead&apos;s page — <Link href="/records?list=ready">see your Ready leads</Link>. Your longer profile (roles you
            want, deal-breakers, your voice) goes on <Link href="/about-me">About me</Link>.
          </p>
        </form>
      </section>
    </>
  );
}
