/**
 * Fetch once, share with everyone: public job-board data (a company's open jobs, a remote-job
 * site's listings, where a company's careers page is) kept for a while so no search downloads the
 * same thing twice. Holds only what companies publish — nothing from anyone's workspace.
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sourceCache } from "@/db/schema";

export const HOUR = 3_600_000;
/** A company's board is read again after this long (the weekly check doesn't need fresher). */
export const BOARD_FRESH_MS = 12 * HOUR;

export async function readCache<T>(db: Db, key: string, maxAgeMs: number): Promise<{ value: T; fetchedAt: string } | null> {
  if (maxAgeMs <= 0) return null;
  const [row] = await db.select().from(sourceCache).where(eq(sourceCache.key, key)).limit(1);
  if (!row || Date.now() - Date.parse(row.fetchedAt) > maxAgeMs) return null;
  return { value: row.value as T, fetchedAt: row.fetchedAt };
}

/** Many at once, in one query (a search reads a few hundred boards). */
export async function readCacheMany<T>(db: Db, keys: string[], maxAgeMs: number): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (maxAgeMs <= 0 || !keys.length) return out;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  for (let i = 0; i < keys.length; i += 500) {
    const rows = await db
      .select()
      .from(sourceCache)
      .where(sql`${sourceCache.key} in (${sql.join(keys.slice(i, i + 500).map((k) => sql`${k}`), sql`, `)}) and ${sourceCache.fetchedAt} > ${cutoff}`);
    for (const r of rows) out.set(r.key, r.value as T);
  }
  return out;
}

export async function writeCache(db: Db, key: string, value: unknown): Promise<void> {
  const fetchedAt = new Date().toISOString();
  await db
    .insert(sourceCache)
    .values({ key, fetchedAt, value })
    .onConflictDoUpdate({ target: sourceCache.key, set: { value, fetchedAt } });
}
