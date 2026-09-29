import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { rules, settings, type RuleRow } from "@/db/schema";
import { assertCan } from "@/core/permissions";
import { ruleInputSchema, type RuleInput, type RuleLike } from "@/core/rules";
import type { Ctx } from "./context";
import { logHistory } from "./history";

export function listRules(ctx: Ctx): RuleRow[] {
  return ctx.db
    .select()
    .from(rules)
    .where(eq(rules.workspaceId, ctx.workspaceId))
    .orderBy(asc(rules.appliesFrom), asc(rules.key))
    .all();
}

export function activeRules(ctx: Ctx): RuleLike[] {
  return listRules(ctx).filter((r) => r.enabled) as RuleLike[];
}

export function getRule(ctx: Ctx, id: string) {
  return ctx.db
    .select()
    .from(rules)
    .where(and(eq(rules.workspaceId, ctx.workspaceId), eq(rules.id, id)))
    .get();
}

export function createRule(ctx: Ctx, input: RuleInput, origin = "manual"): RuleRow {
  assertCan(ctx.actor, "rules.edit");
  const data = ruleInputSchema.parse(input);
  const id = randomUUID();
  ctx.db
    .insert(rules)
    .values({ id, workspaceId: ctx.workspaceId, ...data, origin })
    .run();
  logHistory(ctx, {
    entityType: "rule",
    entityId: id,
    event: "created",
    newStatus: data.enabled ? "enabled" : "disabled",
    reason: `Rule ${data.key} created`,
    detail: { rule: data },
  });
  return getRule(ctx, id)!;
}

export function updateRule(ctx: Ctx, id: string, input: RuleInput, reason: string): RuleRow {
  assertCan(ctx.actor, "rules.edit");
  const before = getRule(ctx, id);
  if (!before) throw new Error("Rule not found");
  const data = ruleInputSchema.parse(input);
  ctx.db
    .update(rules)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(and(eq(rules.workspaceId, ctx.workspaceId), eq(rules.id, id)))
    .run();
  logHistory(ctx, {
    entityType: "rule",
    entityId: id,
    event: "updated",
    priorStatus: before.enabled ? "enabled" : "disabled",
    newStatus: data.enabled ? "enabled" : "disabled",
    reason: reason.trim() || `Rule ${data.key} edited`,
    detail: {
      before: { ...before, createdAt: undefined, updatedAt: undefined },
      after: data,
    },
  });
  return getRule(ctx, id)!;
}

/** Rules are never deleted — only disabled — so past verdicts stay explainable. */
export function setRuleEnabled(ctx: Ctx, id: string, enabled: boolean, reason: string) {
  const r = getRule(ctx, id);
  if (!r) throw new Error("Rule not found");
  return updateRule(
    ctx,
    id,
    {
      key: r.key,
      label: r.label,
      description: r.description,
      appliesFrom: r.appliesFrom,
      field: r.field,
      operator: r.operator,
      value: r.value as RuleInput["value"],
      effect: r.effect,
      enabled,
    },
    reason,
  );
}

// ---------------------------------------------------------------- settings

export const IDENTITY_TERMS_KEY = "redaction.identityTerms";

export function getSetting<T>(ctx: Ctx, key: string, fallback: T): T {
  const row = ctx.db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, ctx.workspaceId), eq(settings.key, key)))
    .get();
  return row ? (row.value as T) : fallback;
}

export function setSetting(ctx: Ctx, key: string, value: unknown, reason = "") {
  assertCan(ctx.actor, "settings.edit");
  const existing = ctx.db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, ctx.workspaceId), eq(settings.key, key)))
    .get();
  if (existing) {
    ctx.db
      .update(settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(and(eq(settings.workspaceId, ctx.workspaceId), eq(settings.key, key)))
      .run();
  } else {
    ctx.db.insert(settings).values({ workspaceId: ctx.workspaceId, key, value }).run();
  }
  // Identity terms are themselves sensitive: log that they changed, not their values.
  const sensitive = key === IDENTITY_TERMS_KEY;
  logHistory(ctx, {
    entityType: "setting",
    entityId: key,
    event: existing ? "updated" : "created",
    reason: reason || `Setting ${key} saved`,
    detail: sensitive ? { count: Array.isArray(value) ? value.length : null } : { value },
  });
}

export function getIdentityTerms(ctx: Ctx): string[] {
  const v = getSetting<unknown>(ctx, IDENTITY_TERMS_KEY, []);
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

// ---------------------------------------------------------------- seed

/**
 * Standing process rules, stored as data (operator "note") so they are visible
 * and editable alongside the criteria. The ones with code enforcement name the
 * module that enforces them.
 */
export const DEFAULT_RULES: RuleInput[] = [
  {
    key: "process.no_fabrication",
    label: "Never fabricate data",
    description: "A fact that isn't known is stored as UNKNOWN — never guessed. Enforced in core/rules.ts.",
    appliesFrom: "screen",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "process.unknown_not_reject",
    label: "Unknown doesn't auto-reject",
    description:
      "A record can advance with an UNKNOWN criterion if every other criterion is verified; only a genuine violation rejects. Enforced in core/pipeline.ts.",
    appliesFrom: "screen",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "process.unverifiable_to_hold",
    label: "Unverifiable sources go to Hold",
    description: "A source that can't be reached or confirmed goes to Hold — not Reject, not promoted.",
    appliesFrom: "verify",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "process.research_only",
    label: "Research and prepare only",
    description: "The tool never submits or contacts. A human approves and sends manually. Enforced in core/permissions.ts.",
    appliesFrom: "verify",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "example.value_floor",
    label: "Example: minimum value",
    description: "Example criterion — edit the threshold and enable it. Evaluates the record's `value` attribute.",
    appliesFrom: "screen",
    field: "value",
    operator: "gte",
    value: 0,
    enabled: false,
  },
  {
    key: "example.location",
    label: "Example: acceptable locations",
    description: "Example criterion — list acceptable location terms and enable it.",
    appliesFrom: "screen",
    field: "location",
    operator: "includes_any",
    value: ["Remote"],
    enabled: false,
  },
];

export function seedDefaultRules(ctx: Ctx) {
  if (listRules(ctx).length > 0) return;
  for (const r of DEFAULT_RULES) createRule(ctx, r, "seed");
}
