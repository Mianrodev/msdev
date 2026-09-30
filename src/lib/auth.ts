/**
 * Single-owner sign-in (v1).
 *
 * The password is created in the app on first visit and stored only as a
 * salted scrypt hash in the database — no hosting settings needed. (If the
 * APP_PASSWORD environment variable is set, it is used instead.)
 *
 * Sessions are signed with a random secret generated once and stored in the
 * database (or AUTH_SECRET if set). Per-customer accounts replace this when the
 * product goes multi-tenant.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace } from "@/services/context";
import { signSession, verifySession } from "./session";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const PASSWORD_KEY = "auth.passwordHash";
const SECRET_KEY = "auth.sessionSecret";
const RECOVERY_KEY = "auth.recoveryHash";
export const MIN_PASSWORD_LENGTH = 10;

async function readSetting(db: Db, key: string): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, DEFAULT_WORKSPACE_ID), eq(settings.key, key)))
    .limit(1);
  return typeof row?.value === "string" ? row.value : undefined;
}

async function writeSetting(db: Db, key: string, value: string) {
  await ensureWorkspace(db);
  await db
    .insert(settings)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, key, value })
    .onConflictDoUpdate({
      target: [settings.workspaceId, settings.key],
      set: { value, updatedAt: new Date().toISOString() },
    });
}

/** Insert only if absent. Returns true if this call created it. */
async function insertOnce(db: Db, key: string, value: string): Promise<boolean> {
  await ensureWorkspace(db);
  const inserted = await db
    .insert(settings)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, key, value })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  return inserted.length > 0;
}

let cachedSecret: string | undefined;

async function sessionSecret(db: Db): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.APP_PASSWORD) return `crm:${process.env.APP_PASSWORD}`;
  if (cachedSecret) return cachedSecret;
  await insertOnce(db, SECRET_KEY, randomBytes(32).toString("base64url"));
  cachedSecret = await readSetting(db, SECRET_KEY);
  if (!cachedSecret) throw new Error("Could not initialise session secret");
  return cachedSecret;
}

export async function passwordIsSet(db: Db): Promise<boolean> {
  return !!process.env.APP_PASSWORD || !!(await readSetting(db, PASSWORD_KEY));
}

export function passwordManagedByHost(): boolean {
  return !!process.env.APP_PASSWORD;
}

async function hash(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function matches(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  const got = await scrypt(pw, Buffer.from(salt, "base64url"), want.length);
  return timingSafeEqual(got, want);
}

export async function checkPassword(db: Db, given: string): Promise<boolean> {
  if (process.env.APP_PASSWORD) {
    const a = Buffer.from(given);
    const b = Buffer.from(process.env.APP_PASSWORD);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const stored = await readSetting(db, PASSWORD_KEY);
  return !!stored && (await matches(given, stored));
}

export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}

/** First-visit setup. Only succeeds if no password exists yet (atomic). */
export async function createFirstPassword(db: Db, pw: string): Promise<boolean> {
  if (process.env.APP_PASSWORD) return false;
  return insertOnce(db, PASSWORD_KEY, await hash(pw));
}

/** Change the password (caller must have verified the current one). */
export async function changePassword(db: Db, pw: string): Promise<void> {
  await writeSetting(db, PASSWORD_KEY, await hash(pw));
}

// Recovery code: the way back in if the password is forgotten. Shown once, stored only as a hash.
// No 0/O/1/I so it can't be misread when written down.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const cleanCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function hasRecoveryCode(db: Db): Promise<boolean> {
  return !!process.env.APP_PASSWORD || !!(await readSetting(db, RECOVERY_KEY));
}

/** Make a new recovery code (the old one stops working). Returns it for showing once. */
export async function newRecoveryCode(db: Db): Promise<string> {
  const bytes = randomBytes(20);
  const code = Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join("");
  await writeSetting(db, RECOVERY_KEY, await hash(code));
  return code.match(/.{4}/g)!.join("-");
}

/** Forgotten password: a correct recovery code sets a new password. The code is then used up. */
export async function resetWithRecoveryCode(db: Db, code: string, pw: string): Promise<boolean> {
  if (process.env.APP_PASSWORD) return false;
  const stored = await readSetting(db, RECOVERY_KEY);
  if (!stored || !cleanCode(code) || !(await matches(cleanCode(code), stored))) return false;
  await writeSetting(db, PASSWORD_KEY, await hash(pw));
  await writeSetting(db, RECOVERY_KEY, "");
  return true;
}

export async function newSessionToken(db: Db): Promise<string> {
  return signSession(await sessionSecret(db));
}

export async function isValidSession(db: Db, token: string | undefined): Promise<boolean> {
  if (!(await passwordIsSet(db))) return false;
  return verifySession(await sessionSecret(db), token);
}
