/**
 * Saved items, statuses, notes and named lists. Every read and write is scoped to the caller's
 * workspace: an id from another workspace behaves exactly like an id that doesn't exist.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { assertCan } from "@/core/permissions";
import { moduleDef } from "@/core/opportunities/modules";
import type { Fields, Link, MatchResult, ModuleId, NormalizedItem } from "@/core/opportunities/types";
import { actorLabel } from "@/core/types";
import { oppItems, oppListItems, oppLists, oppNotes, oppResults, type OppItemRow, type OppListRow, type OppNoteRow } from "@/db/schema";
import { summarizeRecord } from "@/sources/opportunities/ai-enricher";
import type { Ctx } from "../context";
import { logHistory } from "../history";
import { getSearch } from "./search";
import { dayBucket, LIMITS, reserve, UsageLimitError } from "./usage";

export class NotFoundError extends Error {}

export function toNormalized(r: OppItemRow): NormalizedItem {
  return {
    module: r.module as ModuleId,
    key: r.dedupKey,
    provider: r.provider,
    mode: r.mode,
    title: r.title,
    subtitle: r.subtitle,
    sourceUrl: r.sourceUrl,
    retrievedAt: r.retrievedAt,
    publishedAt: r.publishedAt,
    fields: r.fields as unknown as Fields,
    links: r.links as Link[],
  };
}

const mine = (ctx: Ctx, id: string) => and(eq(oppItems.workspaceId, ctx.workspaceId), eq(oppItems.id, id));

export async function getItem(ctx: Ctx, id: string): Promise<OppItemRow> {
  const [row] = await ctx.db.select().from(oppItems).where(mine(ctx, id)).limit(1);
  if (!row) throw new NotFoundError("Item not found");
  return row;
}

export async function getItems(ctx: Ctx, ids: string[]): Promise<OppItemRow[]> {
  if (!ids.length) return [];
  const rows = await ctx.db
    .select()
    .from(oppItems)
    .where(and(eq(oppItems.workspaceId, ctx.workspaceId), inArray(oppItems.id, ids.slice(0, 50))));
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is OppItemRow => !!r);
}

export interface ResultRow {
  item: OppItemRow;
  match: MatchResult;
  rank: number;
}

export async function searchResults(ctx: Ctx, searchId: string) {
  const search = await getSearch(ctx, searchId);
  if (!search) return null;
  const rows = await ctx.db
    .select({ item: oppItems, match: oppResults.match, rank: oppResults.rank })
    .from(oppResults)
    .innerJoin(oppItems, eq(oppItems.id, oppResults.itemId))
    .where(and(eq(oppResults.workspaceId, ctx.workspaceId), eq(oppResults.searchId, searchId), eq(oppItems.workspaceId, ctx.workspaceId)))
    .orderBy(asc(oppResults.rank));
  return { search, rows: rows.map((r) => ({ item: r.item, match: r.match as unknown as MatchResult, rank: r.rank })) as ResultRow[] };
}

function checkStatus(module: ModuleId, status: string) {
  const def = moduleDef(module).statuses.find((s) => s.id === status);
  if (!def) throw new Error(`Unknown status "${status}"`);
  return def;
}

export async function saveItem(ctx: Ctx, id: string, status?: string): Promise<OppItemRow> {
  assertCan(ctx.actor, "record.write");
  const item = await getItem(ctx, id);
  const s = status ?? item.status ?? moduleDef(item.module as ModuleId).statuses[0].id;
  const def = checkStatus(item.module as ModuleId, s);
  if (def.humanAction) assertCan(ctx.actor, "outreach.record_human_action");
  const [row] = await ctx.db
    .update(oppItems)
    .set({ savedAt: item.savedAt ?? new Date().toISOString(), status: s, updatedAt: new Date().toISOString() })
    .where(mine(ctx, id))
    .returning();
  await logHistory(ctx, { entityType: "opportunity", entityId: id, event: item.savedAt ? "status_changed" : "saved", priorStatus: item.status, newStatus: s, reason: `${item.title}` });
  return row;
}

export async function unsaveItem(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx.actor, "record.write");
  const item = await getItem(ctx, id);
  await ctx.db.update(oppItems).set({ savedAt: null, status: null, updatedAt: new Date().toISOString() }).where(mine(ctx, id));
  await ctx.db.delete(oppListItems).where(and(eq(oppListItems.workspaceId, ctx.workspaceId), eq(oppListItems.itemId, id)));
  await logHistory(ctx, { entityType: "opportunity", entityId: id, event: "unsaved", priorStatus: item.status, reason: item.title });
}

/** Status changes save the item too. Statuses that record what a person did outside the app need a human. */
export const setStatus = (ctx: Ctx, id: string, status: string) => saveItem(ctx, id, status);

export async function addNote(ctx: Ctx, id: string, body: string): Promise<OppNoteRow> {
  assertCan(ctx.actor, "record.write");
  const text = body.trim().slice(0, 5000);
  if (!text) throw new Error("A note can't be empty");
  await getItem(ctx, id);
  const [row] = await ctx.db.insert(oppNotes).values({ id: randomUUID(), workspaceId: ctx.workspaceId, itemId: id, body: text, actor: actorLabel(ctx.actor) }).returning();
  await logHistory(ctx, { entityType: "opportunity", entityId: id, event: "note_added", reason: "Note added" });
  return row;
}

export async function listNotes(ctx: Ctx, id: string): Promise<OppNoteRow[]> {
  return ctx.db
    .select()
    .from(oppNotes)
    .where(and(eq(oppNotes.workspaceId, ctx.workspaceId), eq(oppNotes.itemId, id)))
    .orderBy(desc(oppNotes.createdAt));
}

// ---------------------------------------------------------------- lists

export async function createList(ctx: Ctx, module: ModuleId, name: string): Promise<OppListRow> {
  assertCan(ctx.actor, "record.write");
  const n = name.trim().slice(0, 120);
  if (!n) throw new Error("Give the list a name");
  const [row] = await ctx.db
    .insert(oppLists)
    .values({ id: randomUUID(), workspaceId: ctx.workspaceId, module, name: n })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new Error(`You already have a list called "${n}"`);
  await logHistory(ctx, { entityType: "opp_list", entityId: row.id, event: "created", reason: n });
  return row;
}

export async function getList(ctx: Ctx, listId: string): Promise<OppListRow> {
  const [row] = await ctx.db
    .select()
    .from(oppLists)
    .where(and(eq(oppLists.workspaceId, ctx.workspaceId), eq(oppLists.id, listId)))
    .limit(1);
  if (!row) throw new NotFoundError("List not found");
  return row;
}

export async function listLists(ctx: Ctx, module?: ModuleId): Promise<(OppListRow & { count: number })[]> {
  const conds: SQL[] = [eq(oppLists.workspaceId, ctx.workspaceId)];
  if (module) conds.push(eq(oppLists.module, module));
  const rows = await ctx.db
    .select({ list: oppLists, count: sql<number>`count(${oppListItems.itemId})::int` })
    .from(oppLists)
    .leftJoin(oppListItems, eq(oppListItems.listId, oppLists.id))
    .where(and(...conds))
    .groupBy(oppLists.id)
    .orderBy(asc(oppLists.name));
  return rows.map((r) => ({ ...r.list, count: Number(r.count) }));
}

export async function addToList(ctx: Ctx, listId: string, itemId: string): Promise<void> {
  assertCan(ctx.actor, "record.write");
  const list = await getList(ctx, listId);
  const item = await getItem(ctx, itemId);
  if (list.module !== item.module) throw new Error("That list is for a different module");
  if (!item.savedAt) await saveItem(ctx, itemId);
  await ctx.db.insert(oppListItems).values({ workspaceId: ctx.workspaceId, listId, itemId }).onConflictDoNothing();
  await logHistory(ctx, { entityType: "opp_list", entityId: listId, event: "item_added", reason: `${item.title} → ${list.name}` });
}

export async function removeFromList(ctx: Ctx, listId: string, itemId: string): Promise<void> {
  assertCan(ctx.actor, "record.write");
  const list = await getList(ctx, listId);
  await ctx.db.delete(oppListItems).where(and(eq(oppListItems.workspaceId, ctx.workspaceId), eq(oppListItems.listId, list.id), eq(oppListItems.itemId, itemId)));
  await logHistory(ctx, { entityType: "opp_list", entityId: listId, event: "item_removed", reason: itemId });
}

export async function listsForItem(ctx: Ctx, itemId: string): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: oppListItems.listId })
    .from(oppListItems)
    .where(and(eq(oppListItems.workspaceId, ctx.workspaceId), eq(oppListItems.itemId, itemId)));
  return rows.map((r) => r.id);
}

export interface SavedFilter {
  module?: ModuleId;
  listId?: string;
  status?: string;
}

export async function listSaved(ctx: Ctx, f: SavedFilter = {}): Promise<OppItemRow[]> {
  const conds: SQL[] = [eq(oppItems.workspaceId, ctx.workspaceId), isNotNull(oppItems.savedAt)];
  if (f.module) conds.push(eq(oppItems.module, f.module));
  if (f.status) conds.push(eq(oppItems.status, f.status));
  if (f.listId) {
    const list = await getList(ctx, f.listId);
    const rows = await ctx.db
      .select({ item: oppItems })
      .from(oppListItems)
      .innerJoin(oppItems, eq(oppItems.id, oppListItems.itemId))
      .where(and(eq(oppListItems.workspaceId, ctx.workspaceId), eq(oppListItems.listId, list.id), ...conds))
      .orderBy(desc(oppItems.savedAt));
    return rows.map((r) => r.item);
  }
  return ctx.db
    .select()
    .from(oppItems)
    .where(and(...conds))
    .orderBy(desc(oppItems.savedAt))
    .limit(2000);
}

export async function savedCounts(ctx: Ctx): Promise<Record<string, number>> {
  const rows = await ctx.db
    .select({ module: oppItems.module, n: sql<number>`count(*)::int` })
    .from(oppItems)
    .where(and(eq(oppItems.workspaceId, ctx.workspaceId), isNotNull(oppItems.savedAt)))
    .groupBy(oppItems.module);
  return Object.fromEntries(rows.map((r) => [r.module, Number(r.n)]));
}

// ---------------------------------------------------------------- enrichment

/** The record's published text, in the order the detail page shows it — the only input an AI summary sees. */
export function recordText(it: NormalizedItem): string {
  const def = moduleDef(it.module);
  const lines = [`Title: ${it.title}`, it.subtitle ? `Subtitle: ${it.subtitle}` : ""];
  for (const [k, label] of Object.entries(def.fieldLabels)) {
    const f = it.fields[k];
    if (!f || f.state === "unknown") continue;
    lines.push(`${label}: ${def.formatField(k, f)}`);
  }
  return lines.filter(Boolean).join("\n");
}

export async function requestAiSummary(ctx: Ctx, id: string): Promise<void> {
  assertCan(ctx.actor, "record.write");
  const row = await getItem(ctx, id);
  if (!(await reserve(ctx, dayBucket("ai", new Date()), LIMITS.aiSummariesPerDay())))
    throw new UsageLimitError("Today's limit for AI summaries has been reached.");
  const res = await summarizeRecord(recordText(toNormalized(row)));
  if (!res.ok) throw new Error(res.error);
  await ctx.db
    .update(oppItems)
    .set({ enrichment: { kind: "ai", label: "AI summary", model: res.model, generatedAt: new Date().toISOString(), ...res.value }, updatedAt: new Date().toISOString() })
    .where(mine(ctx, id));
  await logHistory(ctx, { entityType: "opportunity", entityId: id, event: "ai_summary", reason: `AI summary generated (${res.model})` });
}
