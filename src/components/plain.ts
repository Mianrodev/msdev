/**
 * Plain-English wording for everything the UI shows. One place, so every
 * screen uses the same words and nothing technical leaks through.
 */
import type { RecordRow } from "@/db/schema";
import type { RunSummary } from "@/services/run-update";

/** The four lists a record can be on, in the words the UI uses. */
export const LISTS = {
  ready: {
    title: "Ready",
    short: "Ready",
    help: "Checked and qualified. Open one to read its prepared brief and answers, then apply yourself.",
  },
  checking: {
    title: "Being checked",
    short: "Being checked",
    help: "New or part-way through the checks. The weekly check moves these along for you.",
  },
  hold: {
    title: "On hold",
    short: "On hold",
    help: "Waiting for more information before a decision. Each one says why and what's needed.",
  },
  archive: {
    title: "Archived",
    short: "Archived",
    help: "Rejected or closed. Kept for your records — nothing is ever deleted.",
  },
  all: {
    title: "Everything",
    short: "Everything",
    help: "Every lead, whatever list it's on.",
  },
} as const;
export type ListKey = keyof typeof LISTS;

/** URL/view names used by the records service. */
export const LIST_TO_VIEW = {
  ready: "prospects",
  checking: "leads",
  hold: "hold",
  archive: "archive",
  all: "all",
} as const;

export const STEP_NAMES: Record<string, string> = {
  discovery: "New",
  screen: "First look done",
  triage: "Deeper look done",
  verify: "Final check done",
};

export const TIER_NAMES: Record<string, string> = {
  exceptional: "Exceptional fit",
  strong: "Strong fit",
  good: "Good fit",
  stretch: "Stretch",
};

export const DECISION_NAMES: Record<string, string> = {
  reject: "Not a fit",
  keep_possible: "Keep — possible",
  keep_stretch: "Keep — a stretch",
  keep_strong: "Keep — strong",
  top_priority: "Top priority",
  secondary: "Worth a look",
  hold_low_confidence: "Not sure yet — hold",
  remove: "Remove",
  tier_exceptional: "Ready — exceptional fit",
  tier_strong: "Ready — strong fit",
  tier_good: "Ready — good fit",
  tier_stretch: "Ready — stretch",
  hold_needs_info: "Needs more information — hold",
  archive: "Not a fit — archive",
  closed: "No longer open — archive",
};

export const DECISION_STEP_TITLES: Record<string, { title: string; question: string }> = {
  screen: { title: "Step 2 of 4 — First look", question: "Is this worth keeping?" },
  triage: { title: "Step 3 of 4 — Deeper look", question: "How promising is it?" },
  verify: {
    title: "Step 4 of 4 — Final check",
    question: "Is it still open and a real fit? If yes, it becomes Ready.",
  },
};

export const OUTREACH_NAMES: Record<string, string> = {
  not_started: "Not started",
  package_ready: "Package ready",
  approved: "Approved by you",
  sent_manually: "You applied / sent it",
  responded: "They replied",
  closed: "Closed",
};

export const SOURCE_NAMES: Record<string, string> = {
  unverified: "Not checked yet",
  verified: "Checked — still open",
  unreachable: "Couldn't reach it",
};

/** Which list a record is on. */
export function listOf(r: Pick<RecordRow, "status" | "stage">): ListKey {
  if (r.status === "archived") return "archive";
  if (r.status === "hold") return "hold";
  return r.stage === "verify" ? "ready" : "checking";
}

/** One short phrase describing where a record is. */
export function whereItIs(r: Pick<RecordRow, "status" | "stage" | "fitTier">): string {
  const list = listOf(r);
  if (list === "ready") return r.fitTier ? `Ready — ${TIER_NAMES[r.fitTier].toLowerCase()}` : "Ready";
  if (list === "checking") {
    return r.stage === "discovery" ? "New — not checked yet" : `Being checked (${STEP_NAMES[r.stage].toLowerCase()})`;
  }
  return LISTS[list].title;
}

/** camelCase / snake_case field names → "Words like this". */
export function humanize(field: string): string {
  const s = field
    .replace(/[_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDay(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtWhen(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The weekly check's result as a few short, plain sentences. */
export function describeRun(s: RunSummary): string[] {
  const lines: string[] = [];
  const r = s.reconciliation;
  const recChanged = s.changes.filter((c) => c.from === "active" || c.from === "hold");
  lines.push(
    `Re-checked ${plural(r.prospectsChecked, "Ready lead")} and ${plural(r.heldChecked, "On-hold lead")} against your rules.`,
  );
  // Distinct leads processed: a lead that passes Screen is counted again at Triage in the same run.
  const st = s.stages;
  const newIn = st.screen.in + (st.triage.in - st.screen.advanced) + (st.verify.in - st.triage.advanced);
  if (newIn === 0) lines.push("No new or unfinished leads to process.");
  else {
    const became = s.stages.verify.advanced;
    lines.push(`Moved ${plural(newIn, "waiting lead")} through the checks — ${became} became Ready.`);
  }
  if (s.movedToHold || s.movedToArchive) {
    const parts = [];
    if (s.movedToHold) parts.push(`${plural(s.movedToHold, "lead")} moved to On hold`);
    if (s.movedToArchive) parts.push(`${plural(s.movedToArchive, "lead")} moved to Archived`);
    lines.push(`${parts.join(" and ")}. Open them to see why.`);
  } else if (recChanged.length === 0) {
    lines.push("Nothing needed to move.");
  }
  const tiers = Object.entries(s.activeProspectsByTier)
    .sort(([a], [b]) => ["exceptional", "strong", "good", "stretch", "untiered"].indexOf(a) - ["exceptional", "strong", "good", "stretch", "untiered"].indexOf(b))
    .map(([k, v]) => `${v} ${k === "untiered" ? "without a fit rating" : (TIER_NAMES[k] ?? k).toLowerCase()}`);
  const total = Object.values(s.activeProspectsByTier).reduce((a, b) => a + b, 0);
  lines.push(total ? `You now have ${plural(total, "Ready lead")}: ${tiers.join(", ")}.` : "You have no Ready leads right now.");
  return lines;
}

/** Friendly names for Activity log events. */
export function eventName(event: string): string {
  const map: Record<string, string> = {
    created: "Added",
    updated: "Edited",
    dedup_merge: "Updated (same lead added again)",
    "stage.screen": "First look decided",
    "stage.triage": "Deeper look decided",
    "stage.verify": "Final check decided",
    "status.hold": "Put on hold",
    "status.archived": "Archived",
    "status.restored": "Put back",
    "status.tracking": "Tracking",
    source_verification: "Link checked",
    fit_tier: "Fit rating changed",
    outreach: "Application / outreach updated",
    reconcile: "Re-checked by weekly check",
    run: "Re-check run",
    run_update: "Weekly check run",
    "import.state": "Imported",
    "import.history.reconciliation": "Old history (from spreadsheet)",
    "import.history.activity_log": "Old activity (from spreadsheet)",
    workbook_import: "Spreadsheet uploaded",
    "export.shared": "Shared copy downloaded",
    "export.internal": "Full backup downloaded",
  };
  return map[event] ?? humanize(event);
}

export function actorName(actor: string): string {
  if (actor.startsWith("human:")) return "You";
  if (actor.startsWith("system:run-update")) return "Weekly check";
  if (actor.startsWith("system:reconciliation")) return "Weekly check";
  if (actor.startsWith("import:")) return "Upload";
  if (actor.startsWith("system:")) return "The app";
  return actor;
}

/** Status strings stored in History ("verify/active") → plain words. */
export function statusPhrase(s: string | null | undefined): string {
  if (!s) return "—";
  const m = s.match(/^(discovery|screen|triage|verify)\/(active|hold|archived)$/);
  if (m) return whereItIs({ stage: m[1] as RecordRow["stage"], status: m[2] as RecordRow["status"], fitTier: null });
  return OUTREACH_NAMES[s] ?? SOURCE_NAMES[s] ?? TIER_NAMES[s] ?? humanize(s);
}
