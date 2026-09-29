/**
 * Criteria evaluation. Rules are data (stored in the `rules` table and editable
 * in Settings) — this module only interprets them.
 *
 * Standing rules enforced here:
 *  - An UNKNOWN value never fails a rule; it yields "unknown". Only a genuine
 *    violation (below a floor, excluded location, …) yields "fail".
 *  - Evaluation never invents a value.
 */
import { z } from "zod";
import { isUnknown, STAGES, type DecisionStage, type Stage } from "./types";

export const RULE_OPERATORS = ["gte", "lte", "includes_any", "excludes_all", "equals", "note"] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  gte: "at least (number)",
  lte: "at most (number)",
  includes_any: "must contain one of",
  excludes_all: "must not contain any of",
  equals: "must equal",
  note: "process note (not evaluated)",
};

export const ruleInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_.-]+$/i, "letters, digits, _ . - only"),
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  appliesFrom: z.enum(["screen", "triage", "verify"]),
  field: z.string().trim().max(80).default(""),
  operator: z.enum(RULE_OPERATORS),
  /** Number for gte/lte, string[] for includes_any/excludes_all, string for equals/note. */
  value: z.union([z.number(), z.string(), z.array(z.string())]),
  effect: z.enum(["reject", "hold"]).default("reject"),
  enabled: z.boolean().default(true),
});
export type RuleInput = z.input<typeof ruleInputSchema>;

export interface RuleLike {
  key: string;
  label: string;
  appliesFrom: DecisionStage;
  field: string;
  operator: RuleOperator;
  value: unknown;
  effect?: "reject" | "hold";
  enabled: boolean;
}

/** "fail" = violation of a reject-effect rule; "hold" = violation of a hold-effect rule. */
export type RuleOutcome = "pass" | "fail" | "hold" | "unknown" | "not_applicable";

export interface RuleResult {
  key: string;
  label: string;
  field: string;
  outcome: RuleOutcome;
  /** Human-readable explanation — every verdict carries a reason. */
  reason: string;
}

export interface Evaluation {
  results: RuleResult[];
  passes: RuleResult[];
  /** Genuine violations of reject-effect rules. */
  fails: RuleResult[];
  /** Violations of hold-effect rules — the record needs a human look, not rejection. */
  holds: RuleResult[];
  unknowns: RuleResult[];
}

/** Values a rule can look at: core columns plus free-form criterion attributes. */
export type FieldSource = Record<string, unknown>;

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  // Accept "85,000", "$85k", "85000-95000" (takes the lower bound: conservative).
  const m = v.replace(/[, $€£]/g, "").match(/^(-?\d+(?:\.\d+)?)(k|m)?/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2]?.toLowerCase() === "k") n *= 1_000;
  if (m[2]?.toLowerCase() === "m") n *= 1_000_000;
  return Number.isFinite(n) ? n : null;
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Case-insensitive whole-word/phrase match, so "NO" doesn't match "NOT DISCLOSED". */
export function containsTerm(haystack: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "iu").test(haystack);
}

export function evaluateRule(rule: RuleLike, fields: FieldSource): RuleResult {
  const r = evaluateRuleRaw(rule, fields);
  if (r.outcome === "fail" && rule.effect === "hold") return { ...r, outcome: "hold" };
  return r;
}

function evaluateRuleRaw(rule: RuleLike, fields: FieldSource): RuleResult {
  const base = { key: rule.key, label: rule.label, field: rule.field };
  if (!rule.enabled || rule.operator === "note" || !rule.field) {
    return { ...base, outcome: "not_applicable", reason: "Not an evaluable criterion" };
  }
  const raw = fields[rule.field];
  if (isUnknown(raw)) {
    return { ...base, outcome: "unknown", reason: `${rule.field} is UNKNOWN — cannot decide, does not reject` };
  }
  const shown = String(raw);

  switch (rule.operator) {
    case "gte":
    case "lte": {
      const actual = toNumber(raw);
      const limit = toNumber(rule.value);
      if (actual === null) {
        return { ...base, outcome: "unknown", reason: `${rule.field} "${shown}" is not a number` };
      }
      if (limit === null) {
        return { ...base, outcome: "not_applicable", reason: "Rule threshold is not a number" };
      }
      const ok = rule.operator === "gte" ? actual >= limit : actual <= limit;
      const word = rule.operator === "gte" ? "floor" : "ceiling";
      return {
        ...base,
        outcome: ok ? "pass" : "fail",
        reason: ok
          ? `${rule.field} ${actual} meets ${word} ${limit}`
          : `${rule.field} ${actual} is ${rule.operator === "gte" ? "below" : "above"} ${word} ${limit}`,
      };
    }
    case "includes_any": {
      const allowed = toList(rule.value);
      const hit = allowed.find((a) => containsTerm(shown, a));
      return hit
        ? { ...base, outcome: "pass", reason: `${rule.field} "${shown}" matches "${hit}"` }
        : { ...base, outcome: "fail", reason: `${rule.field} "${shown}" matches none of: ${allowed.join(", ")}` };
    }
    case "excludes_all": {
      const excluded = toList(rule.value);
      const hit = excluded.find((a) => containsTerm(shown, a));
      return hit
        ? { ...base, outcome: "fail", reason: `${rule.field} "${shown}" contains excluded "${hit}"` }
        : { ...base, outcome: "pass", reason: `${rule.field} contains no excluded terms` };
    }
    case "equals": {
      const want = String(rule.value).trim().toLowerCase();
      const ok = shown.trim().toLowerCase() === want;
      return {
        ...base,
        outcome: ok ? "pass" : "fail",
        reason: ok ? `${rule.field} is "${shown}"` : `${rule.field} is "${shown}", required "${rule.value}"`,
      };
    }
    default:
      return { ...base, outcome: "not_applicable", reason: "Unknown operator" };
  }
}

/** Rules that apply at `stage` are those whose `appliesFrom` is at or before it. */
export function rulesForStage<R extends RuleLike>(rules: R[], stage: DecisionStage | "all"): R[] {
  if (stage === "all") return rules.filter((r) => r.enabled);
  const upTo = STAGES.indexOf(stage as Stage);
  return rules.filter((r) => r.enabled && STAGES.indexOf(r.appliesFrom) <= upTo);
}

export function evaluate(rules: RuleLike[], fields: FieldSource, stage: DecisionStage | "all"): Evaluation {
  const results = rulesForStage(rules, stage)
    .map((r) => evaluateRule(r, fields))
    .filter((r) => r.outcome !== "not_applicable");
  return {
    results,
    passes: results.filter((r) => r.outcome === "pass"),
    fails: results.filter((r) => r.outcome === "fail"),
    holds: results.filter((r) => r.outcome === "hold"),
    unknowns: results.filter((r) => r.outcome === "unknown"),
  };
}

export function summarize(ev: Evaluation): string {
  if (ev.results.length === 0) return "No evaluable criteria";
  const parts: string[] = [];
  if (ev.fails.length) parts.push(`Violates: ${ev.fails.map((f) => f.reason).join("; ")}`);
  if (ev.holds.length) parts.push(`Needs review: ${ev.holds.map((f) => f.reason).join("; ")}`);
  if (ev.unknowns.length) parts.push(`Unknown: ${ev.unknowns.map((f) => f.field).join(", ")}`);
  parts.push(`${ev.passes.length}/${ev.results.length} criteria verified`);
  return parts.join(". ");
}
