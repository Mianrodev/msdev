import Link from "next/link";
import { notFound } from "next/navigation";
import { updateRuleAction } from "../../../actions";
import { RuleFields } from "@/components/rule-form";
import { Flash, fmtDate, type SearchParams } from "@/components/ui";
import { listHistory } from "@/services/history";
import { getRule } from "@/services/rules";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function RulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = getCtx();
  const rule = getRule(ctx, id);
  if (!rule) notFound();
  const hist = listHistory(ctx, { entityType: "rule", entityId: id });
  return (
    <>
      <Flash sp={sp} />
      <p className="small">
        <Link href="/settings">← Rules &amp; settings</Link>
      </p>
      <h1>{rule.label}</h1>
      <p className="muted small">Origin: {rule.origin}</p>
      <form action={updateRuleAction.bind(null, id)} className="card stack">
        <RuleFields rule={rule} />
        <label>
          Why this change (logged to History)
          <input name="reason" />
        </label>
        <div>
          <button type="submit" className="primary">
            Save rule
          </button>
        </div>
      </form>
      <h2>History</h2>
      <ul className="plain small">
        {hist.map((h) => (
          <li key={h.id}>
            <span className="muted">{fmtDate(h.occurredAt)}</span> {h.event} — {h.reason} <span className="muted">({h.actor})</span>
          </li>
        ))}
      </ul>
    </>
  );
}
