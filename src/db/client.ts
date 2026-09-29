/**
 * Database connection.
 *
 *  - Production (Vercel + Neon, or any Postgres): set DATABASE_URL.
 *  - Local development: no setup — an embedded Postgres (PGlite) stores data in
 *    ./data/pglite.
 *  - Tests: in-memory PGlite.
 *
 * The service layer only sees `Db` (Drizzle's Postgres query builder), so the
 * driver is swappable.
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import path from "node:path";
import { databaseUrl, missingHostedDatabase } from "@/lib/env";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

export { databaseUrl };

/** Direct (unpooled) URL for migrations when the provider offers one. */
function migrationUrl(): string | undefined {
  return process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || databaseUrl();
}

export function localDataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PGLITE_DIR ?? "data/pglite");
}

async function openPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = dir ? new PGlite(dir) : new PGlite();
  return drizzle(client, { schema }) as unknown as Db;
}

async function openPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  // prepare:false keeps it compatible with transaction-mode poolers (Neon/Supabase pooled URLs).
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema }) as unknown as Db;
}

/** Open a database without running migrations. `":memory:"` gives a throwaway PGlite. */
export async function connect(target?: string): Promise<Db> {
  if (target === ":memory:") return openPglite();
  if (target && /^postgres(ql)?:\/\//.test(target)) return openPostgres(target);
  if (target) return openPglite(target);
  const url = databaseUrl();
  if (!url && missingHostedDatabase()) {
    throw new Error("No database connected. In Vercel: Storage → create/connect a Neon database, then redeploy.");
  }
  return url ? openPostgres(url) : openPglite(localDataDir());
}

/** Apply pending migrations. */
export async function migrateDb(target?: string): Promise<Db> {
  const url = target ?? migrationUrl();
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    await client.end();
    return connect(target ?? databaseUrl());
  }
  const db = await connect(target);
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: MIGRATIONS });
  return db;
}

const g = globalThis as unknown as { __crmDb?: Promise<Db> };

/** Process-wide connection (survives Next.js dev hot reloads). Migrations run at build/start, not here. */
export function getDb(): Promise<Db> {
  g.__crmDb ??= connect();
  return g.__crmDb;
}
