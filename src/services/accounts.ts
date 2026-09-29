import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { targetAccounts, type TargetAccountRow } from "@/db/schema";
import { targetAccountKey } from "@/core/dedup";
import { assertCan } from "@/core/permissions";
import type { TargetAccountStatus } from "@/core/types";
import type { Ctx } from "./context";
import { logHistory } from "./history";
import { ConflictError, NotFoundError } from "./records";

export const accountInputSchema = z.object({
  name: z.string().trim().max(300).optional(),
  website: z.string().trim().max(2000).nullish(),
  sourceUrl: z.string().trim().max(2000).nullish(),
  fit: z.string().max(300).nullish(),
  contactName: z.string().max(300).nullish(),
  contactEmail: z.string().max(300).nullish(),
  contactPhone: z.string().max(100).nullish(),
  contactProfileUrl: z.string().max(2000).nullish(),
  description: z.string().max(20000).nullish(),
  evidence: z.string().max(20000).nullish(),
  fitRationale: z.string().max(20000).nullish(),
  preparedBrief: z.string().max(50000).nullish(),
  preparedBriefLong: z.string().max(50000).nullish(),
  responseNotes: z.string().max(50000).nullish(),
  notes: z.string().max(50000).nullish(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type AccountInput = z.infer<typeof accountInputSchema>;

const FIELDS = [
  "name",
  "website",
  "sourceUrl",
  "fit",
  "contactName",
  "contactEmail",
  "contactPhone",
  "contactProfileUrl",
  "description",
  "evidence",
  "fitRationale",
  "preparedBrief",
  "preparedBriefLong",
  "responseNotes",
  "notes",
] as const;

/** Identity for dedup: name + website host (falling back to the source URL host). Contacts are never part of it. */
const accountKey = (a: { name?: string | null; website?: string | null; sourceUrl?: string | null }) =>
  targetAccountKey(a.name, a.website || a.sourceUrl);

const scope = (ctx: Ctx, id: string) => and(eq(targetAccounts.workspaceId, ctx.workspaceId), eq(targetAccounts.id, id));

const clean = (v: unknown) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export async function getAccount(ctx: Ctx, id: string): Promise<TargetAccountRow> {
  const [r] = await ctx.db.select().from(targetAccounts).where(scope(ctx, id)).limit(1);
  if (!r) throw new NotFoundError(`Target account ${id} not found`);
  return r;
}

/** Create, or update in place when (name, website host) already exists. */
export async function upsertAccount(ctx: Ctx, input: AccountInput, origin = "manual") {
  assertCan(ctx.actor, "record.write");
  const data = accountInputSchema.parse(input);
  const name = clean(data.name) ?? "UNKNOWN";
  const key = accountKey({ name, website: data.website, sourceUrl: data.sourceUrl });
  const [existing] = await ctx.db
    .select()
    .from(targetAccounts)
    .where(and(eq(targetAccounts.workspaceId, ctx.workspaceId), eq(targetAccounts.dedupKey, key)))
    .limit(1);

  const patch: Partial<TargetAccountRow> = {};
  const changed: string[] = [];
  for (const f of FIELDS) {
    const v = clean(data[f]);
    if (v === null || v === existing?.[f]) continue;
    (patch as Record<string, unknown>)[f] = v;
    changed.push(f);
  }
  for (const f of ["attributes", "extra"] as const) {
    const inc = data[f];
    if (inc && Object.keys(inc).length) patch[f] = { ...(existing?.[f] ?? {}), ...inc };
  }

  if (existing) {
    if (changed.length || patch.extra || patch.attributes) {
      await ctx.db.update(targetAccounts).set({ ...patch, updatedAt: new Date().toISOString() }).where(scope(ctx, existing.id));
    }
    await logHistory(ctx, {
      entityType: "target_account",
      entityId: existing.id,
      event: "dedup_merge",
      priorStatus: existing.status,
      newStatus: existing.status,
      reason: changed.length ? "Added again — updated this company instead of making a copy" : "Added again — nothing new",
    });
    return { account: await getAccount(ctx, existing.id), created: false };
  }
  const id = randomUUID();
  await ctx.db
    .insert(targetAccounts)
    .values({ ...patch, id, workspaceId: ctx.workspaceId, dedupKey: key, name, origin });
  await logHistory(ctx, { entityType: "target_account", entityId: id, event: "created", newStatus: "tracking", reason: origin.startsWith("import:") ? "Added from your spreadsheet" : "Added by you" });
  return { account: await getAccount(ctx, id), created: true };
}

export async function updateAccount(ctx: Ctx, id: string, input: AccountInput, reason = "") {
  assertCan(ctx.actor, "record.write");
  const existing = await getAccount(ctx, id);
  const data = accountInputSchema.parse(input);
  const patch: Partial<TargetAccountRow> = {};
  const changed: string[] = [];
  for (const f of FIELDS) {
    if (!(f in data)) continue;
    const v = clean(data[f]);
    if (f === "name" && !v) continue;
    if (v === existing[f]) continue;
    (patch as Record<string, unknown>)[f] = v;
    changed.push(f);
  }
  if (!changed.length) return existing;
  const key = accountKey({ ...existing, ...patch });
  if (key !== existing.dedupKey) {
    const [clash] = await ctx.db
      .select()
      .from(targetAccounts)
      .where(and(eq(targetAccounts.workspaceId, ctx.workspaceId), eq(targetAccounts.dedupKey, key)))
      .limit(1);
    if (clash && clash.id !== id) throw new ConflictError("Another target account has this name/website");
    patch.dedupKey = key;
  }
  await ctx.db.update(targetAccounts).set({ ...patch, updatedAt: new Date().toISOString() }).where(scope(ctx, id));
  await logHistory(ctx, {
    entityType: "target_account",
    entityId: id,
    event: "updated",
    priorStatus: existing.status,
    newStatus: existing.status,
    reason: reason || `Edited ${changed.length} ${changed.length === 1 ? "detail" : "details"}`,
    detail: { changed },
  });
  return await getAccount(ctx, id);
}

export async function setAccountStatus(ctx: Ctx, id: string, to: TargetAccountStatus, reason: string) {
  assertCan(ctx.actor, to === "archived" ? "record.archive" : "record.write");
  if (!reason.trim()) throw new Error("A reason is required");
  const a = await getAccount(ctx, id);
  if (a.status === to) return a;
  await ctx.db
    .update(targetAccounts)
    .set({ status: to, archiveReason: to === "archived" ? reason.trim() : a.archiveReason, updatedAt: new Date().toISOString() })
    .where(scope(ctx, id));
  await logHistory(ctx, {
    entityType: "target_account",
    entityId: id,
    event: `status.${to}`,
    priorStatus: a.status,
    newStatus: to,
    reason: reason.trim(),
  });
  return await getAccount(ctx, id);
}

export async function listAccounts(ctx: Ctx, f: { status?: string; q?: string } = {}) {
  const conds: SQL[] = [eq(targetAccounts.workspaceId, ctx.workspaceId)];
  if (f.status) conds.push(eq(targetAccounts.status, f.status as TargetAccountStatus));
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(targetAccounts.name, q), ilike(targetAccounts.description, q))!);
  }
  return ctx.db.select().from(targetAccounts).where(and(...conds)).orderBy(asc(targetAccounts.name));
}
