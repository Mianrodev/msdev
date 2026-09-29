/**
 * Resolve the context for a web request. v1: single user, default workspace.
 * This is the one place to change when adding authentication — resolve the
 * user's session here and return their workspace and identity.
 */
import "server-only";
import { getDb } from "@/db/client";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace, type Ctx } from "./context";

let ready = false;

export function getCtx(): Ctx {
  const db = getDb();
  if (!ready) {
    ensureWorkspace(db);
    ready = true;
  }
  return { db, workspaceId: DEFAULT_WORKSPACE_ID, actor: { kind: "human", id: "owner" } };
}
