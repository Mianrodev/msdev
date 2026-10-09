/**
 * Search orchestration, the same for every module:
 *
 *   validate → usage limits → providers (retrieval + normalisation, in parallel, each with a timeout)
 *   → demo/live check → dedupe → hard filters → deterministic ranking → store items, evidence and
 *   results → history.
 *
 * A live search that fails is recorded as failed — it never falls back to demo data. A search where
 * some providers fail is "partial", and says which ones.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { assertCan } from "@/core/permissions";
import { dedupe } from "@/core/opportunities/dedup";
import { moduleDef } from "@/core/opportunities/modules";
import { firstIssue } from "@/core/opportunities/query";
import { byScore } from "@/core/opportunities/scoring";
import type { DataMode, MatchResult, ModuleId, NormalizedItem, ProviderRun, SearchStatus } from "@/core/opportunities/types";
import { oppItems, oppResults, oppSearches, type OppSearchRow } from "@/db/schema";
import { safeGetJson } from "@/sources/opportunities/safe-fetch";
import { liveAvailability, providersFor } from "@/sources/opportunities/registry";
import type { Provider, ProviderIO } from "@/sources/opportunities/types";
import { actorLabel } from "@/core/types";
import type { Ctx } from "../context";
import { logHistory } from "../history";
import { readCache, writeCache } from "../source-cache";
import { getProfile } from "./profile";
import { dayBucket, LIMITS, minuteBucket, reserve, UsageLimitError } from "./usage";

type Raw = Record<string, string | string[] | undefined>;
type AnyProvider = Provider<Record<string, unknown>>;

export class SearchInputError extends Error {}

export interface SearchDeps {
  now?: Date;
  /** Replace the registered providers (tests). */
  providers?: AnyProvider[];
  /** Replace network access (tests). */
  getJson?: (url: string, allowHosts: readonly string[]) => Promise<unknown>;
  providerTimeoutMs?: number;
}

export interface SearchOutcome {
  searchId: string;
  status: SearchStatus;
  resultCount: number;
  error: string | null;
}

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, rej) => {
      t = setTimeout(() => rej(new Error(`${name} took longer than ${Math.round(ms / 1000)} seconds`)), ms);
    }),
  ]);
}

function plainError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Provider and fetch errors are already written for people; anything else gets a generic line.
  return /^[A-Z].{5,200}$/.test(msg) ? msg : "The source returned an error.";
}

export async function runSearch(ctx: Ctx, module: ModuleId, raw: Raw, deps: SearchDeps = {}): Promise<SearchOutcome> {
  assertCan(ctx.actor, "record.write");
  const def = moduleDef(module);
  const parsed = def.querySchema.safeParse(raw);
  if (!parsed.success) throw new SearchInputError(`Please check the search form — ${firstIssue(parsed.error)}`);
  const query = parsed.data as Record<string, unknown> & { mode: DataMode; simulate?: string };
  if (query.mode === "live") query.simulate = "none"; // simulations exist only in demo mode
  const now = deps.now ?? new Date();
  const started = new Date().toISOString();

  if (!(await reserve(ctx, minuteBucket("search", now), LIMITS.searchesPerMinute())))
    throw new UsageLimitError("That's a lot of searches in a minute — please wait a moment and try again.");

  const searchId = randomUUID();
  const mode = query.mode;
  const record = async (status: SearchStatus, runs: ProviderRun[], warnings: string[], error: string | null, count: number) => {
    await ctx.db.insert(oppSearches).values({
      id: searchId,
      workspaceId: ctx.workspaceId,
      module,
      mode,
      query,
      summary: def.describeQuery(query),
      status,
      providers: runs,
      warnings,
      error,
      resultCount: count,
      actor: actorLabel(ctx.actor),
      startedAt: started,
      finishedAt: new Date().toISOString(),
    });
    await logHistory(ctx, {
      entityType: "opp_search",
      entityId: searchId,
      event: `search.${status}`,
      reason: `${module} ${mode} search: ${count} result${count === 1 ? "" : "s"}${error ? ` — ${error}` : ""}`,
      detail: { module, mode, providers: runs.map((r) => ({ provider: r.provider, ok: r.ok, count: r.count })) },
    });
    return { searchId, status, resultCount: count, error };
  };

  let providers = deps.providers ?? providersFor(module, mode);
  if (mode === "live") {
    if (!deps.providers) {
      const avail = liveAvailability(module);
      if (!avail.ok) return record("failed", [], [], `Live search isn't available: ${avail.reason} No demo data was used.`, 0);
    }
    providers = providers.filter((p) => p.available().ok);
    if (!(await reserve(ctx, dayBucket("live", now), LIMITS.liveSearchesPerDay())))
      return record("failed", [], [], "Today's limit for live searches has been reached. No demo data was used.", 0);
  }
  if (!providers.length) return record("failed", [], [], "No data source is set up for this search.", 0);

  const runs: ProviderRun[] = [];
  const found: NormalizedItem[] = [];
  const warnings: string[] = [];
  await Promise.all(
    providers.map(async (p) => {
      const t0 = Date.now();
      const io: ProviderIO = {
        now,
        getJson: (url) => (deps.getJson ? deps.getJson(url, p.allowHosts ?? []) : safeGetJson(url, { allowHosts: p.allowHosts ?? [] })),
        cache: {
          get: async (key, maxAgeMs) => (p.cacheTtlMs ? ((await readCache<unknown>(ctx.db, key, Math.min(maxAgeMs, p.cacheTtlMs)))?.value ?? null) : null),
          set: async (key, value) => {
            if (p.cacheTtlMs) await writeCache(ctx.db, key, value);
          },
        },
      };
      try {
        const res = await withTimeout(p.search(query, io), deps.providerTimeoutMs ?? 45_000, p.name);
        // Demo/live separation: a provider may only hand back records of its own mode, matching the search.
        const ok = res.items.filter((it) => it.mode === mode && it.module === module);
        if (ok.length !== res.items.length) warnings.push(`${p.name}: ${res.items.length - ok.length} record(s) of the wrong kind were dropped.`);
        found.push(...ok);
        runs.push({ provider: p.id, name: p.name, ok: true, count: ok.length, warnings: res.warnings, cached: res.cached, ms: Date.now() - t0, coverage: res.coverage, scope: p.coverage?.() });
        warnings.push(...res.warnings.map((w) => `${p.name}: ${w}`));
      } catch (e) {
        runs.push({ provider: p.id, name: p.name, ok: false, count: 0, error: plainError(e), ms: Date.now() - t0, scope: p.coverage?.() });
      }
    }),
  );
  runs.sort((a, b) => providers.findIndex((p) => p.id === a.provider) - providers.findIndex((p) => p.id === b.provider));

  const failed = runs.filter((r) => !r.ok);
  if (failed.length === runs.length) {
    return record("failed", runs, warnings, `No source answered: ${failed.map((f) => `${f.name} — ${f.error}`).join("; ")}${mode === "live" ? " No demo data was used." : ""}`, 0);
  }

  const profile = await getProfile(ctx);
  const rankCtx = { now, profile };
  const items = dedupe(found).filter((it) => def.keep(it, query, rankCtx));
  const matches = def.rank(items, query, rankCtx);
  const ranked = items.map((item, i) => ({ item, match: matches[i] })).sort(byScore);

  const ids = await storeItems(ctx, ranked, searchId);
  const status: SearchStatus = failed.length || runs.some((r) => r.warnings?.length) ? "partial" : "complete";
  const out = await record(status, runs, warnings, null, ranked.length);
  if (ranked.length) {
    await ctx.db.insert(oppResults).values(
      ranked.map((r, i) => ({ workspaceId: ctx.workspaceId, searchId, itemId: ids.get(r.item.key)!, rank: i + 1, match: r.match as unknown as Record<string, unknown> })),
    );
  }
  return out;
}

/** Upsert items by (workspace, module, mode, dedup key); keeps the user's saved state, status and notes. */
async function storeItems(ctx: Ctx, ranked: { item: NormalizedItem; match: MatchResult }[], searchId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const nowIso = new Date().toISOString();
  for (let i = 0; i < ranked.length; i += 200) {
    const chunk = ranked.slice(i, i + 200);
    const rows = await ctx.db
      .insert(oppItems)
      .values(
        chunk.map(({ item, match }) => ({
          id: randomUUID(),
          workspaceId: ctx.workspaceId,
          module: item.module,
          mode: item.mode,
          dedupKey: item.key,
          provider: item.provider,
          title: item.title.slice(0, 500),
          subtitle: item.subtitle,
          sourceUrl: item.sourceUrl,
          retrievedAt: item.retrievedAt,
          publishedAt: item.publishedAt,
          fields: item.fields as unknown as Record<string, unknown>,
          links: item.links,
          lastMatch: match as unknown as Record<string, unknown>,
          lastSearchId: searchId,
        })),
      )
      .onConflictDoUpdate({
        target: [oppItems.workspaceId, oppItems.module, oppItems.mode, oppItems.dedupKey],
        set: {
          provider: sql`excluded.provider`,
          title: sql`excluded.title`,
          subtitle: sql`excluded.subtitle`,
          sourceUrl: sql`excluded.source_url`,
          retrievedAt: sql`excluded.retrieved_at`,
          publishedAt: sql`excluded.published_at`,
          fields: sql`excluded.fields`,
          links: sql`excluded.links`,
          lastMatch: sql`excluded.last_match`,
          lastSearchId: sql`excluded.last_search_id`,
          updatedAt: nowIso,
        },
      })
      .returning({ id: oppItems.id, dedupKey: oppItems.dedupKey });
    for (const r of rows) ids.set(r.dedupKey, r.id);
  }
  return ids;
}

export async function getSearch(ctx: Ctx, id: string): Promise<OppSearchRow | null> {
  const [row] = await ctx.db
    .select()
    .from(oppSearches)
    .where(and(eq(oppSearches.workspaceId, ctx.workspaceId), eq(oppSearches.id, id)))
    .limit(1);
  return row ?? null;
}

export async function recentSearches(ctx: Ctx, module?: ModuleId, limit = 10): Promise<OppSearchRow[]> {
  return ctx.db
    .select()
    .from(oppSearches)
    .where(module ? and(eq(oppSearches.workspaceId, ctx.workspaceId), eq(oppSearches.module, module)) : eq(oppSearches.workspaceId, ctx.workspaceId))
    .orderBy(desc(oppSearches.startedAt))
    .limit(limit);
}
