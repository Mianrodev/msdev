/**
 * Data classification + redaction for anything that leaves the app.
 *
 * Every exportable column has a class:
 *  - public:     safe to share
 *  - internal:   shareable after scrubbing
 *  - restricted: never in shared output (private notes)
 *
 * On top of dropping restricted columns, shared output is scrubbed of any email address or phone
 * number (and of any extra terms the caller passes).
 */

export type DataClass = "public" | "internal" | "restricted";

export const REDACTED = "[REDACTED]";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 7+ digit sequences with common separators, e.g. +1 (305) 555-0100, 305.555.0100
const PHONE = /(?:\+?\d[\s().-]*){7,}\d/g;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubText(text: string, identityTerms: readonly string[]): string {
  let out = text.replace(EMAIL, REDACTED).replace(PHONE, (m) => (/\d{4}-\d{2}-\d{2}/.test(m) ? m : REDACTED));
  for (const term of identityTerms) {
    const t = term.trim();
    if (t.length < 2) continue;
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRegex(t)}(?![A-Za-z0-9])`, "gi"), REDACTED);
  }
  return out;
}

function scrubValue(v: unknown, terms: readonly string[]): unknown {
  if (typeof v === "string") return scrubText(v, terms);
  if (Array.isArray(v)) return v.map((x) => scrubValue(x, terms));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubValue(x, terms)]));
  }
  return v;
}

export type ExportMode = "shared" | "internal";

/**
 * Project a row for export. Unclassified fields are treated as restricted, so a
 * newly added column never leaks by default.
 */
export function redactRow(
  row: Record<string, unknown>,
  classes: Record<string, DataClass>,
  mode: ExportMode,
  identityTerms: readonly string[],
): Record<string, unknown> {
  if (mode === "internal") return { ...row };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const cls = classes[k] ?? "restricted";
    if (cls === "restricted") continue;
    out[k] = scrubValue(v, identityTerms);
  }
  return out;
}
