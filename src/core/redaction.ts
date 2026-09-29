/**
 * Data classification + redaction for anything that leaves the app.
 *
 * Every exportable field has a class:
 *  - public:     safe to share (account, opportunity, stage, URLs, …)
 *  - internal:   shareable after identity scrubbing (rationale, verdict reasons)
 *  - restricted: never in shared output (prepared briefs/answers, notes,
 *                personal contact details, unmapped imported columns)
 *
 * On top of dropping restricted fields, shared output is scrubbed of the
 * owner's identity terms (name, personal contacts, current employer — stored in
 * Settings) and of any email address or phone number.
 */

export type DataClass = "public" | "internal" | "restricted";

export const RECORD_FIELD_CLASSES: Record<string, DataClass> = {
  id: "public",
  account: "public",
  opportunity: "public",
  sourceUrl: "public",
  nextStepUrl: "public",
  sourceBoard: "public",
  location: "public",
  dateFound: "public",
  stage: "public",
  status: "public",
  fitTier: "public",
  sourceVerification: "public",
  outreachStatus: "internal",
  screenVerdict: "internal",
  screenReason: "internal",
  screenConfidence: "internal",
  triageVerdict: "internal",
  triageReason: "internal",
  triageConfidence: "internal",
  verifyVerdict: "internal",
  verifyReason: "internal",
  verifyConfidence: "internal",
  locationFit: "internal",
  valueFit: "internal",
  requirements: "internal",
  gapsHard: "restricted",
  gapsSoft: "restricted",
  discoveryVerdict: "internal",
  discoveryReason: "internal",
  lastVerifiedAt: "public",
  responseNotes: "restricted",
  contactName: "restricted",
  contactEmail: "restricted",
  contactPhone: "restricted",
  contactProfileUrl: "restricted",
  fitRationale: "internal",
  preparedBrief: "restricted",
  preparedAnswers: "restricted",
  holdReason: "internal",
  nextAction: "internal",
  archiveReason: "internal",
  notes: "restricted",
  attributes: "internal",
  extra: "restricted",
  createdAt: "public",
  updatedAt: "public",
};

export const TARGET_ACCOUNT_FIELD_CLASSES: Record<string, DataClass> = {
  id: "public",
  name: "public",
  website: "public",
  sourceUrl: "public",
  fit: "internal",
  description: "public",
  attributes: "internal",
  preparedBriefLong: "restricted",
  responseNotes: "restricted",
  contactName: "restricted",
  contactEmail: "restricted",
  contactPhone: "restricted",
  contactProfileUrl: "restricted",
  status: "public",
  evidence: "internal",
  fitRationale: "internal",
  preparedBrief: "restricted",
  notes: "restricted",
  archiveReason: "internal",
  extra: "restricted",
  createdAt: "public",
  updatedAt: "public",
};

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
