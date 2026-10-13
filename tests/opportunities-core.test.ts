/** Pure logic for the opportunities product: deadlines, money, fields, scoring, ranking, dedup. */
import { describe, expect, it } from "vitest";
import { checkDeadline, deadlineInRange, parseDeadline } from "@/core/opportunities/dates";
import { dedupe } from "@/core/opportunities/dedup";
import { combine, completeness, displayValue, known, unknown } from "@/core/opportunities/fields";
import { EMPTY_PROFILE } from "@/core/opportunities/module";
import { moneyFits, parseMoney } from "@/core/opportunities/money";
import { expansion, expansionQuery } from "@/core/opportunities/modules/expansion";
import { certificationScore, suppliers, supplierQuery } from "@/core/opportunities/modules/suppliers";
import { recencyWeight, sponsors, sponsorQuery, suggestedAngle } from "@/core/opportunities/modules/sponsors";
import { requiredCertifications, tenderQuery, tenders } from "@/core/opportunities/modules/tenders";
import { aggregate, normalize } from "@/core/opportunities/scoring";
import type { Evidence } from "@/core/opportunities/types";
import { demoBrandDirectory, demoPartnershipsIndex } from "@/sources/opportunities/demo/sponsors";
import { demoSupplierDirectory, demoTradeCatalogue } from "@/sources/opportunities/demo/suppliers";
import { demoTenderBulletin, demoTenderPortal } from "@/sources/opportunities/demo/tenders";
import { demoBusinessRegister, demoStatisticsOffice } from "@/sources/opportunities/demo/expansion";
import type { ProviderIO } from "@/sources/opportunities/types";

const NOW = new Date("2026-10-09T10:00:00Z");
const ev = (over: Partial<Evidence> = {}): Evidence => ({ kind: "published", provider: "test", sourceUrl: "https://a.example/1", retrievedAt: NOW.toISOString(), publishedAt: null, quote: null, ...over });
const io: ProviderIO = { now: NOW, getJson: async () => ({}), cache: { get: async () => null, set: async () => {} } };

describe("deadlines", () => {
  it("keeps the original wording and reads an exact instant when the timezone is stated", () => {
    const d = parseDeadline("2026-11-10T12:00:00Z")!;
    expect(d.raw).toBe("2026-11-10T12:00:00Z");
    expect(d.instant).toBe("2026-11-10T12:00:00.000Z");
    expect(d.notes).toEqual([]);
    const g = parseDeadline("10 November 2026, 17:00 GMT")!;
    expect(g.instant).toBe("2026-11-10T17:00:00.000Z");
    const e = parseDeadline("December 4, 2026 2:00 PM EST")!;
    expect(e.instant).toBe("2026-12-04T19:00:00.000Z");
    const z = parseDeadline("2026-07-01 12:00 Europe/London")!; // BST in July
    expect(z.instant).toBe("2026-07-01T11:00:00.000Z");
  });

  it("never assumes a timezone, and never guesses an ambiguous date", () => {
    const noTz = parseDeadline("2026-11-20")!;
    expect(noTz.instant).toBeNull();
    expect(noTz.notes.join(" ")).toMatch(/Timezone not stated/);
    expect(noTz.notes.join(" ")).toMatch(/No time of day/);
    const ist = parseDeadline("14 October 2026 5pm IST")!;
    expect(ist.timezone).toBeNull();
    expect(ist.notes.join(" ")).toMatch(/more than one timezone/);
    const amb = parseDeadline("05/06/2027 12:00")!;
    expect(amb.date).toBeNull();
    expect(amb.notes.join(" ")).toMatch(/ambiguous/);
    expect(parseDeadline("25/06/2027")!.date).toBe("2027-06-25"); // day > 12: unambiguous
  });

  it("treats an unzoned deadline as passed only once it has passed in every timezone", () => {
    const d = parseDeadline("2026-10-09")!; // today, no time, no zone
    expect(checkDeadline(d, new Date("2026-10-09T10:00:00Z")).status).toBe("uncertain");
    expect(checkDeadline(d, new Date("2026-10-10T11:58:00Z")).status).toBe("uncertain"); // still 9 Oct in UTC−12
    expect(checkDeadline(d, new Date("2026-10-10T12:00:00Z")).status).toBe("passed");
    expect(checkDeadline(d, new Date("2026-10-08T09:00:00Z")).status).toBe("closing_soon");
  });

  it("counts days left conservatively and flags closing soon", () => {
    const d = parseDeadline("2026-10-12T12:00:00Z")!;
    const c = checkDeadline(d, NOW);
    expect(c.status).toBe("closing_soon");
    expect(c.daysLeft).toBe(3);
    expect(checkDeadline(parseDeadline("2026-10-01T12:00:00Z"), NOW).status).toBe("passed");
    expect(checkDeadline(null, NOW)).toMatchObject({ status: "unknown", label: "Deadline not published" });
    expect(checkDeadline(parseDeadline("05/06/2027"), NOW).status).toBe("unknown");
  });

  it("range filters can't say yes to an unreadable deadline", () => {
    expect(deadlineInRange(parseDeadline("2026-11-10"), "2026-11-01", "2026-11-30")).toBe(true);
    expect(deadlineInRange(parseDeadline("2026-12-10"), "2026-11-01", "2026-11-30")).toBe(false);
    expect(deadlineInRange(parseDeadline("05/06/2027"), "2026-11-01", null)).toBeNull();
  });
});

describe("money", () => {
  it("parses published amounts without inventing a currency", () => {
    expect(parseMoney("£85,000")).toMatchObject({ currency: "GBP", min: 85000, max: 85000 });
    expect(parseMoney("£400k – £600k per annum")).toMatchObject({ min: 400000, max: 600000, qualifier: "range" });
    expect(parseMoney("Up to €120,000")).toMatchObject({ currency: "EUR", min: null, max: 120000, qualifier: "up_to" });
    expect(parseMoney("£1.2m")).toMatchObject({ min: 1200000 });
    expect(parseMoney("50,000")).toMatchObject({ currency: null, min: 50000 });
    expect(parseMoney("")).toBeNull();
  });

  it("only compares within one currency", () => {
    expect(moneyFits(parseMoney("£85,000"), { min: 50000, max: 100000, currency: "GBP" })).toBe(true);
    expect(moneyFits(parseMoney("£85,000"), { min: 100000, currency: "GBP" })).toBe(false);
    expect(moneyFits(parseMoney("€85,000"), { min: 50000, currency: "GBP" })).toBeNull();
    expect(moneyFits(parseMoney("50,000"), { min: 1, currency: "GBP" })).toBeNull();
    expect(moneyFits(null, { min: 1 })).toBeNull();
  });
});

describe("fields and evidence", () => {
  it("agreeing sources merge evidence; disagreeing sources become a conflict that keeps both", () => {
    const a = known(500, ev({ sourceUrl: "https://a.example" }), "500 units");
    const b = known(500, ev({ sourceUrl: "https://b.example" }), "500 units");
    const c = known(1000, ev({ sourceUrl: "https://c.example" }), "1,000 units");
    const same = combine(a, b);
    expect(same.state).toBe("known");
    expect(same.evidence.map((e) => e.sourceUrl)).toEqual(["https://a.example", "https://b.example"]);
    const diff = combine(a, c);
    expect(diff.state).toBe("conflict");
    expect(diff.alternatives?.map((x) => x.value)).toEqual([500, 1000]);
    expect(displayValue(diff)).toBe("Conflicting: 500 vs 1000");
    expect(combine(unknown(), unknown()).state).toBe("unknown");
    expect(displayValue(unknown())).toBe("Unknown");
  });

  it("completeness counts unknowns as missing and conflicts as half", () => {
    const r = completeness({ a: known(1, ev()), b: unknown(), c: combine(known(1, ev()), known(2, ev())) }, ["a", "b", "c", "d"]);
    expect(r.known).toBe(1.5);
    expect(r.missing).toEqual(["b", "d"]);
  });
});

describe("scoring", () => {
  it("leaves unknown components out instead of scoring them as zero or a pass, and reports coverage", () => {
    const r = aggregate([
      { key: "a", label: "A", weight: 3, score: 1, detail: "" },
      { key: "b", label: "B", weight: 1, score: null, detail: "" },
    ]);
    expect(r.score).toBe(100);
    expect(r.coverage).toBe(0.75);
    expect(aggregate([{ key: "a", label: "A", weight: 1, score: null, detail: "" }]).score).toBeNull();
  });

  it("normalises before combining, keeps missing values missing, and handles ties", () => {
    expect(normalize([10, 20, null, 30])).toEqual([0, 0.5, null, 1]);
    expect(normalize([10, 20, 30], "lower")).toEqual([1, 0.5, 0]);
    expect(normalize([5, 5])).toEqual([0.5, 0.5]);
    expect(normalize([null, null])).toEqual([null, null]);
  });
});

describe("tender matching", () => {
  it("ranks against the company profile, excludes passed deadlines, and never assumes a budget", async () => {
    const items = dedupe([...(await demoTenderPortal.search(tenderQuery.parse({}), io)).items, ...(await demoTenderBulletin.search(tenderQuery.parse({}), io)).items]);
    const profile = { ...EMPTY_PROFILE, services: ["website design", "accessibility", "user research"], certifications: ["Cyber Essentials"], minPrepDays: 14 };
    const q = tenderQuery.parse({ keywords: "accessibility, website" });
    const kept = items.filter((it) => tenders.keep(it, q, { now: NOW, profile }));
    expect(kept.map((k) => k.title)).toContain("Website redesign and accessibility improvements");
    expect(kept.some((k) => /tourism/i.test(k.title))).toBe(false); // deadline passed → filtered out
    const res = tenders.rank(kept, q, { now: NOW, profile });
    const web = res[kept.findIndex((k) => k.title.startsWith("Website redesign"))];
    expect(web.score).toBeGreaterThan(60);
    expect(web.reasons.join(" ")).toMatch(/Cyber Essentials/);

    const community = items.find((i) => /Community events/.test(i.title))!;
    const r2 = tenders.rank([community], tenderQuery.parse({}), { now: NOW, profile })[0];
    expect(r2.flags.join(" ")).toMatch(/Budget not published/);
    expect(r2.flags.join(" ")).toMatch(/Eligibility not published/);
    expect(r2.components.find((c) => c.key === "budget")?.score).toBeNull();
  });

  it("flags a notice still marked open after its deadline, and a cancelled notice", async () => {
    const items = (await demoTenderPortal.search(tenderQuery.parse({}), io)).items;
    const tourism = items.find((i) => /tourism/i.test(i.title))!;
    const r = tenders.rank([tourism], tenderQuery.parse({ includeClosed: "on" }), { now: NOW, profile: EMPTY_PROFILE })[0];
    expect(r.excluded).toBe("Deadline passed");
    expect(r.flags.join(" ")).toMatch(/still lists this as open/);
    const cancelled = items.find((i) => /cancelled/i.test(i.title))!;
    expect(tenders.rank([cancelled], tenderQuery.parse({}), { now: NOW, profile: EMPTY_PROFILE })[0].excluded).toMatch(/Cancelled/);
  });

  it("keeps the published wording of critical fields and the conflicting budget from two portals", async () => {
    const items = dedupe([...(await demoTenderPortal.search(tenderQuery.parse({}), io)).items, ...(await demoTenderBulletin.search(tenderQuery.parse({}), io)).items]);
    const audit = items.find((i) => /Accessibility audit/.test(i.title))!;
    expect(audit.fields.budget.state).toBe("conflict");
    expect(audit.fields.budget.alternatives?.map((a) => a.raw)).toEqual(["£30,000", "£35,000"]);
    expect(audit.fields.budget.evidence.map((e) => e.provider).sort()).toEqual(["demo-tender-bulletin", "demo-tender-portal"]);
    const ifl = items.find((i) => /Managed IT/.test(i.title))!;
    expect(ifl.fields.deadline.raw).toMatch(/17:00 GMT$/);
    expect(ifl.fields.deadline.evidence[0]).toMatchObject({ kind: "published", sourceUrl: expect.stringContaining("DEMO-2026-0152") });
    expect(requiredCertifications("ISO 27001 certification is mandatory. Cyber Essentials Plus is required.")).toEqual(["ISO 27001", "Cyber Essentials Plus"]);
  });
});

describe("sponsor matching", () => {
  it("prefers recent, relevant evidence and never claims a brand is seeking sponsorship without a source", async () => {
    const items = dedupe([...(await demoBrandDirectory.search(sponsorQuery.parse({}), io)).items, ...(await demoPartnershipsIndex.search(sponsorQuery.parse({}), io)).items]);
    const q = sponsorQuery.parse({ description: "A community trail running and cycling festival for families", audience: "families, runners, cyclists", location: "United Kingdom", sponsorshipType: "in_kind" });
    const res = sponsors.rank(items, q, { now: NOW, profile: EMPTY_PROFILE });
    const ranked = items.map((it, i) => ({ it, m: res[i] })).sort((a, b) => (b.m.score ?? -1) - (a.m.score ?? -1));
    expect(["Trailmark Outdoor Co.", "Greenway Bikes", "Brightleaf Nutrition"]).toContain(ranked[0].it.title);
    const kinetic = ranked.find((r) => r.it.title === "Kinetic Labs Wearables")!;
    expect(kinetic.m.flags.join(" ")).toMatch(/No public sponsorship evidence/);
    expect(kinetic.m.components.find((c) => c.key === "history")?.score).toBeNull();
    const seeking = items.filter((i) => i.fields.seekingSponsorship.state === "known");
    expect(seeking.map((s) => s.title)).toEqual(["Trailmark Outdoor Co."]);
    expect(seeking[0].fields.seekingSponsorship.evidence[0].quote).toMatch(/sponsorship requests/);
    expect(sponsors.formatField("seekingSponsorship", kinetic.it.fields.seekingSponsorship)).toBe("Not confirmed by any source");
    expect(sponsors.formatField("sponsorshipBudget", kinetic.it.fields.sponsorshipBudget)).toBe("Not published");
    // The partnerships index adds evidence to Brightleaf rather than creating a duplicate.
    const bright = items.filter((i) => i.title === "Brightleaf Nutrition");
    expect(bright).toHaveLength(1);
    expect((bright[0].fields.pastSponsorships.value as unknown[]).length).toBe(2);
    expect(suggestedAngle(ranked[0].it, q, NOW)).toMatch(/^Reference their/);
  });

  it("weights evidence by age", () => {
    expect(recencyWeight("2026-01-01", NOW)).toBe(1);
    expect(recencyWeight("2023-06-01", NOW)).toBe(0.5);
    expect(recencyWeight("2020-01-01", NOW)).toBe(0.25);
    expect(recencyWeight(null, NOW)).toBe(0.2);
  });
});

describe("supplier matching", () => {
  it("separates verified certifications from claims, and uses the higher of two conflicting MOQs", async () => {
    const items = dedupe([...(await demoSupplierDirectory.search(supplierQuery.parse({}), io)).items, ...(await demoTradeCatalogue.search(supplierQuery.parse({}), io)).items]);
    const porto = items.find((i) => i.title === "Porto Textile Works")!;
    expect(porto.fields.moq.state).toBe("conflict");
    const q = supplierQuery.parse({ product: "tote bags", maxMoq: "800", certifications: "GOTS, ISO 9001", privateLabel: "on" });
    const r = suppliers.rank([porto], q, { now: NOW, profile: EMPTY_PROFILE })[0];
    expect(r.components.find((c) => c.key === "moq")).toMatchObject({ score: 0.3 });
    expect(r.flags.join(" ")).toMatch(/different minimum order quantities/);
    expect(r.flags.join(" ")).toMatch(/ISO 9001: claimed by supplier/);
    expect(certificationScore([{ name: "GOTS", status: "independently_verified", sourceUrl: "x", checkedAt: null }], ["GOTS", "BRCGS"]).score).toBe(0.5);
    const silk = items.find((i) => i.title === "Silk Road Sourcing Ltd")!;
    expect(suppliers.formatField("moq", silk.fields.moq)).toBe("Unknown");
    const rs = suppliers.rank([silk], q, { now: NOW, profile: EMPTY_PROFILE })[0];
    expect(rs.flags.join(" ")).toMatch(/Evidence is thin/);
    expect(JSON.stringify(rs)).not.toMatch(/trustworthy/i);
  });
});

describe("expansion comparison", () => {
  async function areas(category = "coffee shop") {
    const q = expansionQuery.parse({ category, region: "Riverton metro (demo)", customerProfile: "young_professionals", existingArea: "Old Town" });
    const items = dedupe([...(await demoStatisticsOffice.search(q, io)).items, ...(await demoBusinessRegister.search(q, io)).items]).filter((i) => expansion.keep(i, q, { now: NOW, profile: EMPTY_PROFILE }));
    return { q, items, res: expansion.rank(items, q, { now: NOW, profile: EMPTY_PROFILE }) };
  }

  it("does not read a low competitor count from an incomplete search as low competition", async () => {
    const { items, res } = await areas();
    const i = items.findIndex((x) => x.title === "Northfield");
    const comp = res[i].components.find((c) => c.key === "competition")!;
    expect(comp.score).toBeNull();
    expect(comp.detail).toMatch(/incomplete source/);
    expect(res[i].flags.join(" ")).toMatch(/does not mean low competition/);
  });

  it("missing metrics lower coverage and are listed as research gaps", async () => {
    const { items, res } = await areas();
    const rv = res[items.findIndex((x) => x.title === "Riverside Village")];
    expect(rv.coverage).toBeLessThan(0.7);
    expect(rv.gaps?.join(" ")).toMatch(/Population not available/);
    expect(rv.gaps?.join(" ")).toMatch(/Foot traffic: not estimated/);
    const oldTown = res[items.findIndex((x) => x.title === "Old Town")];
    expect(oldTown.components.find((c) => c.key === "distance")?.detail).toMatch(/^0 km/);
    // Scores are relative to the set: changing weights changes the order.
    expect(items).toHaveLength(8);
  });

  it("scores are reproducible from the breakdown (weighted mean of normalised components)", async () => {
    const { res } = await areas();
    for (const r of res) {
      const scored = r.components.filter((c) => c.weight > 0 && c.score !== null);
      const w = scored.reduce((s, c) => s + c.weight, 0);
      if (!w) continue;
      const expected = Math.round((scored.reduce((s, c) => s + c.weight * c.score!, 0) / w) * 1000) / 10;
      expect(r.score).toBe(expected);
    }
  });
});

describe("brands", () => {
  it("every brand defines every token, and the default reproduces the original look", async () => {
    const { BRANDS, brandCss, defaultBrand } = await import("@/brand/brands");
    const keys = Object.keys(defaultBrand.light).sort();
    for (const b of Object.values(BRANDS)) {
      expect(Object.keys(b.light).sort()).toEqual(keys);
      expect(Object.keys(b.dark).sort()).toEqual(keys);
    }
    const css = brandCss(defaultBrand);
    expect(css).toContain("--accent:#2b55cc;");
    expect(css).toContain("--surface-2:#efefea;");
    expect(css).toContain("--ok-bg:#e3f3ea;");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(brandCss(BRANDS.meridian, ".preview")).toMatch(/^\.preview\{/);
  });
});
