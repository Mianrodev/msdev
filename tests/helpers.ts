import { migrateDb } from "@/db/client";
import { ensureWorkspace, type Ctx } from "@/services/context";

/** A fresh, migrated in-memory Postgres (PGlite) per test. */
export async function testCtx(): Promise<Ctx> {
  const db = await migrateDb(":memory:");
  await ensureWorkspace(db);
  return { db, workspaceId: "default", actor: { kind: "human", id: "owner" } };
}
