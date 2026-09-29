/**
 * Pipeline state machine: discovery → screen → triage → verify.
 *
 * Pure functions: given a record's current state, a stage decision and the
 * criteria evaluation, decide the resulting state (or refuse). The service
 * layer persists the result and writes History.
 */
import type { Evaluation } from "./rules";
import { summarize } from "./rules";
import {
  nextStage,
  VERDICTS,
  STEP_WORDS,
  VERDICT_LABELS,
  type DecisionStage,
  type FitTier,
  type SourceVerification,
  type Stage,
  type Status,
} from "./types";

export interface PipelineState {
  stage: Stage;
  status: Status;
  sourceVerification: SourceVerification;
}

export interface Decision {
  stage: DecisionStage;
  verdict: string;
  reason: string;
  /** 0–100, optional. */
  confidence?: number | null;
}

export interface DecisionOutcome {
  stage: Stage;
  status: Status;
  fitTier?: FitTier | null;
  holdReason?: string | null;
  archiveReason?: string | null;
  /** Short explanation for History. */
  summary: string;
}

export class PipelineError extends Error {}

type Effect = "advance" | "hold" | "archive";

const EFFECTS: Record<string, Effect> = {
  reject: "archive",
  keep_possible: "advance",
  keep_stretch: "advance",
  keep_strong: "advance",
  top_priority: "advance",
  secondary: "advance",
  hold_low_confidence: "hold",
  remove: "archive",
  tier_exceptional: "advance",
  tier_strong: "advance",
  tier_good: "advance",
  tier_stretch: "advance",
  hold_needs_info: "hold",
  archive: "archive",
  closed: "archive",
};

const TIER: Record<string, FitTier> = {
  tier_exceptional: "exceptional",
  tier_strong: "strong",
  tier_good: "good",
  tier_stretch: "stretch",
};

export function verdictEffect(verdict: string): Effect | undefined {
  return EFFECTS[verdict];
}

/**
 * Decide the outcome of applying `decision` to a record in `state`, given the
 * criteria `evaluation` for that stage.
 *
 * Refuses when:
 *  - the record is not active, or the decision is for the wrong stage;
 *  - no reason is given (every verdict must carry a reason);
 *  - an advancing verdict is given while a criterion is genuinely violated;
 *  - a verify-stage promotion is attempted on an unverified/unreachable source
 *    (those go to Hold — never auto-promoted, never rejected for that alone).
 */
export function decide(state: PipelineState, decision: Decision, evaluation: Evaluation): DecisionOutcome {
  if (state.status !== "active") {
    throw new PipelineError(`Record is ${state.status}; restore it to active before making stage decisions`);
  }
  const due = nextStage(state.stage);
  if (due === null) throw new PipelineError("Record has completed every stage");
  if (decision.stage !== due) {
    throw new PipelineError(`Next decision is ${due}, not ${decision.stage}`);
  }
  if (!(VERDICTS[decision.stage] as readonly string[]).includes(decision.verdict)) {
    throw new PipelineError(`"${decision.verdict}" is not a ${decision.stage} verdict`);
  }
  const reason = decision.reason.trim();
  if (!reason) throw new PipelineError("A reason is required for every verdict");
  if (decision.confidence != null && (decision.confidence < 0 || decision.confidence > 100)) {
    throw new PipelineError("Confidence must be between 0 and 100");
  }

  const effect = EFFECTS[decision.verdict];
  const label = VERDICT_LABELS[decision.verdict] ?? decision.verdict;
  const criteria = summarize(evaluation);

  if (effect === "advance" && evaluation.fails.length > 0) {
    throw new PipelineError(
      `Cannot advance: ${evaluation.fails.map((f) => f.reason).join("; ")}. ` +
        `Correct the data or the criterion, or choose a rejecting verdict.`,
    );
  }

  // Screen has no hold bucket; hold-effect criteria take effect from Triage on.
  if (effect === "advance" && evaluation.holds.length > 0 && decision.stage !== "screen") {
    throw new PipelineError(
      `Cannot advance: ${evaluation.holds.map((f) => f.reason).join("; ")} — this criterion sends records to Hold.`,
    );
  }

  if (effect === "advance" && decision.stage === "verify" && state.sourceVerification !== "verified") {
    throw new PipelineError(
      `Source is ${state.sourceVerification}; an unverifiable source goes to Hold, not to a priority tier`,
    );
  }

  switch (effect) {
    case "advance":
      return {
        stage: decision.stage,
        status: "active",
        fitTier: TIER[decision.verdict] ?? null,
        summary: `${STEP_WORDS[decision.stage]}: ${label} — ${reason} (${criteria})`,
      };
    case "hold":
      return {
        stage: state.stage,
        status: "hold",
        holdReason: reason,
        summary: `${STEP_WORDS[decision.stage]}: ${label} — ${reason}`,
      };
    case "archive":
      return {
        stage: state.stage,
        status: "archived",
        archiveReason: `${label}: ${reason}`,
        summary: `${STEP_WORDS[decision.stage]}: ${label} — ${reason}`,
      };
    default:
      throw new PipelineError(`Unhandled verdict ${decision.verdict}`);
  }
}

/** A suggestion only — a human always picks the verdict. */
export function suggestVerdict(stage: DecisionStage, evaluation: Evaluation, sourceVerification: SourceVerification) {
  if (evaluation.fails.length > 0) {
    const onFail: Record<DecisionStage, string> = { screen: "reject", triage: "remove", verify: "archive" };
    return onFail[stage];
  }
  if (evaluation.holds.length > 0) {
    const onHold: Record<DecisionStage, string> = { screen: "keep_possible", triage: "hold_low_confidence", verify: "hold_needs_info" };
    return onHold[stage];
  }
  if (stage === "verify" && sourceVerification !== "verified") return "hold_needs_info";
  const allVerified = evaluation.unknowns.length === 0;
  switch (stage) {
    case "screen":
      return allVerified ? "keep_strong" : "keep_possible";
    case "triage":
      return allVerified ? "top_priority" : "secondary";
    case "verify":
      return allVerified ? "tier_strong" : "tier_good";
  }
}

export type ReconcileDecision =
  | { action: "keep"; reason: string }
  | { action: "hold"; reason: string }
  | { action: "archive"; reason: string };

/**
 * Reconciliation: re-check a qualified prospect against the *current* criteria.
 * Qualifying once is not a permanent pass.
 */
export function reconcileDecision(sourceVerification: SourceVerification, evaluation: Evaluation): ReconcileDecision {
  if (evaluation.fails.length > 0) {
    return {
      action: "archive",
      reason: `Weekly re-check: no longer fits your rules — ${evaluation.fails.map((f) => f.reason).join("; ")}`,
    };
  }
  if (evaluation.holds.length > 0) {
    return {
      action: "hold",
      reason: `Weekly re-check: needs a look — ${evaluation.holds.map((f) => f.reason).join("; ")}`,
    };
  }
  if (sourceVerification !== "verified") {
    return { action: "hold", reason: `Weekly re-check: the listing ${sourceVerification === "unreachable" ? "couldn't be reached" : "hasn't been checked yet"} — check the link is still open` };
  }
  return { action: "keep", reason: `Weekly re-check: still fits (${summarize(evaluation)})` };
}
