import { describe, expect, it } from "vitest";
import { asSystem } from "@/services/context";
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
import { createRule } from "@/services/rules";
import { runReconciliation } from "@/services/reconcile";
import { runUpdate } from "@/services/run-update";
import { exportRecords } from "@/services/export";
import { setSetting, IDENTITY_TERMS_KEY } from "@/services/rules";
import { testCtx } from "./helpers";

const lead = { account: "Acme", opportunity: "Implementation Lead", sourceUrl: "https://jobs.example.com/acme/1" };

function toProspect(ctx: ReturnType<typeof testCtx>, id: string) {
  decideStage(ctx, id, { stage: "screen", verdict: "keep_strong", reason: "fits" });
  decideStage(ctx, id, { stage: "triage", verdict: "top_priority", reason: "fits" });
  setSourceVerification(ctx, id, "verified", "checked live");
  return decideStage(ctx, id, { stage: "verify", verdict: "tier_strong", reason: "verified" });
}

describe("records", () => {
  it("deduplicates and updates in place, logging the merge", () => {
    const ctx = testCtx();
    const a = upsertLead(ctx, { ...lead, location: "UNKNOWN" });
    const b = upsertLead(ctx, { ...lead, account: "ACME Inc.", sourceUrl: "http://www.jobs.example.com/acme/1/", location: "Remote" });
    expect(b.created).toBe(false);
    expect(b.record.id).toBe(a.record.id);
    expect(b.record.location).toBe("Remote");
    // A known value is never overwritten by UNKNOWN.
    upsertLead(ctx, { ...lead, location: "unknown" });
    expect(getRecord(ctx, a.record.id).location).toBe("Remote");
    expect(listRecords(ctx)).toHaveLength(1);
    expect(listHistory(ctx, { entityId: a.record.id }).map((h) => h.event)).toContain("dedup_merge");
  });

  it("refuses an edit that would collide with another record", () => {
    const ctx = testCtx();
    upsertLead(ctx, lead);
    const other = upsertLead(ctx, { ...lead, opportunity: "Other" }).record;
    expect(() => updateRecord(ctx, other.id, { opportunity: "Implementation Lead" })).toThrow(/already has/);
  });

  it("walks the pipeline and logs every status change", () => {
    const ctx = testCtx();
    const { record } = upsertLead(ctx, lead);
    const p = toProspect(ctx, record.id);
    expect(p).toMatchObject({ stage: "verify", status: "active", fitTier: "strong" });
    const events = listHistory(ctx, { entityId: record.id }).map((h) => h.event);
    expect(events).toEqual(expect.arrayContaining(["created", "stage.screen", "stage.triage", "stage.verify"]));
  });

  it("cannot hard-delete records or rewrite history", () => {
    const ctx = testCtx();
    upsertLead(ctx, lead);
    const raw = ctx.db.$client;
    expect(() => raw.exec("DELETE FROM records")).toThrow(/never deleted/);
    expect(() => raw.exec("UPDATE history SET reason = 'x'")).toThrow(/append-only/);
    expect(() => raw.exec("DELETE FROM history")).toThrow(/append-only/);
    expect(() => raw.exec("DELETE FROM rules")).not.toThrow(); // no rows, but the trigger exists:
    expect(raw.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get()).toEqual({ n: 7 });
  });

  it("keeps outreach behind the human boundary", () => {
    const ctx = testCtx();
    const { record } = upsertLead(ctx, lead);
    expect(() => setOutreachStatus(asSystem(ctx, "x"), record.id, "sent_manually", { humanConfirmed: true })).toThrow();
    expect(setOutreachStatus(ctx, record.id, "sent_manually", { humanConfirmed: true }).outreachStatus).toBe("sent_manually");
  });
});

describe("reconciliation", () => {
  it("re-checks prospects against current rules — no permanent pass", () => {
    const ctx = testCtx();
    const { record } = upsertLead(ctx, { ...lead, attributes: { value: 200 } });
    toProspect(ctx, record.id);
    createRule(ctx, { key: "floor", label: "Floor", appliesFrom: "screen", field: "value", operator: "gte", value: 500 });
    const rep = runReconciliation(ctx);
    expect(rep.archived).toBe(1);
    expect(getRecord(ctx, record.id).status).toBe("archived");
    expect(() => restoreRecord(ctx, record.id, "try")).toThrow(/Cannot restore/);
  });
  it("sends an unverifiable prospect to Hold", () => {
    const ctx = testCtx();
    const { record } = upsertLead(ctx, lead);
    toProspect(ctx, record.id);
    setSourceVerification(ctx, record.id, "unreachable", "404");
    runReconciliation(ctx);
    expect(getRecord(ctx, record.id).status).toBe("hold");
  });
});

describe("run update", () => {
  it("runs all stages in order and summarises counts", () => {
    const ctx = testCtx();
    createRule(ctx, { key: "floor", label: "Floor", appliesFrom: "screen", field: "value", operator: "gte", value: 100 });
    createRule(ctx, {
      key: "gig",
      label: "Gig",
      appliesFrom: "triage",
      field: "account",
      operator: "excludes_all",
      value: ["gigco"],
      effect: "hold",
    });
    const low = upsertLead(ctx, { ...lead, opportunity: "Low", attributes: { value: 50 } }).record;
    const unk = upsertLead(ctx, { ...lead, opportunity: "Unknown pay" }).record;
    const gig = upsertLead(ctx, { ...lead, account: "GigCo", attributes: { value: 500 } }).record;
    const good = upsertLead(ctx, { ...lead, opportunity: "Good", attributes: { value: 500 } }).record;
    setSourceVerification(ctx, good.id, "verified", "checked");

    const s = runUpdate(ctx);
    expect(s.intake).toBe(4);
    expect(s.stages.screen).toEqual({ in: 4, advanced: 3, held: 0, archived: 1 });
    expect(getRecord(ctx, low.id).status).toBe("archived");
    expect(getRecord(ctx, gig.id).status).toBe("hold");
    expect(getRecord(ctx, unk.id)).toMatchObject({ status: "hold", stage: "triage" }); // unverified source → Hold
    expect(getRecord(ctx, good.id)).toMatchObject({ status: "active", stage: "verify", fitTier: "strong" });
    expect(s.activeProspectsByTier).toEqual({ strong: 1 });
    expect(listHistory(ctx, { event: "run_update" })).toHaveLength(1);

    // A second run is idempotent for unchanged data, but re-reconciles the prospect.
    const s2 = runUpdate(ctx);
    expect(s2.intake).toBe(0);
    expect(s2.reconciliation.prospectsChecked).toBe(1);
    expect(s2.movedToArchive + s2.movedToHold).toBe(0);
  });
});

describe("export", () => {
  it("shared export never includes identity or contact fields", () => {
    const ctx = testCtx();
    setSetting(ctx, IDENTITY_TERMS_KEY, ["Pat Example"]);
    upsertLead(ctx, { ...lead, fitRationale: "Pat Example has done this", contactEmail: "r@x.com", preparedBrief: "brief" });
    const [row] = exportRecords(ctx, "shared");
    expect(row.fitRationale).toBe("[REDACTED] has done this");
    expect(row).not.toHaveProperty("contactEmail");
    expect(row).not.toHaveProperty("preparedBrief");
    const [full] = exportRecords(ctx, "internal");
    expect(full.contactEmail).toBe("r@x.com");
  });
});
