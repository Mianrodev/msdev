import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export const DEFAULT_DB_PATH = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_PATH ?? "data/crm.db");
const MIGRATIONS = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

/** Open (and migrate) a database. `:memory:` is supported for tests. */
export function openDb(file: string = DEFAULT_DB_PATH): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

const g = globalThis as unknown as { __crmDb?: Db };

/** Process-wide connection (survives Next.js dev hot reloads). */
export function getDb(): Db {
  g.__crmDb ??= openDb();
  return g.__crmDb;
}
