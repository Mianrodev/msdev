/**
 * Signed session tokens (HMAC-SHA256 over an expiry time, the person and their sign-out counter). Pure Web Crypto,
 * so it runs anywhere. The signing secret is supplied by the caller (see
 * src/lib/auth.ts).
 */

export const SESSION_COOKIE = "crm_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
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

export interface SessionClaims {
  userId: string;
  /** The person's sign-out counter when the session was made; bumping it ends every session. */
  epoch: number;
}

/** Token: "{expiry}.{userId}.{epoch}.{signature}", signed over everything before the signature. */
export async function signSession(secret: string, claims: SessionClaims, now = Date.now()): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(claims.userId)) throw new Error("Bad user id");
  const body = `${now + SESSION_DAYS * 86_400_000}.${claims.userId}.${claims.epoch}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** The claims of a genuine, unexpired token — or null. (Whether the person is still allowed in is checked by the caller.) */
export async function verifySession(secret: string, token: string | undefined, now = Date.now()): Promise<SessionClaims | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [exp, userId, epoch, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < now || !/^[A-Za-z0-9_-]+$/.test(userId) || !/^\d+$/.test(epoch) || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(`${exp}.${userId}.${epoch}`));
    return ok ? { userId, epoch: Number(epoch) } : null;
  } catch {
    return null;
  }
}
