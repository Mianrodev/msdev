"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMember, AuthError, changeMemberPassword, getUser, newSessionToken, resetMemberPassword, setMemberStatus, signOutEverywhere } from "@/lib/auth";
import { setSessionCookie } from "@/lib/cookie";
import { logHistory } from "@/services/history";
import { getSession } from "@/services/request";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

export type Shown = { password?: string; who?: string; error?: string } | null;

const msg = (e: unknown) => (e instanceof AuthError ? e.message : "That didn't work. Please try again.");

/** Owner adds a member; the temporary password is returned to the page once (never put in a URL). */
export async function addMemberAction(_prev: Shown, f: FormData): Promise<Shown> {
  const s = await getSession();
  try {
    const { user, password } = await addMember(s.ctx.db, s.user, { email: str(f, "email"), name: str(f, "name") });
    await logHistory(s.ctx, { entityType: "user", entityId: user.id, event: "member_added", reason: user.email });
    revalidatePath("/account");
    return { password, who: user.email };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function resetMemberAction(memberId: string, _prev: Shown): Promise<Shown> {
  const s = await getSession();
  try {
    const password = await resetMemberPassword(s.ctx.db, s.user, memberId);
    const m = await getUser(s.ctx.db, memberId);
    await logHistory(s.ctx, { entityType: "user", entityId: memberId, event: "password_reset", reason: m?.email });
    return { password, who: m?.email };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function memberStatusAction(memberId: string, status: "active" | "disabled") {
  const s = await getSession();
  let target = "/account?ok=Saved";
  try {
    await setMemberStatus(s.ctx.db, s.user, memberId, status);
    await logHistory(s.ctx, { entityType: "user", entityId: memberId, event: `member_${status}` });
  } catch (e) {
    target = `/account?error=${encodeURIComponent(msg(e))}`;
  }
  revalidatePath("/account");
  redirect(target);
}

export async function changePasswordAction(f: FormData) {
  const s = await getSession();
  let target = "/account?ok=Password changed. Your other sessions have been signed out.";
  try {
    await changeMemberPassword(s.ctx.db, s.user, str(f, "current"), str(f, "password"), str(f, "confirm"));
    const fresh = (await getUser(s.ctx.db, s.user.id))!;
    await setSessionCookie(await newSessionToken(s.ctx.db, fresh)); // keep this browser signed in
  } catch (e) {
    target = `/account?error=${encodeURIComponent(msg(e))}`;
  }
  redirect(target);
}

export async function signOutEverywhereAction() {
  const s = await getSession();
  await signOutEverywhere(s.ctx.db, s.user.id);
  const fresh = (await getUser(s.ctx.db, s.user.id))!;
  await setSessionCookie(await newSessionToken(s.ctx.db, fresh));
  redirect("/account?ok=Signed out on every other device.");
}
