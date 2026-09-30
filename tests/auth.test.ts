import { afterEach, describe, expect, it } from "vitest";
import {
  changePassword,
  checkPassword,
  createFirstPassword,
  hasRecoveryCode,
  isValidSession,
  newRecoveryCode,
  newSessionToken,
  passwordIsSet,
  passwordProblem,
  resetWithRecoveryCode,
} from "@/lib/auth";
import { signSession } from "@/lib/session";
import { testCtx } from "./helpers";

afterEach(() => {
  delete process.env.APP_PASSWORD;
});

describe("first-visit password setup", () => {
  it("can only be claimed once, and stores a hash, not the password", async () => {
    const { db } = await testCtx();
    expect(await passwordIsSet(db)).toBe(false);
    expect(await createFirstPassword(db, "correct horse battery")).toBe(true);
    expect(await createFirstPassword(db, "attacker password!!")).toBe(false);
    expect(await passwordIsSet(db)).toBe(true);
    expect(await checkPassword(db, "correct horse battery")).toBe(true);
    expect(await checkPassword(db, "attacker password!!")).toBe(false);
    const raw = JSON.stringify(await db.execute("select value from settings where key = 'auth.passwordHash'"));
    expect(raw).not.toContain("correct horse battery");
    expect(raw).toContain("scrypt$");
  });

  it("issues sessions that verify, and rejects forged or pre-setup ones", async () => {
    const { db } = await testCtx();
    expect(await isValidSession(db, await signSession("guess"))).toBe(false); // no password yet → nothing is valid
    await createFirstPassword(db, "correct horse battery");
    const token = await newSessionToken(db);
    expect(await isValidSession(db, token)).toBe(true);
    expect(await isValidSession(db, await signSession("guess"))).toBe(false);
    expect(await isValidSession(db, token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(false);
    expect(await isValidSession(db, `${Date.now() - 1}.${token.split(".")[1]}`)).toBe(false);
  });

  it("changes the password", async () => {
    const { db } = await testCtx();
    await createFirstPassword(db, "correct horse battery");
    await changePassword(db, "a brand new password");
    expect(await checkPassword(db, "correct horse battery")).toBe(false);
    expect(await checkPassword(db, "a brand new password")).toBe(true);
  });

  it("lets a recovery code set a new password once, and only the newest code works", async () => {
    const { db } = await testCtx();
    await createFirstPassword(db, "correct horse battery");
    expect(await hasRecoveryCode(db)).toBe(false);
    const old = await newRecoveryCode(db);
    const code = await newRecoveryCode(db);
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    expect(await hasRecoveryCode(db)).toBe(true);
    expect(JSON.stringify(await db.execute("select value from settings where key = 'auth.recoveryHash'"))).not.toContain(code.replace(/-/g, ""));

    expect(await resetWithRecoveryCode(db, old, "a brand new password")).toBe(false);
    expect(await resetWithRecoveryCode(db, "", "a brand new password")).toBe(false);
    expect(await resetWithRecoveryCode(db, ` ${code.toLowerCase().replace(/-/g, " ")} `, "a brand new password")).toBe(true);
    expect(await checkPassword(db, "a brand new password")).toBe(true);
    // Used up.
    expect(await hasRecoveryCode(db)).toBe(false);
    expect(await resetWithRecoveryCode(db, code, "another password!!")).toBe(false);
  });

  it("uses APP_PASSWORD from the host when set", async () => {
    const { db } = await testCtx();
    process.env.APP_PASSWORD = "from-hosting-settings";
    expect(await passwordIsSet(db)).toBe(true);
    expect(await createFirstPassword(db, "ignored password")).toBe(false);
    expect(await checkPassword(db, "from-hosting-settings")).toBe(true);
  });

  it("validates new passwords", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least/);
    expect(passwordProblem("long enough pw", "different pw!!")).toMatch(/match/);
    expect(passwordProblem("long enough pw", "long enough pw")).toBeNull();
  });
});
