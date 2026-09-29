"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function loginAction(f: FormData) {
  const ok = await checkPassword(String(f.get("password") ?? ""));
  const next = safeNext(f.get("next"));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect(next);
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
