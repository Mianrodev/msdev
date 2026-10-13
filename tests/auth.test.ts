/** Sign-in: owner from environment variables, members added by the owner, sessions, throttling. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addMember,
  changeMemberPassword,
  getUser,
  newSessionToken,
  ownerSetupProblem,
  OWNER_ID,
  resetMemberPassword,
  sessionUser,
  setMemberStatus,
  signIn,
  signOutEverywhere,
} from "@/lib/auth";
import { testCtx } from "./helpers";

const OWNER = { email: "Owner@Example.com", password: "a long owner password" };

beforeEach(() => {
  process.env.OWNER_EMAIL = OWNER.email;
  process.env.OWNER_PASSWORD = OWNER.password;
});
afterEach(() => {
  delete process.env.OWNER_EMAIL;
  delete process.env.OWNER_PASSWORD;
});

async function ownerIn() {
  const { db } = await testCtx();
  const r = await signIn(db, "owner@example.com", OWNER.password, "1.1.1.1");
  if (!r.ok) throw new Error("owner sign-in failed");
  return { db, owner: r.user };
}

describe("owner", () => {
  it("is configured only by environment variables, with a minimum password length", () => {
    expect(ownerSetupProblem()).toBeNull();
    process.env.OWNER_PASSWORD = "short";
    expect(ownerSetupProblem()).toMatch(/at least 12/);
    delete process.env.OWNER_EMAIL;
    expect(ownerSetupProblem()).toMatch(/Set OWNER_EMAIL and OWNER_PASSWORD/);
  });

  it("signs in with the configured email (case-insensitive) and password; wrong passwords fail", async () => {
    const { db } = await testCtx();
    expect(await signIn(db, "owner@example.com", "wrong password here", "ip")).toMatchObject({ ok: false, reason: "wrong" });
    const r = await signIn(db, " OWNER@example.com ", OWNER.password, "ip");
    expect(r).toMatchObject({ ok: true, user: { id: OWNER_ID, role: "owner", email: "owner@example.com" } });
  });

  it("changing OWNER_PASSWORD resets access and ends existing owner sessions", async () => {
    const { db, owner } = await ownerIn();
    const token = await newSessionToken(db, owner);
    expect((await sessionUser(db, token))?.id).toBe(OWNER_ID);
    process.env.OWNER_PASSWORD = "a brand new owner password";
    expect(await sessionUser(db, token)).toBeNull();
    expect((await signIn(db, OWNER.email, OWNER.password, "ip")).ok).toBe(false);
    expect((await signIn(db, OWNER.email, "a brand new owner password", "ip")).ok).toBe(true);
  });

  it("without owner settings nobody can become owner by visiting first", async () => {
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_PASSWORD;
    const { db } = await testCtx();
    expect(await signIn(db, "anyone@example.com", "whatever password", "ip")).toMatchObject({ ok: false, reason: "setup" });
  });
});

describe("team members", () => {
  it("the owner adds a member with a one-time temporary password stored only as a hash", async () => {
    const { db, owner } = await ownerIn();
    const { user, password } = await addMember(db, owner, { email: "Anna@Example.com", name: "Anna" });
    expect(password).toHaveLength(16);
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(password);
    expect((await signIn(db, "anna@example.com", password, "ip")).ok).toBe(true);
    await expect(addMember(db, owner, { email: "anna@example.com", name: "Anna 2" })).rejects.toThrow(/already on the team/);
    await expect(addMember(db, owner, { email: OWNER.email, name: "X" })).rejects.toThrow(/owner's email/);
  });

  it("members can't manage the team", async () => {
    const { db, owner } = await ownerIn();
    const { user } = await addMember(db, owner, { email: "anna@example.com", name: "Anna" });
    await expect(addMember(db, user, { email: "bob@example.com", name: "Bob" })).rejects.toThrow(/Only the owner/);
    await expect(resetMemberPassword(db, user, user.id)).rejects.toThrow(/Only the owner/);
  });

  it("reset, switch-off, password change and sign-out-everywhere all end existing sessions", async () => {
    const { db, owner } = await ownerIn();
    const { user, password } = await addMember(db, owner, { email: "anna@example.com", name: "Anna" });
    let token = await newSessionToken(db, user);
    expect((await sessionUser(db, token))?.id).toBe(user.id);

    const temp = await resetMemberPassword(db, owner, user.id);
    expect(await sessionUser(db, token)).toBeNull();
    expect((await signIn(db, "anna@example.com", password, "ip")).ok).toBe(false);

    const fresh = (await getUser(db, user.id))!;
    await changeMemberPassword(db, fresh, temp, "anna's own long password", "anna's own long password");
    expect((await signIn(db, "anna@example.com", "anna's own long password", "ip")).ok).toBe(true);

    token = await newSessionToken(db, (await getUser(db, user.id))!);
    await setMemberStatus(db, owner, user.id, "disabled");
    expect(await sessionUser(db, token)).toBeNull();
    expect((await signIn(db, "anna@example.com", "anna's own long password", "ip")).ok).toBe(false);

    await setMemberStatus(db, owner, user.id, "active");
    token = await newSessionToken(db, (await getUser(db, user.id))!);
    await signOutEverywhere(db, user.id);
    expect(await sessionUser(db, token)).toBeNull();
  });

  it("forged or tampered session tokens are refused", async () => {
    const { db, owner } = await ownerIn();
    const token = await newSessionToken(db, owner);
    const parts = token.split(".");
    expect(await sessionUser(db, `${parts[0]}.${parts[1]}.${parts[2]}.AAAA`)).toBeNull();
    expect(await sessionUser(db, "not-a-token")).toBeNull();
    expect(await sessionUser(db, undefined)).toBeNull();
  });
});

describe("guessing protection", () => {
  it("after 10 wrong tries from one connection, further tries are refused — other connections still work", async () => {
    const { db } = await testCtx();
    for (let i = 0; i < 10; i++) expect((await signIn(db, OWNER.email, `wrong password ${i}`, "6.6.6.6")).ok).toBe(false);
    expect(await signIn(db, OWNER.email, OWNER.password, "6.6.6.6")).toMatchObject({ ok: false, reason: "throttled" });
    expect((await signIn(db, OWNER.email, OWNER.password, "7.7.7.7")).ok).toBe(true);
  });
});
