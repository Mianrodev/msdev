import type { RuleResult } from "@/core/rules";
import { STAGE_LABELS, VERDICT_LABELS, type Stage } from "@/core/types";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = one(sp.ok);
  const error = one(sp.error);
  return (
    <>
      {ok && <div className="flash ok">{ok}</div>}
      {error && <div className="flash error">{error}</div>}
    </>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function StageLabel({ stage }: { stage: string }) {
  return <>{STAGE_LABELS[stage as Stage] ?? stage}</>;
}

export function Verdict({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="muted">—</span>;
  return <>{VERDICT_LABELS[v] ?? v}</>;
}

export function Outcome({ r }: { r: RuleResult }) {
  const cls = r.outcome === "pass" ? "pass" : r.outcome === "unknown" ? "unknown" : "fail";
  return (
    <li>
      <span className={`badge ${cls}`}>{r.outcome}</span> <strong>{r.label}</strong>{" "}
      <span className="muted small">{r.reason}</span>
    </li>
  );
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return s.length > 10 ? s.slice(0, 16).replace("T", " ") : s;
}

export function Ext({ href }: { href: string | null | undefined }) {
  if (!href) return <span className="muted">—</span>;
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" title={href}>
      {href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}
      {href.length > 56 ? "…" : ""}
    </a>
  );
}
