"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { changePassword, checkPassword, createFirstPassword, newSessionToken, passwordProblem } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { getCtx } from "@/services/request";

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

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
  redirect("/import?ok=" + q("Password created — you're signed in. Next: upload your tracker workbook."));
}

export async function loginAction(f: FormData) {
  const next = safeNext(f.get("next"));
  if (!(await checkPassword(await getDb(), String(f.get("password") ?? "")))) {
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
      msg = "ok=" + q("Password changed.");
    }
  }
  redirect(`/settings?${msg}`);
}
