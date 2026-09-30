import { describe, expect, it } from "vitest";
import { getRecord, listRecords, setOutreachStatus, upsertLead } from "@/services/records";
import { AI_TOOLS, runAiTool } from "@/services/ai-tools";
import { listHistory } from "@/services/history";
import { testCtx } from "./helpers";

describe("your AI's tools", () => {
  it("explains the app, lists and reads leads, and saves prepared material as 'Your AI'", async () => {
    const ctx = await testCtx();
    const lead = (await upsertLead(ctx, { account: "Acme", opportunity: "Implementation Specialist", sourceUrl: "https://acme.example/jobs/1" })).record;

    const about = await runAiTool(ctx, "about_this_app", {});
    expect(about.isError).toBe(false);
    expect(about.text).toMatch(/You can NOT: apply/);

    const listed = JSON.parse((await runAiTool(ctx, "list_leads", { list: "checking" })).text);
    expect(listed.leads.map((l: { id: string }) => l.id)).toEqual([lead.id]);

    const full = JSON.parse((await runAiTool(ctx, "get_lead", { id: lead.id })).text);
    expect(full).toMatchObject({ company: "Acme", job: "Implementation Specialist", application: "Not applied yet" });

    const saved = await runAiTool(ctx, "save_prepared_package", { id: lead.id, brief: "Dear Acme team, …", answers: "Notice: 30 days" });
    expect(saved.isError).toBe(false);
    expect(await getRecord(ctx, lead.id)).toMatchObject({ preparedBrief: "Dear Acme team, …", preparedAnswers: "Notice: 30 days" });
    await runAiTool(ctx, "add_note", { id: lead.id, note: "Series B, hiring in India." });
    expect((await getRecord(ctx, lead.id)).notes).toMatch(/your AI\] Series B/);
    const hist = await listHistory(ctx, { entityType: "record", entityId: lead.id });
    expect(hist.filter((h) => h.actor === "system:your-ai")).toHaveLength(2);
  });

  it("adds jobs it finds without duplicating, and explains mistakes plainly", async () => {
    const ctx = await testCtx();
    const add = { company: "Globex", job_title: "CRM Consultant", link: "https://globex.example/careers/9" };
    expect((await runAiTool(ctx, "add_lead", add)).text).toMatch(/^Added/);
    expect((await runAiTool(ctx, "add_lead", add)).text).toMatch(/^Already in the tracker/);
    const r = (await listRecords(ctx)).find((x) => x.account === "Globex")!;
    expect(r).toMatchObject({ origin: "ai", sourceVerification: "unverified" });

    expect(await runAiTool(ctx, "add_lead", { ...add, link: "globex.example" })).toMatchObject({ isError: true });
    expect(await runAiTool(ctx, "get_lead", { id: "00000000-0000-0000-0000-000000000000" })).toMatchObject({ isError: true });
    expect(await runAiTool(ctx, "delete_everything", {})).toMatchObject({ isError: true, text: "Unknown tool: delete_everything" });
  });

  it("has no tool that applies, decides or changes settings — and can't mark applications", async () => {
    const names = AI_TOOLS.map((t) => t.name).join(" ");
    expect(names).not.toMatch(/apply|send|decide|review|status|rule|setting|delete|archive/);
    const ctx = await testCtx();
    const lead = (await upsertLead(ctx, { account: "Acme", opportunity: "Ops", sourceUrl: "https://acme.example/jobs/2" })).record;
    const asAi = { ...ctx, actor: { kind: "system" as const, process: "your-ai" } };
    await expect(setOutreachStatus(asAi, lead.id, "sent_manually", { humanConfirmed: true })).rejects.toThrow();
  });
});
