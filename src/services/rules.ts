import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { rules, settings, type RuleRow } from "@/db/schema";
import { assertCan } from "@/core/permissions";
import { ruleInputSchema, type RuleInput, type RuleLike } from "@/core/rules";
import type { Ctx } from "./context";
import { logHistory } from "./history";

export async function listRules(ctx: Ctx): Promise<RuleRow[]> {
  return ctx.db
    .select()
    .from(rules)
    .where(eq(rules.workspaceId, ctx.workspaceId))
    .orderBy(asc(rules.appliesFrom), asc(rules.key));
}

export async function activeRules(ctx: Ctx): Promise<RuleLike[]> {
  return (await listRules(ctx)).filter((r) => r.enabled) as RuleLike[];
}

export async function getRule(ctx: Ctx, id: string): Promise<RuleRow | undefined> {
  const [r] = await ctx.db
    .select()
    .from(rules)
    .where(and(eq(rules.workspaceId, ctx.workspaceId), eq(rules.id, id)))
    .limit(1);
  return r;
}

export async function createRule(ctx: Ctx, input: RuleInput, origin = "manual"): Promise<RuleRow> {
  assertCan(ctx.actor, "rules.edit");
  const data = ruleInputSchema.parse(input);
  const id = randomUUID();
  await ctx.db
    .insert(rules)
    .values({ id, workspaceId: ctx.workspaceId, ...data, origin });
  await logHistory(ctx, {
    entityType: "rule",
    entityId: id,
    event: "created",
    newStatus: data.enabled ? "enabled" : "disabled",
    reason: `Rule added: ${data.label}`,
    detail: { rule: data },
  });
  return (await getRule(ctx, id))!;
}

export async function updateRule(ctx: Ctx, id: string, input: RuleInput, reason: string): Promise<RuleRow> {
  assertCan(ctx.actor, "rules.edit");
  const before = await getRule(ctx, id);
  if (!before) throw new Error("Rule not found");
  const data = ruleInputSchema.parse(input);
  await ctx.db
    .update(rules)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(and(eq(rules.workspaceId, ctx.workspaceId), eq(rules.id, id)));
  await logHistory(ctx, {
    entityType: "rule",
    entityId: id,
    event: "updated",
    priorStatus: before.enabled ? "enabled" : "disabled",
    newStatus: data.enabled ? "enabled" : "disabled",
    reason: reason.trim() || `Rule edited: ${data.label}`,
    detail: {
      before: { ...before, createdAt: undefined, updatedAt: undefined },
      after: data,
    },
  });
  return (await getRule(ctx, id))!;
}

/** Rules are never deleted — only disabled — so past verdicts stay explainable. */
export async function setRuleEnabled(ctx: Ctx, id: string, enabled: boolean, reason: string) {
  const r = await getRule(ctx, id);
  if (!r) throw new Error("Rule not found");
  return await updateRule(
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

export async function getSetting<T>(ctx: Ctx, key: string, fallback: T): Promise<T> {
  const [row] = await ctx.db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, ctx.workspaceId), eq(settings.key, key)))
    .limit(1);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(ctx: Ctx, key: string, value: unknown, reason = "") {
  assertCan(ctx.actor, "settings.edit");
  const [existing] = await ctx.db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, ctx.workspaceId), eq(settings.key, key)))
    .limit(1);
  if (existing) {
    await ctx.db
      .update(settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(and(eq(settings.workspaceId, ctx.workspaceId), eq(settings.key, key)));
  } else {
    await ctx.db.insert(settings).values({ workspaceId: ctx.workspaceId, key, value });
  }
  // Identity terms and saved answers are personal: log that they changed, not their values.
  const sensitive = key === IDENTITY_TERMS_KEY || key.startsWith("privacy.") || key.startsWith("auth.") || key.startsWith("answers.");
  await logHistory(ctx, {
    entityType: "setting",
    entityId: key,
    event: existing ? "updated" : "created",
    reason: reason || "Settings saved",
    detail: sensitive ? { count: Array.isArray(value) ? value.length : null } : { value },
  });
}

export async function getIdentityTerms(ctx: Ctx): Promise<string[]> {
  const v = await getSetting<unknown>(ctx, IDENTITY_TERMS_KEY, []);
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
    description: "If something isn't known, leave it empty or write \"unknown\" — never guess. The app does this for you when it brings data in.",
    appliesFrom: "screen",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "process.unknown_not_reject",
    label: "Unknown never counts against a lead",
    description:
      "A lead is never rejected just because something isn't known. Only a real mismatch (like the wrong location) archives it. The app enforces this automatically.",
    appliesFrom: "screen",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "process.unverifiable_to_hold",
    label: "Unchecked links go On hold",
    description: "If a listing can't be reached or confirmed, the lead goes On hold — it isn't rejected, and it can't become Ready. The app enforces this automatically.",
    appliesFrom: "verify",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "process.research_only",
    label: "The app never sends anything",
    description: "The app never applies, sends or contacts anyone. You do that yourself, then mark it in the app. This is built in and can't be switched off.",
    appliesFrom: "verify",
    field: "",
    operator: "note",
    value: "",
    enabled: true,
  },
  {
    key: "example.value_floor",
    label: "Example: minimum pay",
    description: "An example check (switched off). Edit the number and switch it on to archive leads whose \"value\" is below it.",
    appliesFrom: "screen",
    field: "value",
    operator: "gte",
    value: 0,
    enabled: false,
  },
  {
    key: "example.location",
    label: "Example: location must include…",
    description: "An example check (switched off). List the locations you accept, then switch it on.",
    appliesFrom: "screen",
    field: "location",
    operator: "includes_any",
    value: ["Remote"],
    enabled: false,
  },
];

export async function seedDefaultRules(ctx: Ctx) {
  if ((await listRules(ctx)).length > 0) return;
  for (const r of DEFAULT_RULES) await createRule(ctx, r, "seed");
}
