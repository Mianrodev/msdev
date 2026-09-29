/**
 * Single-owner password login (v1).
 *
 * The password comes from the APP_PASSWORD environment variable (set in
 * Vercel). A successful login sets a signed, http-only cookie; the signature
 * key is derived from AUTH_SECRET if set, otherwise from APP_PASSWORD — so
 * changing the password signs everyone out.
 *
 * Per-customer accounts replace this when the product goes multi-tenant.
 */

export const SESSION_COOKIE = "crm_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

export function authConfigured(): boolean {
  return !!process.env.APP_PASSWORD;
}

/** Local development without a password is allowed; a deployed app without one is locked. */
export function authRequired(): boolean {
  return authConfigured() || process.env.NODE_ENV === "production";
}

async function key(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET || `crm:${process.env.APP_PASSWORD ?? ""}`;
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_DAYS * 86_400_000);
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(exp));
  return `${exp}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !authConfigured()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  try {
    return await crypto.subtle.verify("HMAC", await key(), fromB64url(sig), enc.encode(exp));
  } catch {
    return false;
  }
}

/** Constant-time password check. */
export async function checkPassword(given: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const k = await key();
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", k, enc.encode(given)),
    crypto.subtle.sign("HMAC", k, enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
