"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { newSessionToken, signIn } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { setSessionCookie } from "@/lib/cookie";
import { SESSION_COOKIE } from "@/lib/session";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function signInAction(f: FormData) {
  const next = safeNext(f.get("next"));
  const db = await getDb();
  const res = await signIn(db, str(f, "email"), str(f, "password"), await clientIp());
  if (!res.ok) {
    const msg =
      res.reason === "throttled"
        ? "Too many tries. Wait a minute and try again."
        : res.reason === "setup"
          ? "This app has no owner configured yet — see the note below."
          : "That email and password don't match.";
    const u = new URLSearchParams({ error: msg, email: str(f, "email"), next });
    redirect(`/login?${u}`);
  }
  await setSessionCookie(await newSessionToken(db, res.user));
  redirect(next === "/" ? "/opportunities" : next);
}

export async function signOutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
