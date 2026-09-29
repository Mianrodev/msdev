/**
 * Resolve the context for a web request. v1: single owner, default workspace.
 * This is the one place to change when adding per-customer accounts — resolve
 * the signed-in user here and return their workspace and identity.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { isValidSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace, type Ctx } from "./context";

let ready: Promise<void> | undefined;

/** Every page, form action and export gets its context here — and is refused unless signed in. */
export async function getCtx(): Promise<Ctx> {
  const db = await getDb();
  ready ??= ensureWorkspace(db);
  await ready;
  if (!(await isValidSession(db, (await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  return { db, workspaceId: DEFAULT_WORKSPACE_ID, actor: { kind: "human", id: "owner" } };
}
