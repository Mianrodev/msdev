import { describe, expect, it } from "vitest";
import { acceptInvite, createFirstPassword, createInvite, OWNER_ID } from "@/lib/auth";
import { aiKeyWorkspace, newAiKey } from "@/lib/ai-key";
import { getAccount, listAccounts, upsertAccount } from "@/services/accounts";
import { getAnswers, getProfile, saveAnswers, saveProfile } from "@/services/answers";
import { runAiTool } from "@/services/ai-tools";
import type { Ctx } from "@/services/context";
import { getDiscoverySettings, listBoards, saveDiscoveryWords, DEFAULTS } from "@/services/discovery";
import { exportRecords } from "@/services/export";
import { listHistory } from "@/services/history";
import { getPrivacy, savePrivacy } from "@/services/privacy";
import { countsByView, getRecord, listRecords, updateRecord, upsertLead } from "@/services/records";
import { listRules, seedDefaultRules } from "@/services/rules";
import { testCtx } from "./helpers";

async function twoSpaces(): Promise<{ owner: Ctx; anna: Ctx }> {
  const owner = await testCtx();
  await createFirstPassword(owner.db, "correct horse battery");
  const { token } = await createInvite(owner.db, { email: "anna@example.com", name: "Anna", createdBy: OWNER_ID });
  const a = (await acceptInvite(owner.db, token!, "annas own password"))!;
  const anna: Ctx = { db: owner.db, workspaceId: a.workspaceId, actor: { kind: "human", id: a.id } };
  await seedDefaultRules(anna);
  return { owner, anna };
}

describe("each person's space is private", () => {
  it("leads, companies, answers, privacy, search words, history and exports never cross over", async () => {
    const { owner, anna } = await twoSpaces();
    const mine = (await upsertLead(owner, { account: "Acme", opportunity: "Implementation Specialist", sourceUrl: "https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111", notes: "owner secret" })).record;
    const acct = (await upsertAccount(owner, { name: "Owner Co", website: "https://owner.example" })).account;
    await saveAnswers(owner, [{ title: "Notice", text: "owner's notice period" }]);
    await saveProfile(owner, "owner's private profile");
    await savePrivacy(owner, { name: "Owner Person", email: "", phone: "", profileUrl: "", city: "", employer: "", other: [] });
    await saveDiscoveryWords(owner, { titleWords: ["implementation"], skipWords: [], regionWords: ["India"], otherRegionWords: [] });

    // Anna sees none of it.
    expect(await listRecords(anna)).toEqual([]);
    expect((await countsByView(anna)).all).toBe(0);
    await expect(getRecord(anna, mine.id)).rejects.toThrow();
    await expect(updateRecord(anna, mine.id, { notes: "hijack" })).rejects.toThrow();
    expect((await getRecord(owner, mine.id)).notes).toBe("owner secret");
    expect(await listAccounts(anna)).toEqual([]);
    await expect(getAccount(anna, acct.id)).rejects.toThrow();
    expect(await getAnswers(anna)).toEqual([]);
    expect(await getProfile(anna)).toBe("");
    expect((await getPrivacy(anna)).name ?? "").toBe("");
    expect((await getDiscoverySettings(anna)).titleWords).toEqual(DEFAULTS.titleWords);
    expect(await listBoards(anna)).toEqual([]);
    expect((await listHistory(anna, {})).some((h) => JSON.stringify(h).includes("Acme"))).toBe(false);
    expect(await exportRecords(anna, "internal")).toEqual([]);
    expect((await listRules(anna)).length).toBeGreaterThan(0); // her own copy of the rules

    // Her own lead is hers alone, even with the same company/job/link as the owner's.
    const hers = (await upsertLead(anna, { account: "Acme", opportunity: "Implementation Specialist", sourceUrl: "https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111" })).record;
    expect(hers.id).not.toBe(mine.id);
    expect((await listRecords(owner)).map((r) => r.id)).toEqual([mine.id]);
  });

  it("an AI link opens only its own person's space", async () => {
    const { owner, anna } = await twoSpaces();
    const mine = (await upsertLead(owner, { account: "Acme", opportunity: "Ops", sourceUrl: "https://acme.example/1" })).record;
    const key = await newAiKey(owner.db, anna.workspaceId);
    const ws = await aiKeyWorkspace(owner.db, key);
    expect(ws).toBe(anna.workspaceId);
    const annaAi: Ctx = { db: owner.db, workspaceId: ws!, actor: { kind: "system", process: "your-ai" } };
    expect(JSON.parse((await runAiTool(annaAi, "list_leads", { list: "all" })).text).leads).toEqual([]);
    expect(await runAiTool(annaAi, "get_lead", { id: mine.id })).toMatchObject({ isError: true });
    expect(await runAiTool(annaAi, "add_note", { id: mine.id, note: "x" })).toMatchObject({ isError: true });
  });
});
