/**
 * Sign-in.
 *
 * The owner is defined by two server environment variables, OWNER_EMAIL and OWNER_PASSWORD. There is
 * no first-visit setup and no recovery code: to change or reset the owner's password, change
 * OWNER_PASSWORD in the hosting settings and redeploy — that also signs the owner out everywhere.
 *
 * The owner adds team members (email + name); each gets a one-time temporary password, stored only as
 * a salted scrypt hash, which they replace after signing in. Sessions are HMAC-signed cookies carrying
 * the person's sign-out counter, so a password change, reset or switch-off ends their sessions at once.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "@/db/client";
import { settings, users, type UserRow } from "@/db/schema";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace } from "@/services/context";
import { signSession, verifySession } from "./session";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const OWNER_ID = "owner";
export const MIN_PASSWORD_LENGTH = 12;
const SECRET_KEY = "auth.sessionSecret";

const nowIso = () => new Date().toISOString();
export const cleanEmail = (e: string) => e.trim().toLowerCase();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------------------------------------------------------------- owner configuration

export interface OwnerConfig {
  email: string;
  password: string;
}

/** Why the owner can't sign in yet, in plain words — or null when it's configured correctly. */
export function ownerSetupProblem(): string | null {
  const email = cleanEmail(process.env.OWNER_EMAIL ?? "");
  const pw = process.env.OWNER_PASSWORD ?? "";
  if (!email || !pw) return "Set OWNER_EMAIL and OWNER_PASSWORD in the server's environment variables, then restart or redeploy.";
  if (!EMAIL_RE.test(email)) return "OWNER_EMAIL doesn't look like an email address.";
  if (pw.length < MIN_PASSWORD_LENGTH) return `OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export function ownerConfig(): OwnerConfig | null {
  if (ownerSetupProblem()) return null;
  return { email: cleanEmail(process.env.OWNER_EMAIL!), password: process.env.OWNER_PASSWORD! };
}

// ---------------------------------------------------------------- secrets and hashing

async function readSetting(db: Db, key: string): Promise<unknown> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, DEFAULT_WORKSPACE_ID), eq(settings.key, key)))
    .limit(1);
  return row?.value;
}

/** AUTH_SECRET, or a random secret generated once and stored in the database. */
async function sessionSecret(db: Db): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  await ensureWorkspace(db);
  await db
    .insert(settings)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, key: SECRET_KEY, value: randomBytes(32).toString("base64url") })
    .onConflictDoNothing();
  const secret = await readSetting(db, SECRET_KEY);
  if (typeof secret !== "string" || !secret) throw new Error("Could not initialise session secret");
  return secret;
}

async function hash(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function matches(pw: string, stored: string | null | undefined): Promise<boolean> {
  const [alg, salt, key] = (stored ?? "").split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  const got = await scrypt(pw, Buffer.from(salt, "base64url"), want.length);
  return timingSafeEqual(got, want);
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(sha(a));
  const y = Buffer.from(sha(b));
  return timingSafeEqual(x, y);
}

let dummyHash: Promise<string> | undefined;

export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}

// ---------------------------------------------------------------- people

export async function getUser(db: Db, id: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

export async function listUsers(db: Db): Promise<UserRow[]> {
  return db.select().from(users).orderBy(users.createdAt);
}

/**
 * Make sure the owner's row matches the environment. The row stores a fingerprint of OWNER_PASSWORD;
 * when the password or email changes, the sign-out counter is bumped so old sessions stop working.
 */
async function syncOwner(db: Db, cfg: OwnerConfig): Promise<UserRow> {
  await ensureWorkspace(db);
  const fingerprint = `env:${sha(`${cfg.email}\n${cfg.password}`)}`;
  const existing = await getUser(db, OWNER_ID);
  if (!existing) {
    await db
      .insert(users)
      .values({ id: OWNER_ID, email: cfg.email, name: "Owner", role: "owner", workspaceId: DEFAULT_WORKSPACE_ID, passwordHash: fingerprint })
      .onConflictDoNothing();
  } else if (existing.passwordHash !== fingerprint || existing.email !== cfg.email) {
    await db
      .update(users)
      .set({ email: cfg.email, passwordHash: fingerprint, sessionEpoch: sql`${users.sessionEpoch} + 1`, updatedAt: nowIso() })
      .where(eq(users.id, OWNER_ID));
  }
  return (await getUser(db, OWNER_ID))!;
}

// ---------------------------------------------------------------- guessing protection

// Counted per email *and* connection: after 10 wrong tries, one try a minute from that connection, so
// someone guessing from elsewhere can't lock the real person out. Reserved atomically before checking.
const FREE_TRIES = 10;
const WAIT_MS = 60_000;
const triesKey = (email: string, ip: string) => `auth.tries:${sha(`${email}|${ip}`).slice(0, 32)}`;

export async function reserveTry(db: Db, email: string, ip: string, now = Date.now()): Promise<boolean> {
  await ensureWorkspace(db);
  const rows = await db
    .insert(settings)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, key: triesKey(email, ip), value: { n: 1, at: now } })
    .onConflictDoUpdate({
      target: [settings.workspaceId, settings.key],
      set: { value: sql`json_object('n', coalesce(json_extract(${settings.value}, '$.n'), 0) + 1, 'at', ${now})` },
      setWhere: sql`coalesce(json_extract(${settings.value}, '$.n'), 0) < ${FREE_TRIES} or coalesce(json_extract(${settings.value}, '$.at'), 0) < ${now - WAIT_MS}`,
    })
    .returning({ key: settings.key });
  return rows.length === 1;
}

async function clearTries(db: Db, email: string, ip: string) {
  await db
    .update(settings)
    .set({ value: { n: 0, at: Date.now() } })
    .where(and(eq(settings.workspaceId, DEFAULT_WORKSPACE_ID), eq(settings.key, triesKey(email, ip))));
}

export type SignInResult = { ok: true; user: UserRow } | { ok: false; reason: "throttled" | "wrong" | "setup" };

/** Check an email + password. Takes about the same time whether or not the person exists. */
export async function signIn(db: Db, emailInput: string, password: string, ip = "unknown"): Promise<SignInResult> {
  const email = cleanEmail(emailInput);
  if (!(await reserveTry(db, email, ip))) return { ok: false, reason: "throttled" };
  const cfg = ownerConfig();
  if (cfg && email === cfg.email) {
    if (!sameSecret(password, cfg.password)) return { ok: false, reason: "wrong" };
    await clearTries(db, email, ip);
    return { ok: true, user: await syncOwner(db, cfg) };
  }
  const [u] = email ? await db.select().from(users).where(and(eq(users.email, email), eq(users.role, "member"))).limit(1) : [];
  if (!u) {
    dummyHash ??= hash("not a real password");
    await matches(password, await dummyHash);
    return { ok: false, reason: cfg ? "wrong" : "setup" };
  }
  if (!(await matches(password, u.passwordHash)) || u.status !== "active") return { ok: false, reason: "wrong" };
  await clearTries(db, email, ip);
  return { ok: true, user: u };
}

export async function newSessionToken(db: Db, user: UserRow): Promise<string> {
  await db.update(users).set({ lastSignInAt: nowIso() }).where(eq(users.id, user.id));
  return signSession(await sessionSecret(db), { userId: user.id, epoch: user.sessionEpoch });
}

/** The signed-in person for a session cookie — or null if forged, expired, signed out or switched off. */
export async function sessionUser(db: Db, token: string | undefined): Promise<UserRow | null> {
  const claims = await verifySession(await sessionSecret(db), token);
  if (!claims) return null;
  let u: UserRow | null;
  if (claims.userId === OWNER_ID) {
    const cfg = ownerConfig();
    if (!cfg) return null;
    u = await syncOwner(db, cfg); // a changed OWNER_PASSWORD bumps the counter, ending this session
  } else u = await getUser(db, claims.userId);
  return u && u.status === "active" && u.sessionEpoch === claims.epoch ? u : null;
}

export async function signOutEverywhere(db: Db, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ sessionEpoch: sql`${users.sessionEpoch} + 1`, updatedAt: nowIso() })
    .where(eq(users.id, userId));
}

// ---------------------------------------------------------------- team (owner only)

function tempPassword(): string {
  return randomBytes(12).toString("base64url"); // 16 characters
}

export class AuthError extends Error {}

function assertOwner(actor: UserRow) {
  if (actor.role !== "owner") throw new AuthError("Only the owner can manage the team.");
}

/** Add a team member. Returns their one-time temporary password (shown once, never stored in clear). */
export async function addMember(db: Db, actor: UserRow, input: { email: string; name: string }): Promise<{ user: UserRow; password: string }> {
  assertOwner(actor);
  const email = cleanEmail(input.email);
  const name = input.name.trim().slice(0, 120);
  if (!EMAIL_RE.test(email)) throw new AuthError("That doesn't look like an email address.");
  if (!name) throw new AuthError("Please enter their name.");
  if (email === ownerConfig()?.email) throw new AuthError("That's the owner's email.");
  const password = tempPassword();
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID().replace(/-/g, ""), email, name, role: "member", workspaceId: DEFAULT_WORKSPACE_ID, passwordHash: await hash(password) })
    .onConflictDoNothing()
    .returning();
  if (!user) throw new AuthError("Someone with that email is already on the team.");
  return { user, password };
}

/** New temporary password for a member; their current sessions end. */
export async function resetMemberPassword(db: Db, actor: UserRow, memberId: string): Promise<string> {
  assertOwner(actor);
  const m = await getUser(db, memberId);
  if (!m || m.role !== "member") throw new AuthError("That team member wasn't found.");
  const password = tempPassword();
  await db.update(users).set({ passwordHash: await hash(password), updatedAt: nowIso() }).where(eq(users.id, memberId));
  await signOutEverywhere(db, memberId);
  return password;
}

export async function setMemberStatus(db: Db, actor: UserRow, memberId: string, status: "active" | "disabled"): Promise<void> {
  assertOwner(actor);
  const m = await getUser(db, memberId);
  if (!m || m.role !== "member") throw new AuthError("That team member wasn't found.");
  await db.update(users).set({ status, updatedAt: nowIso() }).where(eq(users.id, memberId));
  if (status === "disabled") await signOutEverywhere(db, memberId);
}

/** Members change their own password (the owner's lives in OWNER_PASSWORD). Other sessions end. */
export async function changeMemberPassword(db: Db, member: UserRow, current: string, next: string, confirm: string): Promise<void> {
  if (member.role !== "member") throw new AuthError("The owner's password is set with OWNER_PASSWORD in the hosting settings.");
  if (!(await matches(current, member.passwordHash))) throw new AuthError("Your current password isn't right.");
  const problem = passwordProblem(next, confirm);
  if (problem) throw new AuthError(problem);
  await db.update(users).set({ passwordHash: await hash(next), updatedAt: nowIso() }).where(eq(users.id, member.id));
  await signOutEverywhere(db, member.id);
}
