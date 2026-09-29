/**
 * Resolve the context for a web request. v1: single owner, default workspace.
 * This is the one place to change when adding per-customer accounts — resolve
 * the signed-in user here and return their workspace and identity.
 */
import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { authRequired, SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace, type Ctx } from "./context";

export class UnauthorizedError extends Error {}

let ready: Promise<void> | undefined;

export async function getCtx(): Promise<Ctx> {
  // Defence in depth: proxy.ts already gates every request; data access checks again.
  if (authRequired() && !(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    throw new UnauthorizedError("Not signed in");
  }
  const db = await getDb();
  ready ??= ensureWorkspace(db);
  await ready;
  return { db, workspaceId: DEFAULT_WORKSPACE_ID, actor: { kind: "human", id: "owner" } };
}
