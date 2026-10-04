import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { asSystem, type Ctx } from "@/services/context";
import { listHistory } from "@/services/history";
import {
  decideStage,
  getRecord,
  listRecords,
  restoreRecord,
  setOutreachStatus,
  setSourceVerification,
  updateRecord,
  upsertLead,
} from "@/services/records";
import { createRule, IDENTITY_TERMS_KEY, setSetting } from "@/services/rules";
import { runReconciliation } from "@/services/reconcile";
import { runUpdate } from "@/services/run-update";
import { exportRecords } from "@/services/export";
import { testCtx } from "./helpers";

const lead = { account: "Acme", opportunity: "Implementation Lead", sourceUrl: "https://jobs.example.com/acme/1" };

async function toProspect(ctx: Ctx, id: string) {
  await decideStage(ctx, id, { stage: "screen", verdict: "keep_strong", reason: "fits" });
  await decideStage(ctx, id, { stage: "triage", verdict: "top_priority", reason: "fits" });
  await setSourceVerification(ctx, id, "verified", "checked live");
  return decideStage(ctx, id, { stage: "verify", verdict: "tier_strong", reason: "verified" });
}

describe("records", () => {
  it("deduplicates and updates in place, logging the merge", async () => {
    const ctx = await testCtx();
    const a = await upsertLead(ctx, { ...lead, location: "UNKNOWN" });
    const b = await upsertLead(ctx, {
      ...lead,
      account: "ACME Inc.",
      sourceUrl: "http://www.jobs.example.com/acme/1/",
      location: "Remote",
    });
    expect(b.created).toBe(false);
    expect(b.record.id).toBe(a.record.id);
    expect(b.record.location).toBe("Remote");
    // A known value is never overwritten by UNKNOWN.
    await upsertLead(ctx, { ...lead, location: "unknown" });
    expect((await getRecord(ctx, a.record.id)).location).toBe("Remote");
    expect(await listRecords(ctx)).toHaveLength(1);
    expect((await listHistory(ctx, { entityId: a.record.id })).map((h) => h.event)).toContain("dedup_merge");
  });

  it("refuses an edit that would collide with another record", async () => {
    const ctx = await testCtx();
    await upsertLead(ctx, lead);
    const other = (await upsertLead(ctx, { ...lead, opportunity: "Other" })).record;
    await expect(updateRecord(ctx, other.id, { opportunity: "Implementation Lead" })).rejects.toThrow(/already has/);
  });

  it("walks the pipeline and logs every status change", async () => {
    const ctx = await testCtx();
    const { record } = await upsertLead(ctx, lead);
    const p = await toProspect(ctx, record.id);
    expect(p).toMatchObject({ stage: "verify", status: "active", fitTier: "strong" });
    const events = (await listHistory(ctx, { entityId: record.id })).map((h) => h.event);
    expect(events).toEqual(expect.arrayContaining(["created", "stage.screen", "stage.triage", "stage.verify"]));
  });

  it("cannot hard-delete records or rewrite history", async () => {
    const ctx = await testCtx();
    await upsertLead(ctx, lead);
    const msg = async (q: ReturnType<typeof sql>) => {
      try {
        await ctx.db.execute(q);
        return "no error";
      } catch (e) {
        const err = e as { cause?: { message?: string }; message: string };
        return err.cause?.message ?? err.message;
      }
    };
    expect(await msg(sql`DELETE FROM records`)).toMatch(/never deleted/);
    expect(await msg(sql`UPDATE history SET reason = 'x'`)).toMatch(/append-only/);
    expect(await msg(sql`DELETE FROM history`)).toMatch(/append-only/);
    expect(await msg(sql`TRUNCATE history`)).toMatch(/append-only/);
    expect(await listRecords(ctx)).toHaveLength(1);
  });

  it("keeps outreach behind the human boundary", async () => {
    const ctx = await testCtx();
    const { record } = await upsertLead(ctx, lead);
    await expect(setOutreachStatus(asSystem(ctx, "x"), record.id, "sent_manually", { humanConfirmed: true })).rejects.toThrow();
    expect((await setOutreachStatus(ctx, record.id, "sent_manually", { humanConfirmed: true })).outreachStatus).toBe(
      "sent_manually",
    );
  });
});

describe("reconciliation", () => {
  it("re-checks prospects against current rules — no permanent pass", async () => {
    const ctx = await testCtx();
    const { record } = await upsertLead(ctx, { ...lead, attributes: { value: 200 } });
    await toProspect(ctx, record.id);
    await createRule(ctx, { key: "floor", label: "Floor", appliesFrom: "screen", field: "value", operator: "gte", value: 500 });
    const rep = await runReconciliation(ctx);
    expect(rep.archived).toBe(1);
    expect((await getRecord(ctx, record.id)).status).toBe("archived");
    await expect(restoreRecord(ctx, record.id, "try")).rejects.toThrow(/Cannot restore/);
  });
  it("sends an unverifiable prospect to Hold", async () => {
    const ctx = await testCtx();
    const { record } = await upsertLead(ctx, lead);
    await toProspect(ctx, record.id);
    await setSourceVerification(ctx, record.id, "unreachable", "404");
    await runReconciliation(ctx);
    expect((await getRecord(ctx, record.id)).status).toBe("hold");
  });
});

describe("run update", () => {
  it("runs all stages in order and summarises counts", async () => {
    const ctx = await testCtx();
    await createRule(ctx, { key: "floor", label: "Floor", appliesFrom: "screen", field: "value", operator: "gte", value: 100 });
    await createRule(ctx, {
      key: "gig",
      label: "Gig",
      appliesFrom: "triage",
      field: "account",
      operator: "excludes_all",
      value: ["gigco"],
      effect: "hold",
    });
    const low = (await upsertLead(ctx, { ...lead, opportunity: "Low", attributes: { value: 50 } })).record;
    const unk = (await upsertLead(ctx, { ...lead, opportunity: "Unknown pay" })).record;
    const gig = (await upsertLead(ctx, { ...lead, account: "GigCo", attributes: { value: 500 } })).record;
    const good = (await upsertLead(ctx, { ...lead, opportunity: "Good", attributes: { value: 500 } })).record;
    await setSourceVerification(ctx, good.id, "verified", "checked");

    const s = await runUpdate(ctx);
    expect(s.intake).toBe(4);
    expect(s.stages.screen).toEqual({ in: 4, advanced: 3, held: 0, archived: 1 });
    expect((await getRecord(ctx, low.id)).status).toBe("archived");
    expect((await getRecord(ctx, gig.id)).status).toBe("hold");
    expect(await getRecord(ctx, unk.id)).toMatchObject({ status: "hold", stage: "triage" }); // unverified source → Hold
    expect(await getRecord(ctx, good.id)).toMatchObject({ status: "active", stage: "verify", fitTier: "strong" });
    expect(s.activeProspectsByTier).toEqual({ strong: 1 });
    expect(await listHistory(ctx, { event: "run_update" })).toHaveLength(1);

    // A second run is idempotent for unchanged data, but re-reconciles the prospect.
    const s2 = await runUpdate(ctx);
    expect(s2.intake).toBe(0);
    expect(s2.reconciliation.prospectsChecked).toBe(1);
    expect(s2.movedToArchive + s2.movedToHold).toBe(0);
  });

  it("rolls back everything if the run fails part-way", async () => {
    const ctx = await testCtx();
    await upsertLead(ctx, lead);
    const before = (await listHistory(ctx)).length;
    const broken = { ...ctx, actor: { kind: "system" as const, process: "x" } };
    // A system actor may run the pipeline, so force a failure inside the transaction instead:
    await createRule(ctx, { key: "bad", label: "Bad", appliesFrom: "screen", field: "value", operator: "gte", value: 1 });
    await ctx.db.execute(sql`ALTER TABLE pipeline_runs ADD CONSTRAINT force_fail CHECK (false) NOT VALID`);
    await expect(runUpdate(broken)).rejects.toThrow();
    expect((await listRecords(ctx))[0]).toMatchObject({ stage: "discovery", status: "active" });
    expect((await listHistory(ctx)).length).toBe(before + 1); // only the rule creation
  });
});

describe("export", () => {
  it("shared export never includes identity or contact fields", async () => {
    const ctx = await testCtx();
    await setSetting(ctx, IDENTITY_TERMS_KEY, ["Pat Example"]);
    await upsertLead(ctx, {
      ...lead,
      fitRationale: "Pat Example has done this",
      contactEmail: "r@x.com",
      preparedBrief: "brief",
    });
    const [row] = await exportRecords(ctx, "shared");
    expect(row["Why it's here"]).toBe("[REDACTED] has done this");
    expect(Object.keys(row).slice(0, 4)).toEqual(["Company", "Job title", "List", "Where it is"]); // readable, not database codes
    expect(JSON.stringify(row)).not.toMatch(/r@x\.com|brief|Contact/);
    const [full] = await exportRecords(ctx, "internal");
    expect(full["Contact email"]).toBe("r@x.com");
    expect(full["Prepared brief"]).toBe("brief");
  });
});
