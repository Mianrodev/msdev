/**
 * Plain-English wording for everything the UI shows. One place, so every
 * screen uses the same words and nothing technical leaks through.
 */
import { APPLIED_OUTREACH, type OutreachStatus } from "@/core/types";
import type { RecordRow } from "@/db/schema";
import type { DiscoveryReport } from "@/services/discovery";
import type { RunSummary } from "@/services/run-update";

/** The four lists a record can be on, in the words the UI uses. */
export const LISTS = {
  applied: {
    title: "Applied",
    short: "Applied",
    help: "Everything you've applied to, and where each application stands. Change the status from the drop-down as you hear back.",
  },
  review: {
    title: "New to review",
    short: "New to review",
    help: "Jobs the app couldn't sort by itself (a fact is missing). Usually empty. Open each one and choose Yes, Not sure or No.",
  },
  ready: {
    title: "Ready",
    short: "Ready",
    help: "Remote, open to you and still listed — the app checked. Apply to these, best fit first, then mark each one Applied.",
  },
  checking: {
    title: "Being checked",
    short: "Being checked",
    help: "Added by hand or by your AI and not yet through the checks. Find new leads moves them along.",
  },
  hold: {
    title: "On hold",
    short: "On hold",
    help: "Something needs a look first (a recruiter posting, pay unknown, not sure it's open to you). Each one says why.",
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
  applied: "applied",
  review: "review",
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
  sent_manually: "Applied",
  responded: "Heard back",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Not successful",
  closed: "Withdrew / stopped",
};

/** The application tracker drop-down: what you can say about a lead, in order. */
export const APPLICATION_CHOICES = [
  ["not_started", "Not applied yet"],
  ["sent_manually", "Applied"],
  ["responded", "Heard back"],
  ["interviewing", "Interviewing"],
  ["offer", "Offer 🎉"],
  ["rejected", "Not successful"],
  ["closed", "Withdrew / stopped"],
] as const;

export const SOURCE_NAMES: Record<string, string> = {
  unverified: "Not checked yet",
  verified: "Checked — still open",
  unreachable: "Couldn't reach it",
};

/** Which list a record is on. */
type ListInput = Pick<RecordRow, "status" | "stage"> & { origin?: string; outreachStatus?: string; attributes?: Record<string, unknown> };

/** You've applied (or applied and then withdrew) — the lead lives on the Applied list. */
export function applied(r: { outreachStatus?: string; attributes?: Record<string, unknown> }): boolean {
  if (!r.outreachStatus) return false;
  return APPLIED_OUTREACH.includes(r.outreachStatus as OutreachStatus) || (r.outreachStatus === "closed" && !!r.attributes && "appliedOn" in r.attributes);
}

export function listOf(r: ListInput): ListKey {
  if (applied(r)) return "applied";
  if (r.status === "archived") return "archive";
  if (r.status === "hold") return "hold";
  if (r.stage === "verify") return "ready";
  if (r.origin === "discovery" && (r.stage === "discovery" || r.stage === "screen")) return "review";
  return "checking";
}

/** One short phrase describing where a record is. */
export function whereItIs(r: ListInput & Pick<RecordRow, "fitTier">): string {
  const list = listOf(r);
  if (list === "applied") return r.outreachStatus === "sent_manually" ? "Applied" : `Applied — ${OUTREACH_NAMES[r.outreachStatus ?? ""]}`;
  if (list === "review") return "New — waiting for your review";
  if (list === "ready") return r.fitTier ? `Ready — ${TIER_NAMES[r.fitTier].toLowerCase()}` : "Ready — not yet rated";
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
    job_board_search: "Job boards searched",
    owner_opened_space: "The owner opened this space",
    company_board_found: "New company found",
    "import.state": "Imported",
    "import.history.reconciliation": "Old history (from spreadsheet)",
    "import.history.activity_log": "Old activity (from spreadsheet)",
    workbook_import: "Spreadsheet uploaded",
    "export.shared": "Shared copy downloaded",
    "export.internal": "Full backup downloaded",
  };
  return map[event] ?? humanize(event);
}

/** Who did something, from the reader's point of view: "You", or the person's name. */
export interface Viewer {
  me: string;
  names: Record<string, string>;
}

export function actorName(actor: string, viewer?: Viewer): string {
  if (actor.startsWith("human:")) {
    const id = actor.slice("human:".length);
    if (!viewer || id === viewer.me) return "You";
    return viewer.names[id] ?? "A team member";
  }
  if (actor.startsWith("system:run-update")) return "Weekly check";
  if (actor.startsWith("system:reconciliation")) return "Weekly check";
  if (actor.startsWith("system:job-board-search")) return "Job board search";
  if (actor.startsWith("system:your-ai")) return "Your AI";
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

/** The job board search result as a few short, plain sentences. */
export function describeSearch(d: DiscoveryReport): string[] {
  const lines = [
    `Searched ${plural(d.boardsChecked, "company job board")} (${d.jobsSeen.toLocaleString("en-GB")} open jobs).`,
    d.newLeads
      ? `Found ${plural(d.newLeads, "new job")} matching your words and rules — they're in New to review.`
      : "No new matching jobs this time.",
  ];
  if (d.filteredOut) lines.push(`Skipped ${plural(d.filteredOut, "matching job")} that fail a check (not clearly remote, limited to another country, or another region). Find leads lists them, with the reason.`);
  if (d.stillOpen || d.closed) {
    lines.push(`Checked your leads' links: ${d.stillOpen} still open, ${d.closed} no longer listed (closed).`);
  }
  const confirmed = d.companiesConfirmed?.length ?? 0;
  if (d.sitesChecked !== undefined) {
    lines.push(
      confirmed
        ? `Remote-job sites: found ${plural(confirmed, "new company", "new companies")} and confirmed the jobs on their own careers pages — they're watched from now on.`
        : `Remote-job sites: no new companies confirmed this time.`,
    );
  }
  if (d.pagesConfirmed)
    lines.push(
      `${plural(d.pagesConfirmed, "job")} confirmed by opening the job's own page on the company's careers system (Workday, BambooHR, their website…) and added.`,
    );
  if (d.notConfirmedTotal)
    lines.push(`${plural(d.notConfirmedTotal, "job")} on remote-job sites couldn't be confirmed with the company, so ${d.notConfirmedTotal === 1 ? "it wasn't" : "they weren't"} added (see Find leads to check them yourself).`);
  if (d.warningSkipped) lines.push(`Dropped ${plural(d.warningSkipped, "listing")} showing scam warning signs.`);
  if (d.unread) lines.push(`${plural(d.unread, "matching job")} couldn't be read fully this time, so ${d.unread === 1 ? "it wasn't" : "they weren't"} added yet; the next search tries again.`);
  if (d.capped) lines.push("There were more new jobs than one search adds — the rest will come in next time.");
  if (d.data) {
    const mb = d.data.downloadedKb >= 1024 ? `${(d.data.downloadedKb / 1024).toFixed(1)} MB` : `${d.data.downloadedKb} KB`;
    // The size of the listings as read; boards send them compressed, so less than this crosses the network.
    lines.push(
      d.data.boardsReused
        ? `Read ${mb} of new listings; reused ${plural(d.data.boardsReused, "company board")} already read in the last 12 hours (saves data).`
        : `Read ${mb} of listings.`,
    );
  }
  if (d.boardsFailed.length) lines.push(`${plural(d.boardsFailed.length, "board")} couldn't be read this time (see Find leads).`);
  if (d.sitesFailed?.length) lines.push(`${plural(d.sitesFailed.length, "remote-job site")} couldn't be read this time.`);
  return lines;
}
