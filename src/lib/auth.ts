/**
 * People and sign-in.
 *
 * The owner creates their password on first visit and runs the default
 * workspace. They invite team members with one-time links; each member gets a
 * private workspace. Passwords and recovery codes are stored only as salted
 * scrypt hashes. (If APP_PASSWORD is set in the hosting settings, it is the
 * owner's password instead.)
 *
 * Sessions are signed with a random secret stored in the database (or
 * AUTH_SECRET) and carry the person's sign-out counter, so "sign out
 * everywhere", a password change or switching an account off ends their
 * sessions straight away.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "@/db/client";
import { invites, settings, users, workspaces, type InviteRow, type UserRow } from "@/db/schema";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace } from "@/services/context";
import { removeAiKey } from "./ai-key";
import { signSession, verifySession } from "./session";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const OWNER_ID = "owner";
const SECRET_KEY = "auth.sessionSecret";
export const MIN_PASSWORD_LENGTH = 10;
const INVITE_DAYS = 7;

const nowIso = () => new Date().toISOString();
export const cleanEmail = (e: string) => e.trim().toLowerCase();

// ---------------------------------------------------------------- app-wide settings (default workspace)

async function readSetting(db: Db, key: string): Promise<unknown> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, DEFAULT_WORKSPACE_ID), eq(settings.key, key)))
    .limit(1);
  return row?.value;
}

async function writeSetting(db: Db, key: string, value: unknown) {
  await ensureWorkspace(db);
  await db
    .insert(settings)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, key, value })
    .onConflictDoUpdate({ target: [settings.workspaceId, settings.key], set: { value, updatedAt: nowIso() } });
}

// Read on every check (one quick query), so it's the same on every server.
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

// ---------------------------------------------------------------- hashing

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

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}

// ---------------------------------------------------------------- people

export function passwordManagedByHost(): boolean {
  return !!process.env.APP_PASSWORD;
}

export async function getUser(db: Db, id: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

async function ownerRow(db: Db): Promise<UserRow | null> {
  const owner = await getUser(db, OWNER_ID);
  if (owner || !process.env.APP_PASSWORD) return owner;
  // Password kept in the hosting settings: the owner's row is made on first use.
  await ensureWorkspace(db);
  await db
    .insert(users)
    .values({ id: OWNER_ID, name: "Owner", role: "owner", workspaceId: DEFAULT_WORKSPACE_ID, passwordHash: "host" })
    .onConflictDoNothing();
  return getUser(db, OWNER_ID);
}

/** Has the owner set up the app yet? (Before that, the first visit creates the owner's password.) */
export async function passwordIsSet(db: Db): Promise<boolean> {
  return !!process.env.APP_PASSWORD || !!(await getUser(db, OWNER_ID));
}

/** First-visit setup. Only succeeds if there's no owner yet (atomic). */
export async function createFirstPassword(db: Db, pw: string): Promise<boolean> {
  if (process.env.APP_PASSWORD) return false;
  await ensureWorkspace(db);
  const made = await db
    .insert(users)
    .values({ id: OWNER_ID, name: "Owner", role: "owner", workspaceId: DEFAULT_WORKSPACE_ID, passwordHash: await hash(pw) })
    .onConflictDoNothing()
    .returning({ id: users.id });
  return made.length > 0;
}

export async function checkUserPassword(user: UserRow, given: string): Promise<boolean> {
  if (user.id === OWNER_ID && process.env.APP_PASSWORD) {
    const a = Buffer.from(given);
    const b = Buffer.from(process.env.APP_PASSWORD);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return matches(given, user.passwordHash);
}

/** Who is signing in: an empty email means the owner. */
export async function findSignIn(db: Db, email: string): Promise<UserRow | null> {
  const e = cleanEmail(email);
  if (!e) return ownerRow(db);
  const [u] = await db.select().from(users).where(eq(users.email, e)).limit(1);
  return u ?? (await ownerByEmail(db, e));
}

/** The owner can also sign in with the email they saved on their Password page. */
async function ownerByEmail(db: Db, e: string): Promise<UserRow | null> {
  const owner = await ownerRow(db);
  return owner?.email === e ? owner : null;
}

let dummyHash: Promise<string> | undefined;

/** Check a password for someone who may not exist, taking the same time either way (one scrypt). */
export async function checkOrPretend(u: UserRow | null, password: string): Promise<boolean> {
  if (u) return checkUserPassword(u, password);
  dummyHash ??= hash("not a real password");
  await matches(password, await dummyHash);
  return false;
}

/** Check an email + password. Returns the person only if the password is right and the account is on. */
export async function signIn(db: Db, email: string, password: string): Promise<UserRow | null> {
  const u = await findSignIn(db, email);
  const right = await checkOrPretend(u, password);
  return u && right && u.status === "active" ? u : null;
}

export async function newSessionToken(db: Db, user: UserRow): Promise<string> {
  await db.update(users).set({ lastSignInAt: nowIso() }).where(eq(users.id, user.id));
  return signSession(await sessionSecret(db), { userId: user.id, epoch: user.sessionEpoch });
}

/** The signed-in person for a session cookie — or null if it's forged, expired, signed out or switched off. */
export async function sessionUser(db: Db, token: string | undefined): Promise<UserRow | null> {
  const claims = await verifySession(await sessionSecret(db), token);
  if (!claims) return null;
  const u = claims.userId === OWNER_ID ? await ownerRow(db) : await getUser(db, claims.userId);
  return u && u.status === "active" && u.sessionEpoch === claims.epoch ? u : null;
}

/** Ends every session this person has, on every device (the caller signs them back in here). */
export async function signOutEverywhere(db: Db, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ sessionEpoch: sql`${users.sessionEpoch} + 1`, updatedAt: nowIso() })
    .where(eq(users.id, userId));
}

/** Unused password links for this person stop working (after a password change, reset or switch-off). */
async function expireResetLinks(db: Db, userId: string) {
  await db
    .update(invites)
    .set({ expiresAt: nowIso(), updatedAt: nowIso() })
    .where(and(eq(invites.userId, userId), sql`${invites.usedAt} is null`));
}

/** Change the password (caller must have verified the current one). Other sessions and the AI link end. */
export async function changePassword(db: Db, userId: string, pw: string): Promise<void> {
  const u = await getUser(db, userId);
  if (!u) throw new Error("Unknown person");
  await db.update(users).set({ passwordHash: await hash(pw), updatedAt: nowIso() }).where(eq(users.id, userId));
  await signOutEverywhere(db, userId);
  await removeAiKey(db, u.workspaceId);
  await expireResetLinks(db, userId);
}

export async function saveOwnerEmail(db: Db, email: string): Promise<string | null> {
  const e = cleanEmail(email);
  if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return "That doesn't look like an email address.";
  if (e) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, e)).limit(1);
    if (taken && taken.id !== OWNER_ID) return "Someone on your team already uses that email.";
    const [invited] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.email, e), sql`${invites.usedAt} is null`, sql`${invites.expiresAt} > ${nowIso()}`))
      .limit(1);
    if (invited) return "You've invited someone with that email. Cancel that invite on the Team page first.";
  }
  await db.update(users).set({ email: e || null, updatedAt: nowIso() }).where(eq(users.id, OWNER_ID));
  return null;
}

// ---------------------------------------------------------------- guessing protection

// Counted per account *and* connection: after 10 wrong tries, one try a minute from that connection.
// Someone guessing from their own connection can't lock the real person out of theirs. Tries are
// reserved atomically before the password is checked, so many sent at once still count.
const FREE_TRIES = 10;
const WAIT_MS = 60_000;
const triesKey = (userId: string, ip: string) => `auth.tries:${sha(`${userId}|${ip}`).slice(0, 32)}`;

/** Reserve one try for this account from this connection. False = wait a minute. */
export async function reserveTry(db: Db, userId: string, ip: string, now = Date.now()): Promise<boolean> {
  await ensureWorkspace(db);
  const rows = await db
    .insert(settings)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, key: triesKey(userId, ip), value: { n: 1, at: now } })
    .onConflictDoUpdate({
      target: [settings.workspaceId, settings.key],
      set: { value: sql`jsonb_build_object('n', coalesce((${settings.value}->>'n')::int, 0) + 1, 'at', ${now}::bigint)` },
      where: sql`coalesce((${settings.value}->>'n')::int, 0) < ${FREE_TRIES} or coalesce((${settings.value}->>'at')::bigint, 0) < ${now - WAIT_MS}`,
    })
    .returning({ key: settings.key });
  return rows.length === 1;
}

/** A right password clears the count. */
export async function clearTries(db: Db, userId: string, ip: string): Promise<void> {
  await writeSetting(db, triesKey(userId, ip), { n: 0, at: Date.now() });
}

// ---------------------------------------------------------------- recovery codes

// Shown once, stored only as a hash. No 0/O/1/I so it can't be misread when written down.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const cleanCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function hasRecoveryCode(db: Db, userId: string): Promise<boolean> {
  if (userId === OWNER_ID && process.env.APP_PASSWORD) return true;
  return !!(await getUser(db, userId))?.recoveryHash;
}

/** Make a new recovery code (the old one stops working). Returns it for showing once. */
export async function newRecoveryCode(db: Db, userId: string): Promise<string> {
  const code = Array.from(randomBytes(20), (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join("");
  await db.update(users).set({ recoveryHash: await hash(code), updatedAt: nowIso() }).where(eq(users.id, userId));
  return code.match(/.{4}/g)!.join("-");
}

/** Forgotten password: the right recovery code sets a new password. The code is then used up, and everyone is signed out. */
export async function resetWithRecoveryCode(db: Db, email: string, code: string, pw: string): Promise<boolean> {
  const u = await findSignIn(db, email);
  if (!u || u.status !== "active" || !u.recoveryHash || (u.id === OWNER_ID && process.env.APP_PASSWORD)) {
    await checkOrPretend(null, code); // same time as a real check, so this doesn't reveal who has an account
    return false;
  }
  if (!cleanCode(code) || !(await matches(cleanCode(code), u.recoveryHash))) return false;
  await db.update(users).set({ passwordHash: await hash(pw), recoveryHash: null, updatedAt: nowIso() }).where(eq(users.id, u.id));
  await signOutEverywhere(db, u.id);
  await removeAiKey(db, u.workspaceId);
  await expireResetLinks(db, u.id);
  return true;
}

// ---------------------------------------------------------------- team (owner only)

export async function listPeople(db: Db): Promise<UserRow[]> {
  return db.select().from(users).orderBy(users.createdAt);
}

export async function setPersonActive(db: Db, userId: string, active: boolean): Promise<void> {
  if (userId === OWNER_ID) throw new Error("The owner's account can't be switched off.");
  await db
    .update(users)
    .set({ status: active ? "active" : "disabled", sessionEpoch: sql`${users.sessionEpoch} + 1`, updatedAt: nowIso() })
    .where(eq(users.id, userId));
  const u = await getUser(db, userId);
  if (u && !active) await removeAiKey(db, u.workspaceId);
  await expireResetLinks(db, userId);
}

export async function listInvites(db: Db): Promise<InviteRow[]> {
  return db.select().from(invites).orderBy(invites.createdAt);
}

/** Make a one-time invite link token (7 days). Returns the token for showing once, or a plain problem. */
export async function createInvite(db: Db, input: { email: string; name: string; createdBy: string }): Promise<{ token?: string; problem?: string }> {
  const email = cleanEmail(input.email);
  const name = input.name.trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { problem: "Type their email address." };
  if (!name) return { problem: "Type their name." };
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken) return { problem: "That person already has an account." };
  // A new invite for the same email replaces any earlier unused one.
  await db
    .update(invites)
    .set({ expiresAt: nowIso(), updatedAt: nowIso() })
    .where(and(eq(invites.email, email), sql`${invites.usedAt} is null`));
  const token = randomBytes(24).toString("base64url");
  await db.insert(invites).values({
    id: randomUUID(),
    email,
    name,
    tokenHash: sha(token),
    createdBy: input.createdBy,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
  });
  return { token };
}

/** A one-time link that lets a team member choose a new password (7 days). Returns the token. */
export async function createResetLink(db: Db, userId: string, createdBy: string): Promise<string> {
  const u = await getUser(db, userId);
  if (!u || u.role !== "member" || !u.email) throw new Error("Password links are for team members.");
  await db
    .update(invites)
    .set({ expiresAt: nowIso(), updatedAt: nowIso() })
    .where(and(eq(invites.email, u.email), sql`${invites.usedAt} is null`));
  const token = randomBytes(24).toString("base64url");
  await db.insert(invites).values({
    id: randomUUID(),
    email: u.email,
    name: u.name,
    tokenHash: sha(token),
    createdBy,
    userId: u.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
  });
  return token;
}

export async function cancelInvite(db: Db, id: string): Promise<void> {
  await db.update(invites).set({ expiresAt: nowIso(), updatedAt: nowIso() }).where(and(eq(invites.id, id), sql`${invites.usedAt} is null`));
}

/** A usable (unused, unexpired) invite for a link token — or null. */
export async function inviteFor(db: Db, token: string): Promise<InviteRow | null> {
  if (!token || token.length < 20) return null;
  const [inv] = await db.select().from(invites).where(eq(invites.tokenHash, sha(token))).limit(1);
  return inv && !inv.usedAt && inv.expiresAt > nowIso() ? inv : null;
}

/**
 * Accept an invite: makes the person and their own private workspace. The invite is claimed
 * atomically, so a link works exactly once. Returns the new person, or null if the link can't be used.
 */
export async function acceptInvite(db: Db, token: string, pw: string): Promise<UserRow | null> {
  const inv = await inviteFor(db, token);
  if (!inv) return null;
  // A password link for someone who already has an account (made by the owner on the Team page).
  const resetting = inv.userId ? await getUser(db, inv.userId) : null;
  if (inv.userId && (!resetting || resetting.status !== "active")) return null;
  const userId = resetting?.id ?? randomUUID();
  if (!resetting) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, inv.email)).limit(1);
    if (taken) return null;
  }
  const passwordHash = await hash(pw);
  // All or nothing: the link is used up only if the account is made (or the password changed).
  const done = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(invites)
      .set({ usedAt: nowIso(), userId, updatedAt: nowIso() })
      .where(and(eq(invites.id, inv.id), sql`${invites.usedAt} is null`, sql`${invites.expiresAt} > ${nowIso()}`))
      .returning({ id: invites.id });
    if (!claimed.length) return false;
    if (resetting) {
      await tx.update(users).set({ passwordHash, recoveryHash: null, updatedAt: nowIso() }).where(eq(users.id, userId));
      return true;
    }
    const workspaceId = `ws-${randomUUID()}`;
    await tx.insert(workspaces).values({ id: workspaceId, name: `${inv.name}'s space` });
    await tx.insert(users).values({ id: userId, email: inv.email, name: inv.name, role: "member", workspaceId, passwordHash });
    return true;
  });
  if (!done) return null;
  if (resetting) {
    await signOutEverywhere(db, userId);
    await removeAiKey(db, resetting.workspaceId);
    await expireResetLinks(db, userId);
  }
  return getUser(db, userId);
}
