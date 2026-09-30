import { afterEach, describe, expect, it } from "vitest";
import {
  acceptInvite,
  changePassword,
  createFirstPassword,
  createInvite,
  createResetLink,
  getUser,
  hasRecoveryCode,
  inviteFor,
  newRecoveryCode,
  newSessionToken,
  OWNER_ID,
  passwordIsSet,
  passwordProblem,
  resetWithRecoveryCode,
  saveOwnerEmail,
  sessionUser,
  setPersonActive,
  signIn,
} from "@/lib/auth";
import { signSession } from "@/lib/session";
import { testCtx } from "./helpers";

afterEach(() => {
  delete process.env.APP_PASSWORD;
});

describe("the owner", () => {
  it("sets up once, stores a hash (not the password), and signs in with the password alone", async () => {
    const { db } = await testCtx();
    expect(await passwordIsSet(db)).toBe(false);
    expect(await createFirstPassword(db, "correct horse battery")).toBe(true);
    expect(await createFirstPassword(db, "attacker password!!")).toBe(false);
    expect(await signIn(db, "", "correct horse battery")).toMatchObject({ id: OWNER_ID, role: "owner" });
    expect(await signIn(db, "", "attacker password!!")).toBeNull();
    const raw = JSON.stringify(await db.execute("select password_hash from users"));
    expect(raw).not.toContain("correct horse battery");
    expect(raw).toContain("scrypt$");
    // Optional email: then either way works.
    expect(await saveOwnerEmail(db, "Owner@Example.com ")).toBeNull();
    expect(await signIn(db, "owner@example.com", "correct horse battery")).toMatchObject({ id: OWNER_ID });
    expect(await signIn(db, "", "correct horse battery")).toMatchObject({ id: OWNER_ID });
  });

  it("issues sessions that verify, and rejects forged, tampered or pre-setup ones", async () => {
    const { db } = await testCtx();
    expect(await sessionUser(db, await signSession("guess", { userId: OWNER_ID, epoch: 0 }))).toBeNull();
    await createFirstPassword(db, "correct horse battery");
    const token = await newSessionToken(db, (await getUser(db, OWNER_ID))!);
    expect(await sessionUser(db, token)).toMatchObject({ id: OWNER_ID });
    expect(await sessionUser(db, await signSession("guess", { userId: OWNER_ID, epoch: 0 }))).toBeNull();
    // Change a character in the middle of the signature (the last one can carry unused padding bits).
    const i = token.length - 10;
    expect(await sessionUser(db, token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1))).toBeNull();
    // Someone else's id pasted into a real token doesn't verify.
    const [exp, , epoch, sig] = token.split(".");
    expect(await sessionUser(db, `${exp}.someone-else.${epoch}.${sig}`)).toBeNull();
    expect(await sessionUser(db, `${Date.now() - 1}.${OWNER_ID}.${epoch}.${sig}`)).toBeNull();
  });

  it("changes the password", async () => {
    const { db } = await testCtx();
    await createFirstPassword(db, "correct horse battery");
    await changePassword(db, OWNER_ID, "a brand new password");
    expect(await signIn(db, "", "correct horse battery")).toBeNull();
    expect(await signIn(db, "", "a brand new password")).not.toBeNull();
  });

  it("lets a recovery code set a new password once, and only the newest code works", async () => {
    const { db } = await testCtx();
    await createFirstPassword(db, "correct horse battery");
    expect(await hasRecoveryCode(db, OWNER_ID)).toBe(false);
    const old = await newRecoveryCode(db, OWNER_ID);
    const code = await newRecoveryCode(db, OWNER_ID);
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    expect(JSON.stringify(await db.execute("select recovery_hash from users"))).not.toContain(code.replace(/-/g, ""));
    expect(await resetWithRecoveryCode(db, "", old, "a brand new password")).toBe(false);
    expect(await resetWithRecoveryCode(db, "", "", "a brand new password")).toBe(false);
    expect(await resetWithRecoveryCode(db, "", ` ${code.toLowerCase().replace(/-/g, " ")} `, "a brand new password")).toBe(true);
    expect(await signIn(db, "", "a brand new password")).not.toBeNull();
    expect(await hasRecoveryCode(db, OWNER_ID)).toBe(false);
    expect(await resetWithRecoveryCode(db, "", code, "another password!!")).toBe(false);
  });

  it("uses APP_PASSWORD from the host when set", async () => {
    const { db } = await testCtx();
    process.env.APP_PASSWORD = "from-hosting-settings";
    expect(await passwordIsSet(db)).toBe(true);
    expect(await createFirstPassword(db, "ignored password")).toBe(false);
    expect(await signIn(db, "", "from-hosting-settings")).toMatchObject({ id: OWNER_ID });
  });

  it("validates new passwords", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least/);
    expect(passwordProblem("long enough pw", "different pw!!")).toMatch(/match/);
    expect(passwordProblem("long enough pw", "long enough pw")).toBeNull();
  });
});

describe("team members", () => {
  it("join with a one-time invite link and get their own private space", async () => {
    const { db } = await testCtx();
    await createFirstPassword(db, "correct horse battery");
    expect((await createInvite(db, { email: "not an email", name: "Anna", createdBy: OWNER_ID })).problem).toMatch(/email/);
    const { token } = await createInvite(db, { email: " Anna@Example.com", name: "Anna", createdBy: OWNER_ID });
    expect(await inviteFor(db, token!)).toMatchObject({ email: "anna@example.com", name: "Anna" });
    expect(JSON.stringify(await db.execute("select token_hash from invites"))).not.toContain(token!);

    const anna = await acceptInvite(db, token!, "annas own password");
    expect(anna).toMatchObject({ role: "member", email: "anna@example.com", name: "Anna" });
    expect(anna!.workspaceId).not.toBe("default");
    expect(await acceptInvite(db, token!, "second use!!!!")).toBeNull(); // works once
    expect(await signIn(db, "ANNA@example.com", "annas own password")).toMatchObject({ id: anna!.id });
    expect(await signIn(db, "", "annas own password")).toBeNull(); // empty email = the owner
    expect((await createInvite(db, { email: "anna@example.com", name: "Anna", createdBy: OWNER_ID })).problem).toMatch(/already has an account/);
  });

  it("a newer invite replaces an older one; expired links don't work", async () => {
    const { db } = await testCtx();
    const a = await createInvite(db, { email: "bo@example.com", name: "Bo", createdBy: OWNER_ID });
    const b = await createInvite(db, { email: "bo@example.com", name: "Bo", createdBy: OWNER_ID });
    expect(await inviteFor(db, a.token!)).toBeNull();
    expect(await inviteFor(db, b.token!)).not.toBeNull();
    await db.execute("update invites set expires_at = '2000-01-01T00:00:00.000Z'");
    expect(await acceptInvite(db, b.token!, "bos password!!")).toBeNull();
  });

  it("only one of two people racing for the same link gets in", async () => {
    const { db } = await testCtx();
    const { token } = await createInvite(db, { email: "cy@example.com", name: "Cy", createdBy: OWNER_ID });
    const got = await Promise.all([acceptInvite(db, token!, "password one!!"), acceptInvite(db, token!, "password two!!")]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });

  it("switching someone off signs them out and stops sign-in; a password link lets them choose a new one", async () => {
    const { db } = await testCtx();
    const { token } = await createInvite(db, { email: "di@example.com", name: "Di", createdBy: OWNER_ID });
    const di = (await acceptInvite(db, token!, "dis password!!"))!;
    const session = await newSessionToken(db, di);
    expect(await sessionUser(db, session)).not.toBeNull();
    await setPersonActive(db, di.id, false);
    expect(await sessionUser(db, session)).toBeNull();
    expect(await signIn(db, "di@example.com", "dis password!!")).toBeNull();
    await expect(setPersonActive(db, OWNER_ID, false)).rejects.toThrow();
    await setPersonActive(db, di.id, true);

    const link = await createResetLink(db, di.id, OWNER_ID);
    const back = await acceptInvite(db, link, "a fresh password");
    expect(back?.id).toBe(di.id); // same person, same space — not a new account
    expect(back?.workspaceId).toBe(di.workspaceId);
    expect(await signIn(db, "di@example.com", "dis password!!")).toBeNull();
    expect(await signIn(db, "di@example.com", "a fresh password")).not.toBeNull();
  });

  it("an owner email that's already invited is refused, and a clash never uses up the link", async () => {
    const { db } = await testCtx();
    await createFirstPassword(db, "correct horse battery");
    const { token } = await createInvite(db, { email: "ed@example.com", name: "Ed", createdBy: OWNER_ID });
    expect(await saveOwnerEmail(db, "ed@example.com")).toMatch(/invited someone/);
    // Even if the owner had it first (e.g. saved before the invite), accepting fails cleanly…
    await db.execute("update users set email = 'ed@example.com' where id = 'owner'");
    expect(await acceptInvite(db, token!, "eds password!!")).toBeNull();
    // …and nothing was half-made: the link is still unused, no extra space exists.
    expect(await inviteFor(db, token!)).not.toBeNull();
    expect(JSON.stringify(await db.execute("select count(*)::int as n from workspaces"))).toContain('"n":1');
  });

  it("password links stop working once the password is changed another way", async () => {
    const { db } = await testCtx();
    const { token } = await createInvite(db, { email: "fi@example.com", name: "Fi", createdBy: OWNER_ID });
    const fi = (await acceptInvite(db, token!, "fis password!!"))!;
    const link = await createResetLink(db, fi.id, OWNER_ID);
    await changePassword(db, fi.id, "fis new password");
    expect(await inviteFor(db, link)).toBeNull();
    const link2 = await createResetLink(db, fi.id, OWNER_ID);
    await setPersonActive(db, fi.id, false);
    await setPersonActive(db, fi.id, true);
    expect(await inviteFor(db, link2)).toBeNull();
  });
});
