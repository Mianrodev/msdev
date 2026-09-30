"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cancelInvite, createInvite, createResetLink, getUser, setPersonActive } from "@/lib/auth";
import { getOwnerSession, getSession, VIEW_COOKIE } from "@/services/request";
import { logHistory } from "@/services/history";

const q = (s: string) => encodeURIComponent(s);
type Made = { code?: string; error?: string } | null;

/** Invite someone: returns their one-time link (shown once). */
export async function inviteAction(_prev: Made, f: FormData): Promise<Made> {
  const { ctx, user } = await getOwnerSession();
  const { token, problem } = await createInvite(ctx.db, { email: String(f.get("email") ?? ""), name: String(f.get("name") ?? ""), createdBy: user.id });
  if (problem || !token) return { error: problem ?? "Couldn't make the invite." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  revalidatePath("/team");
  return { code: `${proto}://${host}/join/${token}` };
}

/** A one-time link for a team member who's locked out: they choose a new password (shown once). */
export async function resetLinkAction(id: string, _prev: Made): Promise<Made> {
  const { ctx, user } = await getOwnerSession();
  try {
    const token = await createResetLink(ctx.db, id, user.id);
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return { code: `${proto}://${host}/join/${token}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't make the link." };
  }
}

export async function cancelInviteAction(id: string) {
  const { ctx } = await getOwnerSession();
  await cancelInvite(ctx.db, id);
  redirect("/team?ok=" + q("Invite cancelled — that link no longer works."));
}

export async function setPersonActiveAction(id: string, on: boolean) {
  const { ctx } = await getOwnerSession();
  const person = await getUser(ctx.db, id);
  await setPersonActive(ctx.db, id, on);
  const who = person?.name ?? "They";
  redirect(
    "/team?ok=" +
      q(on ? `${who} can sign in again.` : `${who} is switched off: signed out everywhere and can't sign in. Their data is kept.`),
  );
}

/** Open a team member's space (the owner only). Everything you change there is recorded as yours. */
export async function viewSpaceAction(id: string) {
  const { ctx, user } = await getOwnerSession();
  const person = await getUser(ctx.db, id);
  if (!person || person.role !== "member") redirect("/team?error=" + q("That person wasn't found."));
  (await cookies()).set(VIEW_COOKIE, person.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  await logHistory(
    { db: ctx.db, workspaceId: person.workspaceId, actor: { kind: "human", id: user.id } },
    { entityType: "setting", event: "owner_opened_space", reason: "The owner opened this space" },
  );
  redirect("/?ok=" + q(`You're now looking at ${person.name}'s space.`));
}

export async function backToMySpaceAction() {
  await getSession();
  (await cookies()).delete(VIEW_COOKIE);
  redirect("/team?ok=" + q("Back in your own space."));
}
