import { describe, expect, it } from "vitest";
import { aiKeyWorkspace, newAiKey } from "@/lib/ai-key";
import {
  changePassword,
  createFirstPassword,
  getUser,
  newRecoveryCode,
  newSessionToken,
  OWNER_ID,
  resetWithRecoveryCode,
  sessionUser,
  signOutEverywhere,
  reserveTry,
  clearTries,
} from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { runAiTool } from "@/services/ai-tools";
import { claimScheduledRun } from "@/services/discovery";
import { getRecord, upsertLead } from "@/services/records";
import { testCtx } from "./helpers";

describe("security", () => {
  it("only sends you to pages on this site after signing in", () => {
    expect(safeNext("/records?list=ready")).toBe("/records?list=ready");
    for (const bad of ["//evil.com", "/\\\\evil.com", "/\\tevil.com", "https://evil.com", "/%09/evil.com x", " /x", ""]) expect(safeNext(bad), bad).toBe("/");
  });

  it("signing out everywhere, changing the password or resetting it ends other sessions and the AI link", async () => {
    const { db } = await testCtx();
    await createFirstPassword(db, "correct horse battery");
    const me = async () => (await getUser(db, OWNER_ID))!;
    let token = await newSessionToken(db, await me());
    await signOutEverywhere(db, OWNER_ID);
    expect(await sessionUser(db, token)).toBeNull();

    token = await newSessionToken(db, await me());
    let key = await newAiKey(db, "default");
    await changePassword(db, OWNER_ID, "another good password");
    expect(await sessionUser(db, token)).toBeNull();
    expect(await aiKeyWorkspace(db, key)).toBeNull();

    token = await newSessionToken(db, await me());
    key = await newAiKey(db, "default");
    const code = await newRecoveryCode(db, OWNER_ID);
    expect(await resetWithRecoveryCode(db, "", code, "third good password")).toBe(true);
    expect(await sessionUser(db, token)).toBeNull();
    expect(await aiKeyWorkspace(db, key)).toBeNull();
  });

  it("slows down guessing per account and connection, counting tries sent at once", async () => {
    const { db } = await testCtx();
    const now = Date.now();
    const burst = await Promise.all(Array.from({ length: 25 }, () => reserveTry(db, OWNER_ID, "1.1.1.1", now)));
    expect(burst.filter(Boolean)).toHaveLength(10); // no more than 10, however many arrive together
    expect(await reserveTry(db, OWNER_ID, "1.1.1.1", now + 1000)).toBe(false);
    // Someone else's guessing doesn't lock the real person out from their own connection.
    expect(await reserveTry(db, OWNER_ID, "2.2.2.2", now + 1000)).toBe(true);
    // One try a minute after that.
    expect(await reserveTry(db, OWNER_ID, "1.1.1.1", now + 61_000)).toBe(true);
    expect(await reserveTry(db, OWNER_ID, "1.1.1.1", now + 62_000)).toBe(false);
    await clearTries(db, OWNER_ID, "1.1.1.1");
    expect(await reserveTry(db, OWNER_ID, "1.1.1.1")).toBe(true);
  });

  it("starts the scheduled search once, however many requests arrive together", async () => {
    const ctx = await testCtx();
    const now = Date.now();
    const got = await Promise.all(Array.from({ length: 8 }, () => claimScheduledRun(ctx, 20, now)));
    expect(got.filter(Boolean)).toHaveLength(1);
    expect(await claimScheduledRun(ctx, 20, now + 21 * 3_600_000)).toBe(true);
  });

  it("your AI can't overwrite a lead by re-adding it, and replaced cover letters are kept", async () => {
    const ctx = await testCtx();
    const r = (
      await upsertLead(ctx, { account: "Acme", opportunity: "Implementation Specialist", sourceUrl: "https://acme.example/jobs/1", notes: "My private notes", location: "Remote - India" })
    ).record;
    const again = await runAiTool(ctx, "add_lead", { company: "Acme", job_title: "Implementation Specialist", link: "https://acme.example/jobs/1", notes: "x", location: "On-site, Berlin" });
    expect(again.text).toMatch(/Nothing was changed/);
    expect(await getRecord(ctx, r.id)).toMatchObject({ notes: "My private notes", location: "Remote - India" });

    await runAiTool(ctx, "save_prepared_package", { id: r.id, brief: "Version 1" });
    await runAiTool(ctx, "save_prepared_package", { id: r.id, brief: "Version 2" });
    const after = await getRecord(ctx, r.id);
    expect(after.preparedBrief).toBe("Version 2");
    expect(after.extra.earlierVersions).toMatchObject([{ brief: "Version 1" }]);
  });
});
