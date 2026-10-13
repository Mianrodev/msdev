/**
 * Fetch once, share with everyone: public data from live providers (e.g. Find a Tender pages), kept
 * for a while so searches don't download the same thing twice. Holds only what sources publish —
 * nothing from anyone's workspace — and only for providers whose terms allow storage.
 */
import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sourceCache } from "@/db/schema";

export const HOUR = 3_600_000;

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
  // D1 binds at most 100 values per statement: 90 keys + the cutoff.
  for (let i = 0; i < keys.length; i += 90) {
    const rows = await db
      .select()
      .from(sourceCache)
      .where(
        sql`${sourceCache.key} in (${sql.join(
          keys.slice(i, i + 90).map((k) => sql`${k}`),
          sql`, `,
        )}) and ${sourceCache.fetchedAt} > ${cutoff}`,
      );
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

/** Drop anything older than 7 days (no provider reuses data that long). */
export async function pruneCache(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
  await db.delete(sourceCache).where(lt(sourceCache.fetchedAt, cutoff));
}
