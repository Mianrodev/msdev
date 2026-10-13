/**
 * Request context: which workspace, and who is acting. Every service takes a context and scopes every
 * query by `ctx.workspaceId`. One deployment serves one organisation, whose team shares the
 * "default" workspace (see docs/OPPORTUNITIES.md → Tenancy).
 */
import type { Db } from "@/db/client";
import { workspaces } from "@/db/schema";
import type { Actor } from "@/core/types";

export interface Ctx {
  db: Db;
  workspaceId: string;
  actor: Actor;
}

export const DEFAULT_WORKSPACE_ID = "default";

export async function ensureWorkspace(db: Db, id = DEFAULT_WORKSPACE_ID, name = "Workspace") {
  await db.insert(workspaces).values({ id, name }).onConflictDoNothing();
}
