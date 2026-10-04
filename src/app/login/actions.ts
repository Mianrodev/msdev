"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { UserRow } from "@/db/schema";
import {
  acceptInvite,
  changePassword,
  checkUserPassword,
  createFirstPassword,
  findSignIn,
  getUser,
  inviteFor,
  newRecoveryCode,
  newSessionToken,
  OWNER_ID,
  passwordProblem,
  resetWithRecoveryCode,
  saveOwnerEmail,
  signIn,
  sessionUser,
  signOutEverywhere,
  checkOrPretend,
  clearTries,
  reserveTry,
} from "@/lib/auth";
import { newAiKey, removeAiKey } from "@/lib/ai-key";
import { safeNext } from "@/lib/safe-next";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { seedDiscoveryRules } from "@/services/discovery";
import { getSession, VIEW_COOKIE } from "@/services/request";
import { seedDefaultRules } from "@/services/rules";

/** The visitor's connection (Vercel puts it first in x-forwarded-for). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/**
 * Check a password with guessing protection. For an email with no account there's nothing to
 * protect: the same work is done and the same answer given, so nobody can tell which emails exist.
 */
async function guardedCheck(
  db: Awaited<ReturnType<typeof getDb>>,
  who: UserRow | null,
  password: string,
): Promise<"ok" | "wrong" | "wait" | "off"> {
  if (!who) {
    await checkOrPretend(null, password);
    return "wrong";
  }
  const ip = await clientIp();
  if (!(await reserveTry(db, who.id, ip))) return "wait";
  if (!(await checkOrPretend(who, password))) return "wrong";
  if (who.status !== "active") return "off"; // the right password, but the owner switched this account off
  await clearTries(db, who.id, ip);
  return "ok";
}
const WAIT_MSG = "Too many wrong tries. Wait one minute, then try again.";
const q = (s: string) => encodeURIComponent(s);

async function startSession(user: UserRow) {
  const db = await getDb();
  const fresh = (await getUser(db, user.id)) ?? user; // current sign-out counter
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await newSessionToken(db, fresh), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  jar.delete(VIEW_COOKIE);
}

export async function setupAction(f: FormData) {
  const pw = String(f.get("password") ?? "");
  const problem = passwordProblem(pw, String(f.get("confirm") ?? ""));
  if (problem) redirect(`/login?error=${q(problem)}`);
  const db = await getDb();
  if (!(await createFirstPassword(db, pw))) redirect(`/login?error=${q("A password has already been set. Sign in with it.")}`);
  await startSession((await getUser(db, OWNER_ID))!);
  redirect("/?ok=" + q("Password created — you're signed in. Next, save a recovery code in case you ever forget it."));
}

export async function loginAction(f: FormData) {
  const next = safeNext(f.get("next"));
  const email = String(f.get("email") ?? "");
  const back = (msg: string) => `/login?error=${q(msg)}&next=${q(next)}${email ? `&email=${q(email)}` : ""}`;
  const db = await getDb();
  const who = await findSignIn(db, email);
  const result = await guardedCheck(db, who, String(f.get("password") ?? ""));
  if (result === "wait") redirect(back(WAIT_MSG));
  if (result === "off")
    redirect(
      back("Your account has been switched off by the owner. Ask them to switch it back on — nothing of yours has been deleted."),
    );
  if (result === "wrong") {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    redirect(back(email ? "Wrong email or password." : "Wrong password. (Team members: type your email too.)"));
  }
  const user = who!;
  await startSession(user);
  redirect(next);
}

/** Sign out: the cookie goes, and the session itself stops working everywhere it was used. */
export async function logoutAction() {
  const jar = await cookies();
  const db = await getDb();
  const user = await sessionUser(db, jar.get(SESSION_COOKIE)?.value);
  if (user) await signOutEverywhere(db, user.id);
  jar.delete(SESSION_COOKIE);
  jar.delete(VIEW_COOKIE);
  redirect("/login");
}

export async function changePasswordAction(f: FormData) {
  const { user, ctx } = await getSession();
  let msg: string;
  if (!(await checkUserPassword(user, String(f.get("current") ?? "")))) msg = "error=" + q("Current password is wrong.");
  else {
    const pw = String(f.get("password") ?? "");
    const problem = passwordProblem(pw, String(f.get("confirm") ?? ""));
    if (problem) msg = "error=" + q(problem);
    else {
      await changePassword(ctx.db, user.id, pw);
      await startSession(user); // everyone else is signed out; you stay signed in here
      msg =
        "ok=" + q("Password changed. Any other device that was signed in has been signed out, and any AI link was switched off.");
    }
  }
  redirect(`/account?${msg}`);
}

export async function ownerEmailAction(f: FormData) {
  const { user, ctx } = await getSession();
  if (user.id !== OWNER_ID) redirect("/account");
  const problem = await saveOwnerEmail(ctx.db, String(f.get("email") ?? ""));
  redirect(
    `/account?${problem ? "error=" + q(problem) : "ok=" + q("Saved. You can sign in with this email and your password (or leave the email empty).")}`,
  );
}

export async function resetPasswordAction(f: FormData) {
  const email = String(f.get("email") ?? "");
  const pw = String(f.get("password") ?? "");
  const back = (msg: string) => `/login?forgot=1&error=${q(msg)}${email ? `&email=${q(email)}` : ""}`;
  const problem = passwordProblem(pw, String(f.get("confirm") ?? ""));
  if (problem) redirect(back(problem));
  const db = await getDb();
  const who = await findSignIn(db, email);
  const ip = await clientIp();
  if (who && !(await reserveTry(db, who.id, ip))) redirect(back(WAIT_MSG));
  const right = await resetWithRecoveryCode(db, email, String(f.get("code") ?? ""), pw);
  if (!right) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    redirect(back("That recovery code isn't right (or it was already used). Check the email and each letter, then try again."));
  }
  if (who) await clearTries(db, who.id, ip);
  const user = (await signIn(db, email, pw))!;
  await startSession(user);
  redirect(
    "/?ok=" +
      q(
        "New password saved — you're signed in. Your recovery code is now used up, so make a new one (see Getting started below).",
      ),
  );
}

/** Accept an invite: set a password, get your own private space, and you're in. */
export async function joinAction(token: string, f: FormData) {
  const pw = String(f.get("password") ?? "");
  const problem = passwordProblem(pw, String(f.get("confirm") ?? ""));
  if (problem) redirect(`/join/${token}?error=${q(problem)}`);
  const db = await getDb();
  const isReset = !!(await inviteFor(db, token))?.userId;
  const user = await acceptInvite(db, token, pw);
  if (!user) redirect(`/join/${token}?error=${q("This link has already been used or has expired. Ask for a new one.")}`);
  await startSession(user);
  if (isReset) redirect("/?ok=" + q("New password saved — you're signed in."));
  const ctx = { db, workspaceId: user.workspaceId, actor: { kind: "human" as const, id: user.id } };
  await seedDefaultRules(ctx);
  await seedDiscoveryRules(ctx);
  redirect("/?ok=" + q(`Welcome, ${user.name}! This is your own private space. Follow the Getting started steps below.`));
}

type Made = { code?: string; error?: string } | null;

/** Making a recovery code or AI link needs your password too, so a borrowed signed-in browser can't. */
async function confirmed(f: FormData) {
  const session = await getSession();
  const result = await guardedCheck(session.ctx.db, session.user, String(f.get("password") ?? ""));
  return {
    session,
    error:
      result === "ok"
        ? null
        : result === "wait"
          ? WAIT_MSG
          : result === "off"
            ? "This account is switched off."
            : "That password isn't right.",
  };
}

/** Shown once on screen; only a hash is kept. */
export async function makeRecoveryCodeAction(_prev: Made, f: FormData): Promise<Made> {
  const { session, error } = await confirmed(f);
  if (error) return { error };
  const code = await newRecoveryCode(session.ctx.db, session.user.id);
  revalidatePath("/", "layout"); // "Saved" label and the Getting started guide update straight away
  return { code };
}

/** "Connect your AI": make the private link for your own space (shown once; only a scrambled copy is kept). */
export async function makeAiLinkAction(_prev: Made, f: FormData): Promise<Made> {
  const { session, error } = await confirmed(f);
  if (error) return { error };
  if (session.viewing)
    return { error: "Switch back to your own space first — AI links are made by each person for their own space." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const key = await newAiKey(session.ctx.db, session.user.workspaceId);
  revalidatePath("/", "layout");
  return { code: `${proto}://${host}/api/mcp/${key}` };
}

export async function signOutEverywhereAction() {
  const { user, ctx } = await getSession();
  await signOutEverywhere(ctx.db, user.id);
  await startSession(user);
  redirect("/account?ok=" + q("Done. Every other device is signed out. You're still signed in here."));
}

export async function removeAiLinkAction() {
  const { user, ctx } = await getSession();
  await removeAiKey(ctx.db, user.workspaceId);
  revalidatePath("/", "layout");
  redirect("/connect?ok=" + q("Switched off. Your AI can no longer see your tracker. You can make a new link any time."));
}
