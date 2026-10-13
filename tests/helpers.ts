import { memoryDb } from "@/db/client";
import { ensureWorkspace, type Ctx } from "@/services/context";

/** A fresh, migrated in-memory SQLite database per test. */
export async function testCtx(): Promise<Ctx> {
  const db = await memoryDb();
  await ensureWorkspace(db);
  return { db, workspaceId: "default", actor: { kind: "human", id: "owner" } };
}
