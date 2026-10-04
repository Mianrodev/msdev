import Link from "next/link";
import type { RuleResult } from "@/core/rules";
import type { RecordRow } from "@/db/schema";
import { humanize, LISTS, listOf, whereItIs } from "./plain";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = one(sp.ok);
  const error = one(sp.error);
  return (
    <>
      {ok && (
        <div className="flash ok" role="status">
          ✓ {ok}
        </div>
      )}
      {error && (
        <div className="flash error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

/** Every page starts with a title and one or two sentences saying what the page is for. */
export function PageHeader({ title, intro, children }: { title: string; intro?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="spread" style={{ marginBottom: ".4rem" }}>
      <div style={{ flex: "1 1 420px" }}>
        <h1>{title}</h1>
        {intro && <p className="intro">{intro}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function StatusPill({ r }: { r: Pick<RecordRow, "status" | "stage" | "fitTier" | "origin"> }) {
  return <span className={`pill ${listOf(r)}`}>{whereItIs(r)}</span>;
}

export function StatusBadge({ r }: { r: Pick<RecordRow, "status" | "stage" | "fitTier" | "origin"> }) {
  return <span className={`badge ${listOf(r)}`}>{whereItIs(r)}</span>;
}

export function ListBadge({ list }: { list: keyof typeof LISTS }) {
  return <span className={`badge ${list}`}>{LISTS[list].title}</span>;
}

/** The facts that decide a found job, as short badges: ✓ YES, ✗ NO, ? not known. Hover shows the full sentence. */
const FACTS: [string, string][] = [
  ["remoteCheck", "Remote"],
  ["openToYourRegion", "Open to you"],
  ["whoCanApply", "Who can apply"],
  ["verifiedOpen", "Still listed"],
  ["employer", "Employer"],
];
export function FactBadges({ r, all = false }: { r: Pick<RecordRow, "attributes" | "origin">; all?: boolean }) {
  const items = FACTS.map(
    ([k, label]) => [k, label, typeof r.attributes[k] === "string" ? (r.attributes[k] as string) : null] as const,
  ).filter(([, , v]) => all || v);
  if (!items.length) return <span className="muted small">Not checked by the app</span>;
  return (
    <span className="facts">
      {items.map(([k, label, v]) => {
        const state = !v ? "unknown" : /^YES/i.test(v) ? "pass" : /^NO/i.test(v) ? "fail" : "unknown";
        return (
          <span key={k} className={`badge fact ${state}`} title={v ?? `${label}: not checked`}>
            {ICON[state]} {label}
          </span>
        );
      })}
    </span>
  );
}

/** One line saying why a lead is where it is. */
export function whyItsHere(
  r: Pick<RecordRow, "fitRationale" | "verifyReason" | "holdReason" | "archiveReason" | "status" | "stage">,
): string | null {
  if (r.status === "hold") return r.holdReason;
  if (r.status === "archived") return r.archiveReason;
  return r.fitRationale ?? r.verifyReason ?? null;
}

const ICON = { pass: "✓", fail: "✗", hold: "!", unknown: "?", not_applicable: "·" } as const;
const OUTCOME_TEXT = {
  pass: "OK",
  fail: "Fails",
  hold: "Needs a look",
  unknown: "Not known yet",
  not_applicable: "",
} as const;

/** The rule checks for one lead, in plain words. */
export function Checks({ results }: { results: RuleResult[] }) {
  if (!results.length) return <p className="muted small">No automatic checks apply to this lead yet.</p>;
  return (
    <ul className="plain checks">
      {results.map((r) => (
        <li key={r.key}>
          <span className={`icon ${r.outcome}`} aria-hidden>
            {ICON[r.outcome]}
          </span>
          <span>
            <strong>{r.label}</strong> — <span className={`badge ${r.outcome}`}>{OUTCOME_TEXT[r.outcome]}</span>
            <div className="muted small">{plainReason(r)}</div>
          </span>
        </li>
      ))}
    </ul>
  );
}

function plainReason(r: RuleResult): string {
  // Rule reasons mention the stored field name; show it as words.
  return r.reason.replace(new RegExp(`\\b${r.field}\\b`, "g"), `"${humanize(r.field)}"`).replace(/UNKNOWN/g, "not known");
}

export function Ext({ href, label }: { href: string | null | undefined; label?: string }) {
  if (!href) return <span className="muted">—</span>;
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" title={href}>
      {label ?? `${href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 44)}${href.length > 52 ? "…" : ""}`} ↗
    </a>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "2rem 1rem" }}>
      <p style={{ fontWeight: 600, fontSize: "1.05rem" }}>{title}</p>
      {children}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="small" style={{ marginTop: 0 }}>
      <Link href={href}>← {children}</Link>
    </p>
  );
}
