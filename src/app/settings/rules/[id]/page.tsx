import { notFound } from "next/navigation";
import { toggleRuleAction, updateRuleAction } from "../../../actions";
import { SubmitButton } from "@/components/client";
import { actorName, fmtWhen } from "@/components/plain";
import { ruleSentence, RuleFields } from "@/components/rule-form";
import { BackLink, Flash, PageHeader, type SearchParams } from "@/components/ui";
import { listHistory } from "@/services/history";
import { listFieldNames } from "@/services/records";
import { getCtx } from "@/services/request";
import { getRule } from "@/services/rules";

export const dynamic = "force-dynamic";

export default async function RulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getCtx();
  const rule = await getRule(ctx, id);
  if (!rule) notFound();
  const [hist, fieldNames] = await Promise.all([listHistory(ctx, { entityType: "rule", entityId: id }), listFieldNames(ctx)]);
  const isNote = rule.operator === "note";
  return (
    <>
      <Flash sp={sp} />
      <BackLink href="/settings">Back to Rules</BackLink>
      <PageHeader title={rule.label} intro={isNote ? rule.description : ruleSentence(rule)} />
      <div className="row" style={{ marginBottom: "1rem" }}>
        <span className={`pill ${rule.enabled ? "ready" : "archive"}`}>{rule.enabled ? "Switched on" : "Switched off"}</span>
        <form action={toggleRuleAction.bind(null, id, !rule.enabled)}>
          <SubmitButton className="" pending="…">
            {rule.enabled ? "Switch off" : "Switch on"}
          </SubmitButton>
        </form>
      </div>
      <details className="card" open={!isNote}>
        <summary>Edit</summary>
        <form action={updateRuleAction.bind(null, id)} className="stack">
          <RuleFields rule={rule} fieldNames={fieldNames} />
          <div>
            <SubmitButton pending="Saving…">Save</SubmitButton>
          </div>
        </form>
      </details>
      <p className="muted small" style={{ marginTop: "1rem" }}>
        Rules are never deleted — switch one off instead, so past decisions still make sense.
      </p>
      <h2>Changes to this rule</h2>
      <ul className="plain small">
        {hist.map((h) => (
          <li key={h.id}>
            {h.reason} <span className="muted">· {fmtWhen(h.occurredAt)} · {actorName(h.actor)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
