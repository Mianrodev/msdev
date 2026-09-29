/**
 * Domain vocabulary. Deliberately generic (account / opportunity / stage) so the
 * same pipeline serves sales leads, partnerships, recruiting, etc.
 */

/** Sentinel for a fact that is not known. Never guess — store this instead. */
export const UNKNOWN = "UNKNOWN" as const;
export type Unknown = typeof UNKNOWN;

/**
 * True for blank values and for values that *say* they're unknown:
 * "UNKNOWN", "Unknown (not disclosed)", "NOT DISCLOSED", "N/A".
 */
export function isUnknown(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toUpperCase();
  return s === "" || /^(UNKNOWN|NOT DISCLOSED|NOT STATED|N\/A)(?![A-Z0-9])/.test(s);
}

/**
 * Pipeline stages, in order. A record's `stage` is the furthest stage it has
 * completed. `discovery` = just captured, awaiting screen.
 */
export const STAGES = ["discovery", "screen", "triage", "verify"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  discovery: "1. Discovery",
  screen: "2. Screen",
  triage: "2.5 Triage",
  verify: "3. Verify",
};

/** The stage whose decision is due next, or null once verified. */
export function nextStage(stage: Stage): Exclude<Stage, "discovery"> | null {
  const i = STAGES.indexOf(stage);
  return (STAGES[i + 1] as Exclude<Stage, "discovery">) ?? null;
}

export const STATUSES = ["active", "hold", "archived"] as const;
export type Status = (typeof STATUSES)[number];

/** Outcome buckets per decision stage. */
export const VERDICTS = {
  screen: ["reject", "keep_possible", "keep_stretch", "keep_strong"],
  triage: ["top_priority", "secondary", "hold_low_confidence", "remove"],
  verify: ["tier_exceptional", "tier_strong", "tier_good", "tier_stretch", "hold_needs_info", "archive", "closed"],
} as const;
export type DecisionStage = keyof typeof VERDICTS;
export type Verdict<S extends DecisionStage = DecisionStage> = (typeof VERDICTS)[S][number];

export const VERDICT_LABELS: Record<string, string> = {
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

/** Plain names for the decision steps, used in messages. */
export const STEP_WORDS: Record<string, string> = {
  screen: "First look",
  triage: "Deeper look",
  verify: "Final check",
};

export const FIT_TIERS = ["exceptional", "strong", "good", "stretch"] as const;
export type FitTier = (typeof FIT_TIERS)[number];

export const SOURCE_VERIFICATION = ["unverified", "verified", "unreachable"] as const;
export type SourceVerification = (typeof SOURCE_VERIFICATION)[number];

/**
 * Where a prepared package is in the human hand-off. The app never sends
 * anything; `approved`, `sent_manually` and `responded` record what a human did
 * outside the app and can only be set by a human actor (see permissions.ts).
 */
export const OUTREACH_STATUSES = [
  "not_started",
  "package_ready",
  "approved",
  "sent_manually",
  "responded",
  "closed",
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export const HUMAN_ONLY_OUTREACH: readonly OutreachStatus[] = ["approved", "sent_manually", "responded"];

export const TARGET_ACCOUNT_STATUSES = ["tracking", "hold", "archived"] as const;
export type TargetAccountStatus = (typeof TARGET_ACCOUNT_STATUSES)[number];

export type Actor =
  | { kind: "human"; id: string }
  | { kind: "system"; process: string }
  | { kind: "import"; batchId: string };

export function actorLabel(a: Actor): string {
  switch (a.kind) {
    case "human":
      return `human:${a.id}`;
    case "system":
      return `system:${a.process}`;
    case "import":
      return `import:${a.batchId}`;
  }
}
