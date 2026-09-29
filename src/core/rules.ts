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

export const RULE_OPERATORS = [
  "gte",
  "lte",
  "includes_any",
  "excludes_all",
  "starts_with_any",
  "not_starts_with_any",
  "equals",
  "note",
] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  gte: "at least (number)",
  lte: "at most (number)",
  includes_any: "must contain one of",
  excludes_all: "must not contain any of",
  starts_with_any: "must start with one of",
  not_starts_with_any: "must not start with any of",
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

/** Case-insensitive: value begins with `term` as a whole word ("NO (on-site)" yes, "NOTABLE" no). */
export function startsWithTerm(value: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${esc}(?![\\p{L}\\p{N}])`, "iu").test(value.trim());
}

/** "verifiedLocationFit" → "Verified location fit" (for messages people read). */
export function fieldLabel(field: string): string {
  const w = field
    .replace(/[_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function evaluateRule(rule: RuleLike, fields: FieldSource): RuleResult {
  const r = evaluateRuleRaw(rule, fields);
  if (r.outcome === "fail" && rule.effect === "hold") return { ...r, outcome: "hold" };
  return r;
}

function evaluateRuleRaw(rule: RuleLike, fields: FieldSource): RuleResult {
  const base = { key: rule.key, label: rule.label, field: rule.field };
  const name = `"${fieldLabel(rule.field)}"`;
  if (!rule.enabled || rule.operator === "note" || !rule.field) {
    return { ...base, outcome: "not_applicable", reason: "Not checked automatically" };
  }
  const raw = fields[rule.field];
  if (isUnknown(raw)) {
    return { ...base, outcome: "unknown", reason: `${name} is not known yet — this doesn't count against it` };
  }
  const shown = String(raw);

  switch (rule.operator) {
    case "gte":
    case "lte": {
      const actual = toNumber(raw);
      const limit = toNumber(rule.value);
      if (actual === null) {
        return { ...base, outcome: "unknown", reason: `${name} ("${shown}") isn't a number, so it can't be checked` };
      }
      if (limit === null) {
        return { ...base, outcome: "not_applicable", reason: "The rule's number is missing" };
      }
      const ok = rule.operator === "gte" ? actual >= limit : actual <= limit;
      const word = rule.operator === "gte" ? "minimum" : "maximum";
      return {
        ...base,
        outcome: ok ? "pass" : "fail",
        reason: ok
          ? `${name} is ${actual} — meets the ${word} of ${limit}`
          : `${name} is ${actual} — ${rule.operator === "gte" ? "below the minimum" : "above the maximum"} of ${limit}`,
      };
    }
    case "includes_any": {
      const allowed = toList(rule.value);
      const hit = allowed.find((a) => containsTerm(shown, a));
      return hit
        ? { ...base, outcome: "pass", reason: `${name} is "${shown}" — includes "${hit}"` }
        : { ...base, outcome: "fail", reason: `${name} is "${shown}" — includes none of: ${allowed.join(", ")}` };
    }
    case "excludes_all": {
      const excluded = toList(rule.value);
      const hit = excluded.find((a) => containsTerm(shown, a));
      return hit
        ? { ...base, outcome: "fail", reason: `${name} is "${shown}" — includes "${hit}"` }
        : { ...base, outcome: "pass", reason: `${name} includes none of: ${excluded.join(", ")}` };
    }
    case "starts_with_any":
    case "not_starts_with_any": {
      const terms = toList(rule.value);
      const hit = terms.find((t) => startsWithTerm(shown, t));
      const wantMatch = rule.operator === "starts_with_any";
      const ok = wantMatch ? !!hit : !hit;
      return {
        ...base,
        outcome: ok ? "pass" : "fail",
        reason: hit
          ? `${name} is "${shown}" — starts with "${hit}"`
          : `${name} is "${shown}" — doesn't start with ${terms.join(", ")}`,
      };
    }
    case "equals": {
      const want = String(rule.value).trim().toLowerCase();
      const ok = shown.trim().toLowerCase() === want;
      return {
        ...base,
        outcome: ok ? "pass" : "fail",
        reason: ok ? `${name} is "${shown}"` : `${name} is "${shown}", not "${rule.value}"`,
      };
    }
    default:
      return { ...base, outcome: "not_applicable", reason: "Not checked automatically" };
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
  if (ev.results.length === 0) return "no automatic checks apply";
  const parts: string[] = [];
  if (ev.fails.length) parts.push(`fails: ${ev.fails.map((f) => f.reason).join("; ")}`);
  if (ev.holds.length) parts.push(`needs a look: ${ev.holds.map((f) => f.reason).join("; ")}`);
  if (ev.unknowns.length) parts.push(`not known yet: ${ev.unknowns.map((f) => fieldLabel(f.field)).join(", ")}`);
  parts.push(`${ev.passes.length} of ${ev.results.length} checks passed`);
  return parts.join("; ");
}
