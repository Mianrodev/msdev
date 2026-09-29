import { and, asc, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { records, type RecordRow } from "@/db/schema";
import { dedupKey } from "@/core/dedup";
import { assertCan, assertOutreachChange } from "@/core/permissions";
import { decide, PipelineError, suggestVerdict, type Decision } from "@/core/pipeline";
import { evaluate, type Evaluation } from "@/core/rules";
import {
  FIT_TIERS,
  isUnknown,
  nextStage,
  OUTREACH_STATUSES,
  SOURCE_VERIFICATION,
  type DecisionStage,
  type FitTier,
  type OutreachStatus,
  type SourceVerification,
} from "@/core/types";
import type { Ctx } from "./context";
import { logHistory } from "./history";
import { activeRules } from "./rules";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

/** Free-text fields a user (or import) may set directly. Pipeline state is changed only via the functions below. */
export const recordInputSchema = z.object({
  account: z.string().trim().max(300).optional(),
  opportunity: z.string().trim().max(500).optional(),
  sourceUrl: z.string().trim().max(2000).nullish(),
  nextStepUrl: z.string().trim().max(2000).nullish(),
  sourceBoard: z.string().trim().max(200).nullish(),
  location: z.string().trim().max(300).nullish(),
  dateFound: z.string().trim().max(40).nullish(),
  locationFit: z.string().max(4000).nullish(),
  valueFit: z.string().max(4000).nullish(),
  requirements: z.string().max(20000).nullish(),
  gapsHard: z.string().max(20000).nullish(),
  gapsSoft: z.string().max(20000).nullish(),
  responseNotes: z.string().max(50000).nullish(),
  lastVerifiedAt: z.string().max(40).nullish(),
  contactName: z.string().max(300).nullish(),
  contactEmail: z.string().max(300).nullish(),
  contactPhone: z.string().max(100).nullish(),
  contactProfileUrl: z.string().max(2000).nullish(),
  fitRationale: z.string().max(20000).nullish(),
  preparedBrief: z.string().max(50000).nullish(),
  preparedAnswers: z.string().max(50000).nullish(),
  nextAction: z.string().max(4000).nullish(),
  notes: z.string().max(50000).nullish(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type RecordInput = z.infer<typeof recordInputSchema>;

const TEXT_FIELDS = [
  "account",
  "opportunity",
  "sourceUrl",
  "nextStepUrl",
  "sourceBoard",
  "location",
  "dateFound",
  "locationFit",
  "valueFit",
  "requirements",
  "gapsHard",
  "gapsSoft",
  "fitRationale",
  "preparedBrief",
  "preparedAnswers",
  "responseNotes",
  "lastVerifiedAt",
  "contactName",
  "contactEmail",
  "contactPhone",
  "contactProfileUrl",
  "nextAction",
  "notes",
] as const;

const nowIso = () => new Date().toISOString();

function scope(ctx: Ctx, id: string) {
  return and(eq(records.workspaceId, ctx.workspaceId), eq(records.id, id));
}

export function getRecord(ctx: Ctx, id: string): RecordRow {
  const r = ctx.db.select().from(records).where(scope(ctx, id)).get();
  if (!r) throw new NotFoundError(`Record ${id} not found`);
  return r;
}

export function findByDedupKey(ctx: Ctx, key: string) {
  return ctx.db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, ctx.workspaceId), eq(records.dedupKey, key)))
    .get();
}

/** Blank → null, "unknown" → UNKNOWN. Never invents a value. */
function clean(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.toUpperCase() === "UNKNOWN" ? "UNKNOWN" : s;
}

/**
 * Merge incoming values over existing ones. A known value is never replaced by
 * an unknown/blank one, and unchanged values are skipped.
 */
function mergePatch(existing: RecordRow | undefined, input: RecordInput) {
  const patch: Partial<RecordRow> = {};
  const changed: string[] = [];
  for (const f of TEXT_FIELDS) {
    if (!(f in input)) continue;
    const incoming = clean(input[f]);
    const current = existing ? (existing[f] as string | null) : null;
    if (incoming === null) continue;
    if (incoming === "UNKNOWN" && current && !isUnknown(current)) continue;
    if (incoming === current) continue;
    (patch as Record<string, unknown>)[f] = incoming;
    changed.push(f);
  }
  for (const f of ["attributes", "extra"] as const) {
    const inc = input[f];
    if (!inc) continue;
    const merged: Record<string, unknown> = { ...(existing?.[f] ?? {}) };
    let touched = false;
    for (const [k, v] of Object.entries(inc)) {
      const cur = merged[k];
      if (isUnknown(v) && cur !== undefined && !isUnknown(cur)) continue;
      const next = isUnknown(v) ? "UNKNOWN" : v;
      if (JSON.stringify(cur) === JSON.stringify(next)) continue;
      merged[k] = next;
      touched = true;
      changed.push(`${f}.${k}`);
    }
    if (touched) (patch as Record<string, unknown>)[f] = merged;
  }
  return { patch, changed };
}

export interface UpsertResult {
  record: RecordRow;
  created: boolean;
  changed: string[];
}

/**
 * Stage 1 (Discovery): capture a lead. Deduplicates on
 * (account, opportunity, source/next-step URL): a repeat updates the existing
 * record in place and is logged, never duplicated.
 */
export function upsertLead(ctx: Ctx, input: RecordInput, origin = "manual"): UpsertResult {
  assertCan(ctx.actor, "record.write");
  const data = recordInputSchema.parse(input);
  const account = clean(data.account) ?? "UNKNOWN";
  const opportunity = clean(data.opportunity) ?? "UNKNOWN";
  const key = dedupKey({ account, opportunity, sourceUrl: data.sourceUrl, nextStepUrl: data.nextStepUrl });
  const existing = findByDedupKey(ctx, key);

  if (existing) {
    const { patch, changed } = mergePatch(existing, data);
    if (changed.length) {
      ctx.db
        .update(records)
        .set({ ...patch, updatedAt: nowIso() })
        .where(scope(ctx, existing.id))
        .run();
    }
    logHistory(ctx, {
      entityType: "record",
      entityId: existing.id,
      event: "dedup_merge",
      priorStatus: existing.status,
      newStatus: existing.status,
      reason: changed.length
        ? `Repeat of existing record; updated in place: ${changed.join(", ")}`
        : "Repeat of existing record; no new information",
      detail: { origin, changed },
    });
    return { record: getRecord(ctx, existing.id), created: false, changed };
  }

  const id = randomUUID();
  const { patch } = mergePatch(undefined, data);
  ctx.db
    .insert(records)
    .values({
      ...patch,
      id,
      workspaceId: ctx.workspaceId,
      dedupKey: key,
      account,
      opportunity,
      dateFound: clean(data.dateFound) ?? new Date().toISOString().slice(0, 10),
      origin,
    })
    .run();
  logHistory(ctx, {
    entityType: "record",
    entityId: id,
    event: "created",
    newStatus: "active",
    reason: `Discovered (${origin})`,
  });
  return { record: getRecord(ctx, id), created: true, changed: [] };
}

/** Edit descriptive fields. Changing identity fields re-checks for duplicates. */
export function updateRecord(ctx: Ctx, id: string, input: RecordInput, reason = ""): RecordRow {
  assertCan(ctx.actor, "record.write");
  const existing = getRecord(ctx, id);
  const data = recordInputSchema.parse(input);
  const patch: Partial<RecordRow> = {};
  const changed: string[] = [];
  for (const f of TEXT_FIELDS) {
    if (!(f in data)) continue;
    const v = clean(data[f]);
    if (v === existing[f]) continue;
    if ((f === "account" || f === "opportunity") && v === null) continue;
    (patch as Record<string, unknown>)[f] = v;
    changed.push(f);
  }
  if (data.attributes) {
    const next = Object.fromEntries(
      Object.entries(data.attributes).map(([k, v]) => [k, isUnknown(v) ? "UNKNOWN" : v]),
    );
    if (JSON.stringify(next) !== JSON.stringify(existing.attributes)) {
      patch.attributes = next;
      changed.push("attributes");
    }
  }
  if (!changed.length) return existing;

  const merged = { ...existing, ...patch };
  const key = dedupKey(merged);
  if (key !== existing.dedupKey) {
    const clash = findByDedupKey(ctx, key);
    if (clash && clash.id !== id) {
      throw new ConflictError(`Another record already has this account/opportunity/URL (${clash.id})`);
    }
    patch.dedupKey = key;
  }
  ctx.db
    .update(records)
    .set({ ...patch, updatedAt: nowIso() })
    .where(scope(ctx, id))
    .run();
  logHistory(ctx, {
    entityType: "record",
    entityId: id,
    event: "updated",
    priorStatus: existing.status,
    newStatus: existing.status,
    reason: reason || `Edited: ${changed.join(", ")}`,
    detail: { changed },
  });
  return getRecord(ctx, id);
}

// ---------------------------------------------------------------- pipeline

export function fieldsFor(r: RecordRow): Record<string, unknown> {
  return {
    account: r.account,
    opportunity: r.opportunity,
    location: r.location,
    sourceBoard: r.sourceBoard,
    sourceUrl: r.sourceUrl,
    ...r.attributes,
  };
}

export function evaluateRecord(ctx: Ctx, r: RecordRow, stage: DecisionStage | "all"): Evaluation {
  return evaluate(activeRules(ctx), fieldsFor(r), stage);
}

export function pendingDecision(ctx: Ctx, r: RecordRow) {
  const stage = nextStage(r.stage);
  if (!stage || r.status !== "active") return null;
  const evaluation = evaluateRecord(ctx, r, stage);
  return { stage, evaluation, suggested: suggestVerdict(stage, evaluation, r.sourceVerification) };
}

/** Apply a stage decision (Screen, Triage or Verify). Writes verdict + reason and logs to History. */
export function decideStage(ctx: Ctx, id: string, decision: Decision): RecordRow {
  assertCan(ctx.actor, "record.decide");
  const r = getRecord(ctx, id);
  const evaluation = evaluateRecord(ctx, r, decision.stage);
  const out = decide(r, decision, evaluation);
  const ts = nowIso();
  const prefix = decision.stage; // screen | triage | verify
  const patch: Partial<RecordRow> = {
    stage: out.stage,
    status: out.status,
    [`${prefix}Verdict`]: decision.verdict,
    [`${prefix}Reason`]: decision.reason.trim(),
    [`${prefix}Confidence`]: decision.confidence ?? null,
    [`${prefix === "screen" ? "screened" : prefix === "triage" ? "triaged" : "verified"}At`]: ts,
    updatedAt: ts,
  };
  if (out.fitTier !== undefined) patch.fitTier = out.fitTier;
  if (out.status === "hold") Object.assign(patch, { holdReason: out.holdReason, holdSince: ts });
  if (out.status === "archived") Object.assign(patch, { archiveReason: out.archiveReason, archivedAt: ts });
  if (out.stage === "verify" && out.status === "active") patch.lastReconciledAt = ts;

  ctx.db.update(records).set(patch).where(scope(ctx, id)).run();
  logHistory(ctx, {
    entityType: "record",
    entityId: id,
    event: `stage.${decision.stage}`,
    priorStatus: `${r.stage}/${r.status}`,
    newStatus: `${out.stage}/${out.status}`,
    reason: out.summary,
    detail: {
      verdict: decision.verdict,
      confidence: decision.confidence ?? null,
      criteria: evaluation.results,
    },
  });
  return getRecord(ctx, id);
}

function setStatus(
  ctx: Ctx,
  id: string,
  to: "active" | "hold" | "archived",
  reason: string,
  extra: Partial<RecordRow> = {},
  event = `status.${to}`,
) {
  if (!reason.trim()) throw new Error("A reason is required");
  const r = getRecord(ctx, id);
  if (r.status === to && event === `status.${to}`) return r;
  const ts = nowIso();
  const patch: Partial<RecordRow> = { status: to, updatedAt: ts, ...extra };
  if (to === "hold") Object.assign(patch, { holdReason: reason.trim(), holdSince: ts });
  if (to === "archived") Object.assign(patch, { archiveReason: reason.trim(), archivedAt: ts });
  ctx.db.update(records).set(patch).where(scope(ctx, id)).run();
  logHistory(ctx, {
    entityType: "record",
    entityId: id,
    event,
    priorStatus: `${r.stage}/${r.status}`,
    newStatus: `${patch.stage ?? r.stage}/${to}`,
    reason: reason.trim(),
  });
  return getRecord(ctx, id);
}

export function holdRecord(ctx: Ctx, id: string, reason: string, nextAction?: string) {
  assertCan(ctx.actor, "record.write");
  return setStatus(ctx, id, "hold", reason, nextAction ? { nextAction } : {});
}

/** Archive instead of delete. Rejected and closed items land here. */
export function archiveRecord(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx.actor, "record.archive");
  return setStatus(ctx, id, "archived", reason);
}

/**
 * Return a held/archived record to the active pipeline at the stage it reached.
 * A verified prospect only comes back if it still passes the current criteria
 * and its source is verified — restore is not a way around the rules.
 */
export function restoreRecord(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx.actor, "record.write");
  const r = getRecord(ctx, id);
  if (r.stage === "verify") {
    const ev = evaluateRecord(ctx, r, "all");
    const blockers = [...ev.fails, ...ev.holds];
    if (blockers.length) {
      throw new PipelineError(`Cannot restore as a prospect: ${blockers.map((f) => f.reason).join("; ")}`);
    }
    if (r.sourceVerification !== "verified") {
      throw new PipelineError(`Cannot restore as a prospect: source is ${r.sourceVerification}`);
    }
  }
  return setStatus(ctx, id, "active", reason, {}, "status.restored");
}

export function setSourceVerification(ctx: Ctx, id: string, value: SourceVerification, reason: string) {
  assertCan(ctx.actor, "record.write");
  if (!SOURCE_VERIFICATION.includes(value)) throw new Error("Invalid source verification");
  const r = getRecord(ctx, id);
  if (r.sourceVerification === value) return r;
  ctx.db.update(records).set({ sourceVerification: value, updatedAt: nowIso() }).where(scope(ctx, id)).run();
  logHistory(ctx, {
    entityType: "record",
    entityId: id,
    event: "source_verification",
    priorStatus: r.sourceVerification,
    newStatus: value,
    reason: reason.trim() || `Source marked ${value}`,
  });
  return getRecord(ctx, id);
}

export function setFitTier(ctx: Ctx, id: string, tier: FitTier | null, reason: string) {
  assertCan(ctx.actor, "record.decide");
  if (tier !== null && !FIT_TIERS.includes(tier)) throw new Error("Invalid tier");
  if (!reason.trim()) throw new Error("A reason is required");
  const r = getRecord(ctx, id);
  if (r.fitTier === tier) return r;
  ctx.db.update(records).set({ fitTier: tier, updatedAt: nowIso() }).where(scope(ctx, id)).run();
  logHistory(ctx, {
    entityType: "record",
    entityId: id,
    event: "fit_tier",
    priorStatus: r.fitTier,
    newStatus: tier,
    reason: reason.trim(),
  });
  return getRecord(ctx, id);
}

export function setOutreachStatus(
  ctx: Ctx,
  id: string,
  to: OutreachStatus,
  opts: { humanConfirmed: boolean; reason?: string },
) {
  if (!OUTREACH_STATUSES.includes(to)) throw new Error("Invalid outreach status");
  assertOutreachChange(ctx.actor, to, opts.humanConfirmed);
  const r = getRecord(ctx, id);
  if (r.outreachStatus === to) return r;
  ctx.db.update(records).set({ outreachStatus: to, updatedAt: nowIso() }).where(scope(ctx, id)).run();
  logHistory(ctx, {
    entityType: "record",
    entityId: id,
    event: "outreach",
    priorStatus: r.outreachStatus,
    newStatus: to,
    reason: opts.reason?.trim() || `Outreach status → ${to}`,
    detail: { humanConfirmed: opts.humanConfirmed },
  });
  return getRecord(ctx, id);
}

// ---------------------------------------------------------------- queries

export const VIEWS = {
  all: "All records",
  leads: "Leads (in pipeline)",
  prospects: "Prospects (qualified)",
  hold: "Hold",
  archive: "Archive",
} as const;
export type View = keyof typeof VIEWS;

const SORTABLE = {
  updated: records.updatedAt,
  created: records.createdAt,
  found: records.dateFound,
  account: records.account,
  opportunity: records.opportunity,
  stage: records.stage,
  status: records.status,
  tier: records.fitTier,
} as const;
export type SortKey = keyof typeof SORTABLE;
export const SORT_KEYS = Object.keys(SORTABLE) as SortKey[];

export interface ListFilter {
  view?: View;
  stage?: string;
  status?: string;
  tier?: string;
  q?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
  limit?: number;
}

export function viewCondition(view: View): SQL | undefined {
  switch (view) {
    case "leads":
      return and(eq(records.status, "active"), sql`${records.stage} <> 'verify'`);
    case "prospects":
      return and(eq(records.status, "active"), eq(records.stage, "verify"));
    case "hold":
      return eq(records.status, "hold");
    case "archive":
      return eq(records.status, "archived");
    default:
      return undefined;
  }
}

export function listRecords(ctx: Ctx, f: ListFilter = {}): RecordRow[] {
  const conds: (SQL | undefined)[] = [eq(records.workspaceId, ctx.workspaceId), viewCondition(f.view ?? "all")];
  if (f.stage) conds.push(eq(records.stage, f.stage as RecordRow["stage"]));
  if (f.status) conds.push(eq(records.status, f.status as RecordRow["status"]));
  if (f.tier) conds.push(eq(records.fitTier, f.tier as NonNullable<RecordRow["fitTier"]>));
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    conds.push(
      or(like(records.account, q), like(records.opportunity, q), like(records.location, q), like(records.notes, q)),
    );
  }
  const col = SORTABLE[f.sort ?? "updated"] ?? records.updatedAt;
  const order = (f.dir ?? (f.sort && f.sort !== "updated" && f.sort !== "created" ? "asc" : "desc")) === "asc" ? asc(col) : desc(col);
  return ctx.db
    .select()
    .from(records)
    .where(and(...conds))
    .orderBy(order, desc(records.updatedAt))
    .limit(f.limit ?? 1000)
    .all();
}

export function countsByView(ctx: Ctx): Record<View, number> {
  const out = {} as Record<View, number>;
  for (const v of Object.keys(VIEWS) as View[]) {
    const row = ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(records)
      .where(and(eq(records.workspaceId, ctx.workspaceId), viewCondition(v)))
      .get();
    out[v] = row?.n ?? 0;
  }
  return out;
}

export function countsByStage(ctx: Ctx) {
  return ctx.db
    .select({ stage: records.stage, status: records.status, n: sql<number>`count(*)` })
    .from(records)
    .where(eq(records.workspaceId, ctx.workspaceId))
    .groupBy(records.stage, records.status)
    .all();
}
