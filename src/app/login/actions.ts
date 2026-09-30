"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  changePassword,
  checkPassword,
  createFirstPassword,
  newRecoveryCode,
  newSessionToken,
  noteTry,
  passwordProblem,
  resetWithRecoveryCode,
  signOutEverywhere,
  tooManyTries,
} from "@/lib/auth";
import { newAiKey, removeAiKey } from "@/lib/ai-key";
import { safeNext } from "@/lib/safe-next";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { getCtx } from "@/services/request";

const WAIT_MSG = "Too many wrong tries. Wait one minute, then try again.";

async function startSession() {
  const db = await getDb();
  (await cookies()).set(SESSION_COOKIE, await newSessionToken(db), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

const q = (s: string) => encodeURIComponent(s);

export async function setupAction(f: FormData) {
  const pw = String(f.get("password") ?? "");
  const problem = passwordProblem(pw, String(f.get("confirm") ?? ""));
  if (problem) redirect(`/login?error=${q(problem)}`);
  const created = await createFirstPassword(await getDb(), pw);
  if (!created) redirect(`/login?error=${q("A password has already been set. Sign in with it.")}`);
  await startSession();
  redirect("/?ok=" + q("Password created — you're signed in. Next, save a recovery code in case you ever forget it."));
}

export async function loginAction(f: FormData) {
  const next = safeNext(f.get("next"));
  const db = await getDb();
  if (await tooManyTries(db)) redirect(`/login?error=${q(WAIT_MSG)}&next=${q(next)}`);
  const right = await checkPassword(db, String(f.get("password") ?? ""));
  await noteTry(db, right);
  if (!right) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    redirect(`/login?error=${q("Wrong password.")}&next=${q(next)}`);
  }
  await startSession();
  redirect(next);
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePasswordAction(f: FormData) {
  const ctx = await getCtx();
  let msg: string;
  if (!(await checkPassword(ctx.db, String(f.get("current") ?? "")))) msg = "error=" + q("Current password is wrong.");
  else {
    const pw = String(f.get("password") ?? "");
    const problem = passwordProblem(pw, String(f.get("confirm") ?? ""));
    if (problem) msg = "error=" + q(problem);
    else {
      await changePassword(ctx.db, pw);
      await startSession(); // everyone else is signed out; you stay signed in here
      msg = "ok=" + q("Password changed. Any other device that was signed in has been signed out, and any AI link was switched off.");
    }
  }
  redirect(`/account?${msg}`);
}

export async function resetPasswordAction(f: FormData) {
  const pw = String(f.get("password") ?? "");
  const problem = passwordProblem(pw, String(f.get("confirm") ?? ""));
  if (problem) redirect(`/login?forgot=1&error=${q(problem)}`);
  const db = await getDb();
  if (await tooManyTries(db)) redirect(`/login?forgot=1&error=${q(WAIT_MSG)}`);
  const right = await resetWithRecoveryCode(db, String(f.get("code") ?? ""), pw);
  await noteTry(db, right);
  if (!right) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    redirect(`/login?forgot=1&error=${q("That recovery code isn't right (or it was already used). Check each letter and try again.")}`);
  }
  await startSession();
  redirect(
    "/?ok=" + q("New password saved — you're signed in. Your recovery code is now used up, so make a new one (see Getting started below)."),
  );
}

type Made = { code?: string; error?: string } | null;

/** Making a recovery code or AI link needs your password too, so a borrowed signed-in browser can't. */
async function confirmedCtx(f: FormData) {
  const ctx = await getCtx();
  if (await tooManyTries(ctx.db)) return { ctx, error: WAIT_MSG };
  const right = await checkPassword(ctx.db, String(f.get("password") ?? ""));
  await noteTry(ctx.db, right);
  return { ctx, error: right ? null : "That password isn't right." };
}

/** Shown once on screen; only a hash is kept. */
export async function makeRecoveryCodeAction(_prev: Made, f: FormData): Promise<Made> {
  const { ctx, error } = await confirmedCtx(f);
  if (error) return { error };
  const code = await newRecoveryCode(ctx.db);
  revalidatePath("/", "layout"); // "Saved" label and the Getting started guide update straight away
  return { code };
}

/** "Connect your AI": make the private link (shown once; only a scrambled copy is kept). */
export async function makeAiLinkAction(_prev: Made, f: FormData): Promise<Made> {
  const { ctx, error } = await confirmedCtx(f);
  if (error) return { error };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const key = await newAiKey(ctx.db);
  revalidatePath("/", "layout");
  return { code: `${proto}://${host}/api/mcp/${key}` };
}

export async function signOutEverywhereAction() {
  const ctx = await getCtx();
  await signOutEverywhere(ctx.db);
  await startSession();
  redirect("/account?ok=" + q("Done. Every other device is signed out. You're still signed in here."));
}

export async function removeAiLinkAction() {
  const ctx = await getCtx();
  await removeAiKey(ctx.db);
  revalidatePath("/", "layout");
  redirect("/connect?ok=" + q("Switched off. Your AI can no longer see your tracker. You can make a new link any time."));
}
