/**
 * Building and reading `Field`s. The rules that keep the product honest live here:
 *  - a blank or "unknown"-ish value is `unknown`, never an empty string or a guess;
 *  - several sources that agree make one known value with all their evidence;
 *  - sources that disagree make a `conflict` that keeps every value and its source.
 */
import { isUnknown } from "@/core/types";
import type { Evidence, Field, Fields } from "./types";

export function known<T>(value: T, evidence: Evidence | Evidence[], raw?: string | null, note?: string): Field<T> {
  return {
    state: "known",
    value,
    raw: raw ?? (typeof value === "string" ? value : Array.isArray(value) ? (value.every((x) => typeof x !== "object" || x === null) ? value.map(String).join("; ") : null) : value == null || typeof value === "object" ? null : String(value)),
    evidence: Array.isArray(evidence) ? evidence : [evidence],
    ...(note ? { note } : {}),
  };
}

export function unknown<T = never>(note?: string, evidence: Evidence[] = []): Field<T> {
  return { state: "unknown", value: null, raw: null, evidence, ...(note ? { note } : {}) };
}

/** A value from one source: unknown when blank or when the source itself says it's not stated. */
export function fromSource<T>(value: T | null | undefined, evidence: Evidence, raw?: string | null, note?: string): Field<T> {
  if (value === null || value === undefined || (typeof value === "string" && isUnknown(value))) return unknown(note);
  if (Array.isArray(value) && value.length === 0) return unknown(note);
  return known(value, evidence, raw, note);
}

const same = (a: unknown, b: unknown) => JSON.stringify(normal(a)) === JSON.stringify(normal(b));
const normal = (v: unknown): unknown =>
  typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : Array.isArray(v) ? v.map(normal) : v;

/**
 * Combine what several sources say about one fact. Agreeing values merge their evidence;
 * disagreeing values become a conflict listing each. The first source's value stays "preferred".
 */
export function combine<T>(...fields: Field<T>[]): Field<T> {
  const knownOnes = fields.filter((f) => f.state !== "unknown");
  if (!knownOnes.length) return unknown(fields.find((f) => f.note)?.note);
  const groups: { value: T | null; raw: string | null; evidence: Evidence[] }[] = [];
  for (const f of knownOnes) {
    const options = f.state === "conflict" && f.alternatives ? f.alternatives : [{ value: f.value, raw: f.raw, evidence: f.evidence }];
    for (const o of options) {
      const g = groups.find((x) => same(x.value, o.value));
      if (g) g.evidence.push(...o.evidence);
      else groups.push({ value: o.value, raw: o.raw, evidence: [...o.evidence] });
    }
  }
  const note = knownOnes.find((f) => f.note)?.note;
  if (groups.length === 1) return { state: "known", value: groups[0].value, raw: groups[0].raw, evidence: groups[0].evidence, ...(note ? { note } : {}) };
  return {
    state: "conflict",
    value: groups[0].value,
    raw: groups[0].raw,
    evidence: groups.flatMap((g) => g.evidence),
    alternatives: groups,
    note: note ?? "Sources disagree — check each source",
  };
}

export function isKnown<T>(f: Field<T> | undefined): f is Field<T> & { value: T } {
  return !!f && f.state === "known" && f.value !== null;
}

/** The value if known or in conflict (preferred value), else null. Callers must still show conflicts. */
export function valueOf<T>(f: Field<T> | undefined): T | null {
  return f && f.state !== "unknown" ? f.value : null;
}

/** Share of the listed fields that are known (conflicts count half: there is a value, but it's disputed). */
export function completeness(fields: Fields, keys: readonly string[]): { known: number; total: number; ratio: number; missing: string[] } {
  let n = 0;
  const missing: string[] = [];
  for (const k of keys) {
    const f = fields[k];
    if (f?.state === "known") n += 1;
    else if (f?.state === "conflict") n += 0.5;
    else missing.push(k);
  }
  return { known: n, total: keys.length, ratio: keys.length ? n / keys.length : 0, missing };
}

/** Text for a field in a table cell or CSV. Unknowns say so; conflicts list each value. */
export function displayValue(f: Field | undefined, format: (v: unknown) => string = defaultFormat): string {
  if (!f || f.state === "unknown") return "Unknown";
  if (f.state === "conflict" && f.alternatives) return `Conflicting: ${f.alternatives.map((a) => format(a.value)).join(" vs ")}`;
  return format(f.value);
}

function defaultFormat(v: unknown): string {
  if (v === null || v === undefined) return "Unknown";
  if (Array.isArray(v)) return v.map(defaultFormat).join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Every distinct source URL behind an item's fields, for the "Sources" list and exports. */
export function sourcesOf(fields: Fields): Evidence[] {
  const seen = new Map<string, Evidence>();
  for (const f of Object.values(fields)) {
    for (const e of [...f.evidence, ...(f.alternatives?.flatMap((a) => a.evidence) ?? [])]) {
      const k = `${e.provider}|${e.sourceUrl ?? ""}|${e.label ?? ""}`;
      if (!seen.has(k)) seen.set(k, e);
    }
  }
  return [...seen.values()];
}
