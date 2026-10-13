/**
 * Database connection.
 *
 *  - Cloudflare (production and `npm run dev`): the D1 database bound to the Worker as `DB`
 *    (see wrangler.jsonc).
 *  - Tests: in-memory SQLite (libsql), migrated with the same SQL files.
 *
 * The service layer only sees `Db` (Drizzle's async SQLite query builder), so the driver is swappable.
 */
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<"async", any, typeof schema>;

/**
 * D1 accepts at most 100 bound values per statement. Multi-row inserts are split so each statement
 * stays under it.
 */
export const MAX_BOUND_VALUES = 100;

export function chunkRows<T extends object>(rows: T[], reserved = 0): T[][] {
  if (!rows.length) return [];
  const perRow = Math.max(1, Object.keys(rows[0]).length);
  const size = Math.max(1, Math.floor((MAX_BOUND_VALUES - reserved) / perRow));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export class NoDatabaseError extends Error {
  constructor() {
    super("No database is bound to this Worker. Add a D1 binding named DB (see README → Cloudflare).");
  }
}

const cache = new WeakMap<object, Db>();

/** The Worker's D1 database for this request. */
export async function getDb(): Promise<Db> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const d1 = env.DB;
  if (!d1) throw new NoDatabaseError();
  let db = cache.get(d1);
  if (!db) {
    const { drizzle } = await import("drizzle-orm/d1");
    db = drizzle(d1, { schema }) as unknown as Db;
    cache.set(d1, db);
  }
  return db;
}

/** A fresh, migrated in-memory database (tests). Fails any statement D1 would reject for too many values. */
export async function memoryDb(): Promise<Db> {
  const path = await import("node:path");
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const logger = {
    logQuery(query: string, params: unknown[]) {
      if (params.length > MAX_BOUND_VALUES) throw new Error(`${params.length} bound values (D1 allows ${MAX_BOUND_VALUES}): ${query.slice(0, 80)}`);
    },
  };
  const db = drizzle(createClient({ url: ":memory:" }), { schema, logger });
  await db.run("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db as unknown as Db;
}
