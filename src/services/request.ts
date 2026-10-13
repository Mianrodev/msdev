/** The signed-in person and their context for a web request. Every page, action and export uses this. */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { UserRow } from "@/db/schema";
import { sessionUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { ensureWorkspace, type Ctx } from "./context";

let ready: Promise<void> | undefined;

export interface Session {
  ctx: Ctx;
  user: UserRow;
}

/** The signed-in person, or null (no redirect) — for the layout. */
export async function currentSession(): Promise<Session | null> {
  const db = await getDb();
  ready ??= ensureWorkspace(db);
  await ready;
  const user = await sessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return null;
  return { ctx: { db, workspaceId: user.workspaceId, actor: { kind: "human", id: user.id } }, user };
}

/** Pages, actions and exports get their session here — and are sent to sign in without one. */
export async function getSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s;
}

export async function getCtx(): Promise<Ctx> {
  return (await getSession()).ctx;
}
