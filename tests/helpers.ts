import { openDb } from "@/db/client";
import { ensureWorkspace, type Ctx } from "@/services/context";

export function testCtx(): Ctx {
  const db = openDb(":memory:");
  ensureWorkspace(db);
  return { db, workspaceId: "default", actor: { kind: "human", id: "owner" } };
}
