/**
 * Request context: which workspace, and who is acting.
 *
 * v1 is single-user: everything runs in the default workspace as the owner.
 * Multi-tenant support replaces `getRequestContext` with a lookup from the
 * authenticated session — services already take a context and scope every
 * query by `ctx.workspaceId`.
 */
import type { Db } from "@/db/client";
import { workspaces } from "@/db/schema";
import type { RuleLike } from "@/core/rules";
import type { Actor } from "@/core/types";

export interface Ctx {
  db: Db;
  workspaceId: string;
  actor: Actor;
  /** Optional preloaded active rules, so batch operations don't re-query them per record. */
  rules?: RuleLike[];
}

export const DEFAULT_WORKSPACE_ID = "default";

export async function ensureWorkspace(db: Db, id = DEFAULT_WORKSPACE_ID, name = "My workspace") {
  await db.insert(workspaces).values({ id, name }).onConflictDoNothing();
}

export function asSystem(ctx: Ctx, process: string): Ctx {
  return { ...ctx, actor: { kind: "system", process } };
}
