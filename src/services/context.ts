/**
 * Request context: which workspace, and who is acting.
 *
 * v1 is single-user: everything runs in the default workspace as the owner.
 * Multi-tenant support replaces `getRequestContext` with a lookup from the
 * authenticated session — services already take a context and scope every
 * query by `ctx.workspaceId`.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { workspaces } from "@/db/schema";
import type { Actor } from "@/core/types";

export interface Ctx {
  db: Db;
  workspaceId: string;
  actor: Actor;
}

export const DEFAULT_WORKSPACE_ID = "default";

export function ensureWorkspace(db: Db, id = DEFAULT_WORKSPACE_ID, name = "My workspace") {
  const existing = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!existing) db.insert(workspaces).values({ id, name }).run();
}

export function asSystem(ctx: Ctx, process: string): Ctx {
  return { ...ctx, actor: { kind: "system", process } };
}
