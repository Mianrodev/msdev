/**
 * Shared presentation components for every discovery module. Server components (no client JS).
 * Variants are previewed at /design and documented in docs/DESIGNERS.md.
 */
import Link from "next/link";
import { copyFor } from "@/brand/copy";
import type { Brand } from "@/brand/brands";
import { fmtDate } from "@/core/opportunities/dates";
import type { ModuleDef, Tone } from "@/core/opportunities/module";
import { moduleDef } from "@/core/opportunities/modules";
import { EVIDENCE_LABELS, type DataMode, type Evidence, type Field, type MatchResult, type ModuleId, type ProviderRun } from "@/core/opportunities/types";
import type { OppSearchRow } from "@/db/schema";
import { Icon } from "./icons";

export function LogoMark({ brand }: { brand: Brand }) {
  return (
    <span className="op-logo" aria-hidden="true">
      {brand.logoMark}
    </span>
  );
}

/** "Demo data" / "Live data" chip. Shown on every result, detail page and export link. */
export function ModeChip({ mode }: { mode: DataMode }) {
  const { t } = copyFor();
  return <span className={`op-chip ${mode}`}>{mode === "demo" ? `◆ ${t("demo.badge")}` : `● ${t("live.badge")}`}</span>;
}

export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`op-chip ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Banner({ tone, title, children, icon }: { tone: "demo" | "ok" | "warn" | "bad" | "info"; title?: string; children?: React.ReactNode; icon?: string }) {
  return (
    <div className={`op-banner ${tone}`} role={tone === "bad" ? "alert" : "status"}>
      {icon && <Icon name={icon} className="op-banner-icon" />}
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function DemoBanner() {
  const { t } = copyFor();
  return <Banner tone="demo" title={t("demo.badge")}>{t("demo.banner")}</Banner>;
}

export function StatusChip({ module, status }: { module: ModuleId; status: string | null }) {
  if (!status) return null;
  const s = moduleDef(module).statuses.find((x) => x.id === status);
  return <Chip tone={s?.tone ?? "neutral"}>{s?.label ?? status}</Chip>;
}

/** Score ring: 0–100 and the share of weight that could be scored. */
export function ScoreRing({ match }: { match: MatchResult | null }) {
  const score = match?.score ?? null;
  const cov = match ? Math.round(match.coverage * 100) : 0;
  return (
    <div className={`op-score${score === null ? " none" : ""}`} title="Comparative score — see the breakdown on the detail page">
      <div className="ring" style={{ ["--p" as string]: score ?? 0 }}>
        <span aria-hidden="true">{score === null ? "–" : Math.round(score)}</span>
      </div>
      <span className="sr-only">{score === null ? "No score: not enough data" : `Score ${Math.round(score)} out of 100`}, data coverage {cov}%</span>
      <span className="cov" aria-hidden="true">
        {cov}% data
      </span>
    </div>
  );
}

export function Bar({ value }: { value: number | null }) {
  return (
    <div className={`op-bar${value === null ? " null" : ""}`} role="img" aria-label={value === null ? "Not scored" : `${Math.round(value * 100)} out of 100`}>
      <i style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </div>
  );
}

/** The transparent score table: each component, its weight, its score and why. */
export function ScoreBreakdown({ match }: { match: MatchResult }) {
  const total = match.components.reduce((s, c) => s + c.weight, 0);
  return (
    <div className="table-wrap" style={{ border: 0 }}>
      <table className="op-breakdown">
        <caption className="sr-only">Score breakdown</caption>
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th scope="col">Weight</th>
            <th scope="col">Score</th>
            <th scope="col">How it was scored</th>
          </tr>
        </thead>
        <tbody>
          {match.components.map((c) => (
            <tr key={c.key}>
              <td>{c.label}</td>
              <td className="num">{total ? `${Math.round((c.weight / total) * 100)}%` : "—"}</td>
              <td>
                {c.score === null ? <span className="op-unknown">Not scored</span> : <Bar value={c.score} />}
              </td>
              <td className="small">{c.detail}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">100%</td>
            <td className="num">{match.score === null ? "—" : `${match.score} / 100`}</td>
            <td className="small muted">
              Weighted average of the scored criteria only. {Math.round(match.coverage * 100)}% of the weight could be scored; unscored criteria count neither for nor against.
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = /^https?:\/\//i.test(href) ? href : null;
  if (!safe) return <span>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
      {children} <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

const KIND_TONE: Record<string, Tone> = { published: "info", independently_verified: "ok", supplier_claim: "warn", third_party: "neutral", computed: "neutral", ai_summary: "neutral", user_input: "neutral" };

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  return (
    <ul className="op-evidence">
      {evidence.map((e, i) => (
        <li key={i}>
          <Chip tone={KIND_TONE[e.kind]}>{EVIDENCE_LABELS[e.kind]}</Chip>
          {e.sourceUrl ? <ExtLink href={e.sourceUrl}>{e.label ?? "Source"}</ExtLink> : <span>{e.label ?? e.provider}</span>}
          {e.publishedAt && <span>published {fmtDate(e.publishedAt)}</span>}
          <span>retrieved {fmtDate(e.retrievedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A field value with its state: unknown and conflicting values are always visibly marked. */
export function FieldValue({ def, k, field }: { def: ModuleDef<Record<string, unknown>>; k: string; field: Field | undefined }) {
  if (!field || field.state === "unknown") return <span className="op-unknown">Unknown{field?.note ? ` — ${field.note}` : ""}</span>;
  if (field.state === "conflict" && field.alternatives) {
    return (
      <div className="op-conflict">
        <Chip tone="warn">Sources disagree</Chip>
        <ul className="op-list-plain" style={{ marginTop: ".3rem" }}>
          {field.alternatives.map((a, i) => (
            <li key={i}>
              <strong>{def.formatField(k, { ...field, state: "known", value: a.value, raw: a.raw })}</strong>
              <EvidenceList evidence={a.evidence} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <span className="val">{def.formatField(k, field)}</span>;
}

/** One row of the detail page's facts list, with original wording and evidence for consequential fields. */
export function FieldRow({ def, k, field }: { def: ModuleDef<Record<string, unknown>>; k: string; field: Field | undefined }) {
  const critical = def.criticalFields.includes(k);
  const formatted = field && field.state === "known" ? def.formatField(k, field) : null;
  const showOriginal = critical && field?.state === "known" && field.raw && formatted !== field.raw;
  return (
    <div className={`op-field${critical ? " critical" : ""}`}>
      <dt>{def.fieldLabels[k] ?? k}</dt>
      <dd>
        <FieldValue def={def} k={k} field={field} />
        {field?.note && field.state !== "unknown" && <div className="op-fieldnote">{field.note}</div>}
        {field?.meta && (field.meta.granularity || field.meta.period) && (
          <div className="op-fieldnote">
            {[field.meta.granularity, field.meta.period && `Period: ${field.meta.period}`, field.meta.completeness === "incomplete" && "Source is incomplete"].filter(Boolean).join(" · ")}
          </div>
        )}
        {showOriginal && (
          <div className="op-original">
            <b>Original wording</b>
            {field!.raw}
          </div>
        )}
        {field && field.state === "known" && <EvidenceList evidence={field.evidence} />}
      </dd>
    </div>
  );
}

export function EmptyState({ title, children, icon = "search" }: { title: string; children?: React.ReactNode; icon?: string }) {
  return (
    <div className="op-empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** What happened in a search: complete, partial (some sources failed or warned) or failed. */
export function SearchStatus({ search }: { search: OppSearchRow }) {
  const runs = search.providers as ProviderRun[];
  const failed = runs.filter((r) => !r.ok);
  const sourceList = (
    <ul>
      {runs.map((r) => (
        <li key={r.provider}>
          {r.name}: {r.ok ? `${r.count} record${r.count === 1 ? "" : "s"}${r.cached ? " (cached copy)" : ""}` : `failed — ${r.error}`}
        </li>
      ))}
    </ul>
  );
  if (search.status === "failed")
    return (
      <Banner tone="bad" title="This search didn't complete" icon="alert">
        {runs.length > 0 ? (
          <>
            <p style={{ margin: ".2rem 0" }}>None of the sources answered, so there are no results.{search.mode === "live" ? " No demo data was used." : ""}</p>
            {sourceList}
          </>
        ) : (
          <p style={{ margin: ".2rem 0" }}>{search.error}</p>
        )}
      </Banner>
    );
  if (search.status === "partial")
    return (
      <Banner tone="warn" title="Partial results" icon="alert">
        <p style={{ margin: ".2rem 0" }}>
          {failed.length ? `${failed.length} of ${runs.length} sources didn't answer, so some matches may be missing.` : "Some sources returned incomplete data."}
        </p>
        {sourceList}
        {search.warnings.length > 0 && (
          <ul>
            {search.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </Banner>
    );
  return null;
}

export function ModuleCard({ id, saved }: { id: ModuleId; saved: number }) {
  const { mod } = copyFor();
  return (
    <Link href={`/opportunities/${id}`} className="op-module">
      <span className="icon">
        <Icon name={id} />
      </span>
      <h2>{mod(id, "name")}</h2>
      <p>{mod(id, "tagline")}</p>
      <span className="meta">
        <span>{saved} saved</span>
      </span>
    </Link>
  );
}
