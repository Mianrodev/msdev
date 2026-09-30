import { describe, expect, it } from "vitest";
import { listOf } from "@/components/plain";
import { archiveRecord, countsByView, getRecord, listRecords, setOutreachStatus, upsertLead } from "@/services/records";
import { asSystem } from "@/services/context";
import { testCtx } from "./helpers";

describe("application tracker", () => {
  it("moves a lead to Applied (from any list), remembers the date, and keeps it there whatever happens", async () => {
    const ctx = await testCtx();
    const a = (await upsertLead(ctx, { account: "Acme", opportunity: "Implementation Specialist", sourceUrl: "https://acme.example/jobs/1" })).record;
    const b = (await upsertLead(ctx, { account: "Globex", opportunity: "CRM Consultant", sourceUrl: "https://globex.example/jobs/2" })).record;

    await setOutreachStatus(ctx, a.id, "sent_manually", { humanConfirmed: true, today: "2026-10-01" });
    let r = await getRecord(ctx, a.id);
    expect(r.attributes.appliedOn).toBe("2026-10-01");
    expect(listOf(r)).toBe("applied");
    expect((await listRecords(ctx, { view: "applied" })).map((x) => x.id)).toEqual([a.id]);
    expect((await listRecords(ctx, { view: "leads" })).map((x) => x.id)).toEqual([b.id]);

    // The listing closing (archived) doesn't take it off your Applied list.
    await archiveRecord(ctx, a.id, "Listing closed");
    await setOutreachStatus(ctx, a.id, "interviewing", { humanConfirmed: true, today: "2026-10-09" });
    r = await getRecord(ctx, a.id);
    expect(r.attributes.appliedOn).toBe("2026-10-01"); // first date kept
    expect((await countsByView(ctx)).applied).toBe(1);
    expect((await countsByView(ctx)).archive).toBe(0);

    // Withdrawing keeps it on Applied; "not applied yet" puts it back.
    await setOutreachStatus(ctx, a.id, "closed", { humanConfirmed: true });
    expect(listOf(await getRecord(ctx, a.id))).toBe("applied");
    await setOutreachStatus(ctx, a.id, "not_started", { humanConfirmed: true });
    r = await getRecord(ctx, a.id);
    expect(r.attributes.appliedOn).toBeUndefined();
    expect(listOf(r)).toBe("archive");
  });

  it("only you can say you applied — the app itself can't", async () => {
    const ctx = await testCtx();
    const a = (await upsertLead(ctx, { account: "Acme", opportunity: "Ops", sourceUrl: "https://acme.example/jobs/3" })).record;
    await expect(setOutreachStatus(asSystem(ctx, "weekly"), a.id, "sent_manually", { humanConfirmed: true })).rejects.toThrow();
    await expect(setOutreachStatus(ctx, a.id, "offer", { humanConfirmed: false })).rejects.toThrow();
  });
});
