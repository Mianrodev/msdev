import path from "node:path";
import { describe, expect, it } from "vitest";
import { AlreadyImportedError, importWorkbook, screenVerdict, triageVerdict, verifyVerdict } from "../scripts/lib/import-tracker";
import { listAccounts } from "@/services/accounts";
import { listHistory } from "@/services/history";
import { listRecords } from "@/services/records";
import { listRules } from "@/services/rules";
import { runUpdate } from "@/services/run-update";
import { testCtx } from "./helpers";

const FIXTURE = path.resolve(__dirname, "fixtures/sample-tracker.xlsx");

describe("verdict normalisation", () => {
  it("maps the workbook's labels to generic verdicts", () => {
    expect(screenVerdict("KEEP — STRETCH")).toBe("keep_stretch");
    expect(triageVerdict("PASS 3 — TOP PRIORITY")).toBe("top_priority");
    expect(triageVerdict("REMOVE AFTER DEEPER REVIEW")).toBe("remove");
    expect(verifyVerdict("APPLICATION READY — GOOD")).toBe("tier_good");
    expect(verifyVerdict("REJECT — FINAL")).toBe("archive");
    expect(verifyVerdict("HOLD — NEEDS INFORMATION")).toBe("hold_needs_info");
  });
});

describe("workbook import", () => {
  it("imports every row, dedupes across sheets and derives state", async () => {
    const ctx = testCtx();
    const report = await importWorkbook(ctx, FIXTURE);
    expect(report.ok).toBe(true);
    const by = Object.fromEntries(report.sheets.map((s) => [s.sheet, s]));
    expect(by["RAW LEADS"]).toMatchObject({ data: 5, imported: 5, expected: 5 });
    expect(by["TARGET ACCOUNTS"]).toMatchObject({ data: 2, header: 2, section: 1, blank: 1, expected: 2 });
    expect(by.HISTORY).toMatchObject({ data: 2, header: 2, section: 1, expected: 2 });

    const recs = listRecords(ctx);
    expect(recs).toHaveLength(6); // 5 raw + Zeta (PRIORITY only); Acme/Delta/Gamma merged
    const get = (a: string) => recs.find((r) => r.account === a)!;
    expect(get("Acme Analytics")).toMatchObject({ stage: "verify", status: "active", fitTier: "strong", sourceVerification: "verified", outreachStatus: "package_ready" });
    expect(get("Acme Analytics").preparedBrief).toBe("Placeholder brief");
    expect(get("Beta Systems")).toMatchObject({ status: "archived", screenVerdict: "reject" });
    expect(get("Gamma Labs")).toMatchObject({ status: "hold", stage: "screen", nextAction: "Read full JD" });
    expect(get("Delta Co").notes).toBe("Archive note");
    expect(get("Epsilon").sourceUrl).toBe("https://jobs.example.com/epsilon/5"); // HYPERLINK() target, not "Apply"
    expect(get("Acme Analytics").attributes.locationConfidence).toBe("HIGH");

    const accounts = listAccounts(ctx);
    expect(accounts.map((a) => a.attributes.list).sort()).toEqual(["outreach", "watchlist"]);
    expect(accounts.find((a) => a.name === "Eta Robotics")?.contactName).toBe("Placeholder Founder");

    expect(listHistory(ctx, { event: "import.history.reconciliation" })[0].entityId).toBe(get("Acme Analytics").id);
    expect(listRules(ctx).some((r) => r.key === "config.search_criteria.location_eligibility")).toBe(true);
    expect(listRules(ctx).some((r) => r.key === "criteria.location.verified_fit" && r.enabled)).toBe(true);

    await expect(importWorkbook(ctx, FIXTURE)).rejects.toBeInstanceOf(AlreadyImportedError);
  });

  it("first Run update after import keeps verified prospects and holds unverified ones", async () => {
    const ctx = testCtx();
    await importWorkbook(ctx, FIXTURE);
    const s = runUpdate(ctx);
    expect(s.reconciliation.prospectsChecked).toBe(2);
    expect(s.stages.triage.in).toBe(1); // Epsilon, screened KEEP — POSSIBLE
    expect(listRecords(ctx, { view: "prospects" }).map((r) => r.account).sort()).toEqual(["Acme Analytics", "Zeta Inc"]);
  });
});
