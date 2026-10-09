/** Search form and result views shared by all four modules. Server components. */
import Link from "next/link";
import { saveAction } from "@/app/opportunities/actions";
import { copyFor } from "@/brand/copy";
import type { FilterDef, ModuleDef } from "@/core/opportunities/module";
import { DEFAULT_WEIGHTS } from "@/core/opportunities/modules/expansion";
import { SIMULATIONS } from "@/core/opportunities/query";
import type { MatchResult, ModuleId } from "@/core/opportunities/types";
import type { OppItemRow } from "@/db/schema";
import type { ResultRow } from "@/services/opportunities/items";
import { toNormalized } from "@/services/opportunities/items";
import { PendingButton, RangeField, SearchSubmit } from "./client";
import { ModeChip, ScoreRing, StatusChip } from "./ui";

type Q = Record<string, unknown>;

const asText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v));

function FilterInput({ f, q }: { f: FilterDef; q: Q }) {
  const id = `f-${f.name}`;
  const v = q[f.name];
  const hint = f.hint ? (
    <span className="hint" id={`${id}-hint`}>
      {f.hint}
    </span>
  ) : null;
  const described = f.hint ? `${id}-hint` : undefined;
  switch (f.type) {
    case "textarea":
      return (
        <label htmlFor={id}>
          {f.label}
          <textarea id={id} name={f.name} rows={3} defaultValue={asText(v)} placeholder={f.placeholder} aria-describedby={described} maxLength={2000} />
          {hint}
        </label>
      );
    case "select":
      return (
        <label htmlFor={id}>
          {f.label}
          <select id={id} name={f.name} defaultValue={asText(v)} aria-describedby={described}>
            {f.options!.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          {hint}
        </label>
      );
    case "checkbox":
      return (
        <label className="check" htmlFor={id}>
          <input id={id} type="checkbox" name={f.name} defaultChecked={v === true} /> {f.label}
        </label>
      );
    case "range":
      return <RangeField name={f.name} label={f.label} defaultValue={typeof v === "number" ? v : (DEFAULT_WEIGHTS[f.name as keyof typeof DEFAULT_WEIGHTS] ?? 3)} min={f.min} max={f.max} step={f.step} />;
    default:
      return (
        <label htmlFor={id}>
          {f.label}
          <input id={id} name={f.name} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={f.min} defaultValue={asText(v)} placeholder={f.placeholder} aria-describedby={described} inputMode={f.type === "number" ? "decimal" : undefined} />
          {hint}
        </label>
      );
  }
}

export function SearchForm({
  module,
  def,
  query,
  action,
  live,
  view,
  liveScope = [],
  liveSummary = [],
}: {
  module: ModuleId;
  def: ModuleDef<Q>;
  query: Q;
  action: (f: FormData) => Promise<void>;
  live: { ok: boolean; reason: string };
  view: string;
  /** What live search can see, from each live provider — shown before searching. */
  liveScope?: string[];
  /** One-line version, always visible. */
  liveSummary?: string[];
}) {
  const { t } = copyFor();
  const groups = [...new Set(def.filters.map((f) => f.group))];
  const mode = query.mode === "live" && live.ok ? "live" : "demo";
  return (
    <details className="op-filters" id="filters" open>
      <summary>Search filters</summary>
      <form action={action} aria-label={`Search ${module}`}>
        <input type="hidden" name="view" value={view} />
        <fieldset>
          <legend>Data</legend>
          <div className="op-mode" role="radiogroup" aria-label="Data source">
            <label>
              <input type="radio" name="mode" value="demo" defaultChecked={mode === "demo"} /> Demo
            </label>
            <label title={live.ok ? "Search the connected live sources" : live.reason}>
              <input type="radio" name="mode" value="live" defaultChecked={mode === "live"} disabled={!live.ok} /> Live
            </label>
          </div>
          {!live.ok && <span className="muted small">Live unavailable: {live.reason}</span>}
          {live.ok && liveScope.length > 0 && (
            <details className="op-coverage">
              <summary>{liveSummary.join(" ") || "What live search covers"} More…</summary>
              {liveScope.map((c) => (
                <p key={c}>{c}</p>
              ))}
              <p>No results means no match among the notices read — not that no relevant tenders exist.</p>
            </details>
          )}
        </fieldset>
        {groups.map((g) => {
          const fs = def.filters.filter((f) => f.group === g);
          return (
            <fieldset key={g}>
              <legend>{g}</legend>
              {fs.map((f) => (
                <FilterInput key={f.name} f={f} q={query} />
              ))}
            </fieldset>
          );
        })}
        <fieldset>
          <legend>Demo only</legend>
          <label htmlFor="f-simulate">
            Simulate a source problem
            <select id="f-simulate" name="simulate" defaultValue={asText(query.simulate) || "none"}>
              {SIMULATIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "none" ? "No problems" : s === "one_source_fails" ? "One source times out (partial results)" : "All sources fail (error state)"}
                </option>
              ))}
            </select>
            <span className="hint">Ignored in live mode.</span>
          </label>
        </fieldset>
        <div className="actions">
          <SearchSubmit label={t("search.button")} pending={t("search.pending")} />
        </div>
      </form>
    </details>
  );
}

function CellText({ text }: { text: string }) {
  if (text === "Unknown" || text.startsWith("Not published") || text.startsWith("Not confirmed")) return <span className="op-unknown">{text}</span>;
  if (text.startsWith("Conflicting")) return <span className="op-conflict">⚠ {text}</span>;
  return <>{text}</>;
}

function detailHref(module: ModuleId, id: string, searchId?: string) {
  return `/opportunities/${module}/${id}${searchId ? `?search=${searchId}` : ""}`;
}

export function ResultCard({ module, def, row, searchId, back }: { module: ModuleId; def: ModuleDef<Q>; row: { item: OppItemRow; match: MatchResult | null; rank?: number }; searchId?: string; back: string }) {
  const { item, match } = row;
  const it = toNormalized(item);
  const cols = def.columns.filter((c) => c.inTable);
  const flags = match ? [...(match.excluded ? [match.excluded] : []), ...match.flags] : [];
  const href = detailHref(module, item.id, searchId);
  return (
    <li className={`op-card${match?.excluded ? " excluded" : ""}`}>
      <ScoreRing match={match} />
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: ".35rem", marginBottom: ".25rem" }}>
          {row.rank !== undefined && <span className="muted small">#{row.rank}</span>}
          <ModeChip mode={item.mode} />
          <StatusChip module={module} status={item.status} />
        </div>
        <h3>
          <Link href={href}>{item.title}</Link>
        </h3>
        {item.subtitle && <div className="sub">{item.subtitle}</div>}
        <dl className="facts">
          {cols.map((c) => (
            <div key={c.key}>
              <dt>{c.label}</dt>
              <dd>
                <CellText text={c.text(it)} />
              </dd>
            </div>
          ))}
        </dl>
        {match && match.reasons.length > 0 && <p className="why">{match.reasons.slice(0, 2).join(" ")}</p>}
        {flags.length > 0 && (
          <ul className="check" aria-label="Things to check">
            {flags.slice(0, 3).map((f) => (
              <li key={f}>{f}</li>
            ))}
            {flags.length > 3 && <li>{flags.length - 3} more on the detail page</li>}
          </ul>
        )}
        <div className="actions">
          <Link className="button small primary" href={href}>
            Details & evidence
          </Link>
          {!item.savedAt ? (
            <form action={saveAction.bind(null, item.id)}>
              <input type="hidden" name="back" value={back} />
              <PendingButton className="small" pending="Saving…">
                Save
              </PendingButton>
            </form>
          ) : (
            <span className="muted small">Saved</span>
          )}
          {item.sourceUrl && (
            <a className="small" href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
              Source ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
      <div className="select">
        <label>
          <input type="checkbox" name="ids" value={item.id} form="compare-form" /> Compare
        </label>
      </div>
    </li>
  );
}

export function ResultsTable({ module, def, rows, searchId }: { module: ModuleId; def: ModuleDef<Q>; rows: ResultRow[]; searchId?: string }) {
  const cols = def.columns.filter((c) => c.inTable);
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Search results</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Compare</span>
            </th>
            <th scope="col">#</th>
            <th scope="col">Name</th>
            <th scope="col">Score</th>
            <th scope="col">Data</th>
            {cols.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const it = toNormalized(r.item);
            return (
              <tr key={r.item.id}>
                <td>
                  <input type="checkbox" name="ids" value={r.item.id} form="compare-form" aria-label={`Compare ${r.item.title}`} />
                </td>
                <td>{r.rank}</td>
                <td className="wrap">
                  <Link href={detailHref(module, r.item.id, searchId)}>{r.item.title}</Link>
                  {r.match.excluded && <div className="small" style={{ color: "var(--warn)" }}>{r.match.excluded}</div>}
                  <div className="muted small">{r.item.subtitle}</div>
                </td>
                <td>{r.match.score === null ? <span className="op-unknown">—</span> : Math.round(r.match.score)}</td>
                <td>{Math.round(r.match.coverage * 100)}%</td>
                {cols.map((c) => (
                  <td key={c.key} className="wrap">
                    <CellText text={c.text(it)} />
                  </td>
                ))}
                <td>
                  <StatusChip module={module} status={r.item.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
