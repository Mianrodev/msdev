/**
 * Team sign-in: one shared password (the FORGE_PASSWORD secret). A signed-in
 * browser holds a cookie of "<expiry>.<HMAC(expiry)>", keyed by the password,
 * so changing the password signs everyone out.
 */
import type { Env } from "./env";

const COOKIE = "forge_session";
const DAYS = 30;
const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string compare. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signedIn(req: Request, env: Env): Promise<boolean> {
  if (!env.FORGE_PASSWORD) return false;
  const raw = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await hmac(env.FORGE_PASSWORD, exp));
}

export async function checkPassword(env: Env, given: string): Promise<boolean> {
  if (!env.FORGE_PASSWORD) return false;
  const [a, b] = await Promise.all([hmac("pw", given), hmac("pw", env.FORGE_PASSWORD)]);
  return same(a, b);
}

export async function sessionCookie(env: Env): Promise<string> {
  const exp = String(Date.now() + DAYS * 86400_000);
  const value = `${exp}.${await hmac(env.FORGE_PASSWORD ?? "", exp)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

export const signOutCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
