import { assertCan } from "@/core/permissions";
import { redactRow, TARGET_ACCOUNT_FIELD_CLASSES, type ExportMode } from "@/core/redaction";
import type { Ctx } from "./context";
import { listAccounts } from "./accounts";
import { logHistory } from "./history";
import { listRecords, type ListFilter } from "./records";
import { getIdentityTerms } from "./rules";
import { LISTS, listOf, OUTREACH_NAMES, SOURCE_NAMES, TIER_NAMES, whereItIs } from "@/components/plain";
import type { RecordRow } from "@/db/schema";

/** Facts the search writes about a job: safe to share, unlike the imported spreadsheet's leftover columns. */
const SHARED_FACTS = [
  "remoteCheck",
  "openToYourRegion",
  "whoCanApply",
  "verifiedOpen",
  "employer",
  "postingLocation",
  "workplaceType",
  "employmentType",
  "compensation",
  "postedOn",
  "foundOn",
  "genuine",
  "appliedOn",
];

/** The columns a person reads first, in plain words, with codes turned into names. */
function readable(r: RecordRow, mode: ExportMode): Record<string, unknown> {
  const a = r.attributes as Record<string, unknown>;
  const fact = (k: string) => (typeof a[k] === "string" ? a[k] : "");
  const row: Record<string, unknown> = {
    Company: r.account,
    "Job title": r.opportunity,
    List: LISTS[listOf(r)].title,
    "Where it is": whereItIs(r),
    Fit: r.fitTier ? TIER_NAMES[r.fitTier] : listOf(r) === "ready" ? "Not yet rated" : "",
    "Why it's here": r.fitRationale ?? r.verifyReason ?? r.holdReason ?? r.archiveReason ?? "",
    "Your application": OUTREACH_NAMES[r.outreachStatus] ?? r.outreachStatus,
    "Applied on": fact("appliedOn"),
    Link: r.nextStepUrl ?? r.sourceUrl ?? "",
    Location: fact("postingLocation") || r.location || "",
    "Really remote?": fact("remoteCheck"),
    "Open to your region?": fact("openToYourRegion"),
    "Who can apply?": fact("whoCanApply"),
    "Still listed?": fact("verifiedOpen") || SOURCE_NAMES[r.sourceVerification],
    "Posted by the employer?": fact("employer"),
    Pay: fact("compensation"),
    Posted: fact("postedOn"),
    "Found on": fact("foundOn") || r.sourceBoard || "",
    "Date found": r.dateFound ?? "",
    "Last changed": r.updatedAt,
  };
  if (mode === "internal") {
    Object.assign(row, {
      Notes: r.notes ?? "",
      "Prepared brief": r.preparedBrief ?? "",
      "Prepared answers": r.preparedAnswers ?? "",
      Requirements: r.requirements ?? "",
      "Gaps (must-haves)": r.gapsHard ?? "",
      "Gaps (nice-to-haves)": r.gapsSoft ?? "",
      "Next action": r.nextAction ?? "",
      "Response notes": r.responseNotes ?? "",
      "Contact name": r.contactName ?? "",
      "Contact email": r.contactEmail ?? "",
      "Contact phone": r.contactPhone ?? "",
      "Contact profile": r.contactProfileUrl ?? "",
      "Other details": JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k]) => !SHARED_FACTS.includes(k)))),
      "Listing text": typeof r.extra.postingSummary === "string" ? r.extra.postingSummary : "",
      Id: r.id,
    });
  } else {
    row.Id = r.id;
  }
  return row;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], header: (col: string) => string = (c) => c): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    [cols.map((c) => csvCell(header(c))).join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") +
    "\r\n"
  );
}

/**
 * Export records. `shared` (the default) drops restricted fields and scrubs
 * identity terms, emails and phone numbers — safe to hand to a third party.
 * `internal` is everything, for the owner's own backups.
 */
export async function exportRecords(ctx: Ctx, mode: ExportMode, filter: ListFilter = {}) {
  assertCan(ctx.actor, mode === "internal" ? "export.internal" : "export.shared");
  const terms = await getIdentityTerms(ctx);
  // Readable columns first; the shared copy keeps only the search's own facts and is scrubbed of identity terms.
  const rows = (await listRecords(ctx, { ...filter, limit: 100_000 })).map((r) => {
    const classes: Record<string, "public" | "internal" | "restricted"> = Object.fromEntries(
      Object.keys(readable(r, mode)).map((k) => [
        k,
        [
          "Notes",
          "Prepared brief",
          "Prepared answers",
          "Gaps (must-haves)",
          "Gaps (nice-to-haves)",
          "Response notes",
          "Contact name",
          "Contact email",
          "Contact phone",
          "Contact profile",
          "Other details",
          "Listing text",
        ].includes(k)
          ? "restricted"
          : "internal",
      ]),
    );
    return redactRow(readable(r, mode), classes, mode, terms);
  });
  await logHistory(ctx, {
    entityType: "record",
    event: `export.${mode}`,
    reason: `Downloaded ${rows.length} leads (${mode === "shared" ? "shared copy" : "full backup"})`,
    detail: { filter: { ...filter } },
  });
  return rows;
}

export async function exportAccounts(ctx: Ctx, mode: ExportMode) {
  assertCan(ctx.actor, mode === "internal" ? "export.internal" : "export.shared");
  const terms = await getIdentityTerms(ctx);
  const rows = (await listAccounts(ctx)).map((a) => {
    const { workspaceId: _w, dedupKey: _d, ...rest } = a;
    return redactRow(rest, TARGET_ACCOUNT_FIELD_CLASSES, mode, terms);
  });
  await logHistory(ctx, {
    entityType: "target_account",
    event: `export.${mode}`,
    reason: `Downloaded ${rows.length} companies (${mode === "shared" ? "shared copy" : "full backup"})`,
  });
  return rows;
}
