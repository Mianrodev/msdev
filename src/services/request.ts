/**
 * Resolve the context for a web request: who is signed in, and which workspace
 * they're working in. Members always work in their own workspace; the owner
 * works in theirs, or — when they've chosen "Open their space" on the Team
 * page — in a member's (their changes are recorded as the owner's).
 */
import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users, type UserRow } from "@/db/schema";
import { OWNER_ID, sessionUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { ensureWorkspace, type Ctx } from "./context";

export const VIEW_COOKIE = "crm_view";

let ready: Promise<void> | undefined;

export interface Session {
  ctx: Ctx;
  user: UserRow;
  /** Set when the owner is looking at a team member's space. */
  viewing: UserRow | null;
}

/** The signed-in person and their context, or null (no redirect) — for the layout. */
export async function currentSession(): Promise<Session | null> {
  const db = await getDb();
  ready ??= ensureWorkspace(db);
  await ready;
  const jar = await cookies();
  const user = await sessionUser(db, jar.get(SESSION_COOKIE)?.value);
  if (!user) return null;
  let viewing: UserRow | null = null;
  const view = jar.get(VIEW_COOKIE)?.value;
  if (user.role === "owner" && view && view !== OWNER_ID) {
    const [m] = await db.select().from(users).where(eq(users.id, view)).limit(1);
    viewing = m && m.role === "member" ? m : null;
  }
  return {
    ctx: { db, workspaceId: (viewing ?? user).workspaceId, actor: { kind: "human", id: user.id } },
    user,
    viewing,
  };
}

/** Every page, form action and export gets its session here — and is sent to sign in without one. */
export async function getSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s;
}

export async function getCtx(): Promise<Ctx> {
  return (await getSession()).ctx;
}

/** For owner-only pages and actions (the Team page). */
export async function getOwnerSession(): Promise<Session> {
  const s = await getSession();
  if (s.user.role !== "owner") redirect("/");
  return s;
}

/** For "who did it" in Activity: the reader, and everyone's names. */
export async function viewerFor(session: Session): Promise<{ me: string; names: Record<string, string> }> {
  const rows = await session.ctx.db.select({ id: users.id, name: users.name }).from(users);
  return { me: session.user.id, names: Object.fromEntries(rows.map((r) => [r.id, r.id === "owner" ? `${r.name} (owner)` : r.name])) };
}
