import { describe, expect, it } from "vitest";
import { detectBoard } from "@/sources/job-boards";
import { listRecords, getRecord, upsertLead, holdRecord } from "@/services/records";
import { createRule } from "@/services/rules";
import { addBoard, regionVerdict, reviewFoundJob, runDiscovery, seedDiscoveryRules, titleMatches, DEFAULTS } from "@/services/discovery";
import { runUpdate } from "@/services/run-update";
import { listHistory } from "@/services/history";
import { testCtx } from "./helpers";

const OPEN = "11111111-1111-1111-1111-111111111111";
const CLOSED = "22222222-2222-2222-2222-222222222222";
const job = (id: string, text: string, location: string, workplaceType = "remote") => ({
  id,
  text,
  hostedUrl: `https://jobs.lever.co/acme/${id}`,
  categories: { location, commitment: "Full Time" },
  workplaceType,
  createdAt: Date.UTC(2026, 8, 20),
  descriptionPlain: `About the ${text} role.`,
});
const board = [
  job(OPEN, "Implementation Consultant", "Remote"),
  job("33333333-3333-3333-3333-333333333333", "Implementation Specialist", "Remote - India"),
  job("44444444-4444-4444-4444-444444444444", "CRM Automation Lead", "United States - Remote"),
  job("55555555-5555-5555-5555-555555555555", "Solutions Engineer", "Bangalore", "onsite"),
  job("66666666-6666-6666-6666-666666666666", "Account Executive", "Remote - India"),
  job("77777777-7777-7777-7777-777777777777", "Director of Implementation", "Remote"),
];
const fetcher = (ok = true) => async (url: string) => {
  if (!ok || !url.includes("/v0/postings/acme")) return { status: 404, json: async () => ({}) };
  return { status: 200, json: async () => board };
};

describe("job board links", () => {
  it("recognises the four boards and posting ids", () => {
    expect(detectBoard(`https://jobs.lever.co/acme/${OPEN}/apply`)).toMatchObject({ provider: "lever", slug: "acme", postingId: OPEN });
    expect(detectBoard("https://job-boards.greenhouse.io/tebra/jobs/4708633005")).toMatchObject({ provider: "greenhouse", slug: "tebra", postingId: "4708633005" });
    expect(detectBoard("https://jobs.ashbyhq.com/Scale%20Army%20Careers")).toMatchObject({ provider: "ashby", slug: "Scale Army Careers" });
    expect(detectBoard("https://apply.workable.com/huzzle/j/991B0F2A1C/")).toMatchObject({ provider: "workable", slug: "huzzle", postingId: "991B0F2A1C" });
    expect(detectBoard("https://www.linkedin.com/jobs/view/1")).toBeNull();
  });
  it("matches titles and regions without guessing", () => {
    expect(titleMatches("Implementation Specialist", DEFAULTS)).toBe(true);
    expect(titleMatches("Director of Implementation", DEFAULTS)).toBe(false);
    expect(titleMatches("Frontend Engineer", DEFAULTS)).toBe(false);
    expect(titleMatches("Software Development Engineer II - CRM", DEFAULTS)).toBe(false);
    expect(titleMatches("Sr. GTM Engineer", DEFAULTS)).toBe(true);
    expect(titleMatches("QA Automation 3/ SDET3", DEFAULTS)).toBe(false);
    expect(regionVerdict("Remote - India", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^YES/);
    expect(regionVerdict("United States - Remote", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^NO/);
    expect(regionVerdict("Remote", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toBe("UNKNOWN");
    expect(regionVerdict("Remote - US or India", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^YES/);
    expect(regionVerdict("New York", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^NO .*doesn't say remote/);
    expect(regionVerdict("New York", DEFAULTS.regionWords, DEFAULTS.otherRegionWords, "remote")).toMatch(/^NO — remote, but/);
    expect(regionVerdict("Remote-first", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toBe("UNKNOWN");
    expect(regionVerdict("Fully Remote", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toBe("UNKNOWN");
    expect(regionVerdict("Anywhere in South America", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^NO/);
    expect(regionVerdict("Remote - Anywhere", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^YES/);
    expect(regionVerdict("Remote (any timezone)", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toBe("UNKNOWN");
    expect(regionVerdict("Cape Town", DEFAULTS.regionWords, DEFAULTS.otherRegionWords, "remote")).toMatch(/^NO/);
    expect(regionVerdict("Remote, US", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^NO/);
    expect(regionVerdict("Remote (PST or MT timezone)", DEFAULTS.regionWords, DEFAULTS.otherRegionWords)).toMatch(/^NO/);
  });
});

describe("finding leads", () => {
  it("checks links, adds matching jobs once, and sorts them", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await createRule(ctx, { key: "open", label: "Listing still open", appliesFrom: "verify", field: "verifiedOpen", operator: "not_starts_with_any", value: ["NO"] });
    const existing = (await upsertLead(ctx, { account: "Acme", opportunity: "Implementation Consultant", sourceUrl: `https://jobs.lever.co/acme/${OPEN}` })).record;
    const gone = (await upsertLead(ctx, { account: "Acme", opportunity: "Ops Analyst", sourceUrl: `https://jobs.lever.co/acme/${CLOSED}` })).record;
    await holdRecord(ctx, gone.id, "Not sure");

    const rep = await runDiscovery(ctx, { fetcher: fetcher(), today: "2026-09-30" });
    // US-only and on-site jobs fail the first-look rules, so they're counted but never added.
    expect(rep).toMatchObject({ boardsChecked: 1, jobsSeen: 6, stillOpen: 1, closed: 1, newLeads: 1, filteredOut: 2, alreadyKnown: 1 });
    expect(await getRecord(ctx, existing.id)).toMatchObject({ sourceVerification: "verified" });
    expect((await getRecord(ctx, existing.id)).attributes.verifiedOpen).toMatch(/^YES/);
    expect((await getRecord(ctx, gone.id)).attributes.verifiedOpen).toMatch(/^NO/);

    const found = (await listRecords(ctx)).filter((r) => r.origin === "discovery");
    expect(found.map((r) => r.opportunity)).toEqual(["Implementation Specialist"]);
    const india = found.find((r) => r.opportunity === "Implementation Specialist")!;
    expect(india).toMatchObject({ account: "Acme", sourceBoard: "Lever", location: "Remote - India", sourceVerification: "verified" });
    expect(india.attributes).toMatchObject({ workplaceType: "remote", employmentType: "Full Time", postedOn: "2026-09-20" });
    expect(india.extra.postingSummary).toBe("About the Implementation Specialist role.");

    // Weekly check: the closed held lead is archived; the good find waits for review
    // instead of becoming Ready by itself.
    await runUpdate(ctx);
    const after = async (title: string) => (await listRecords(ctx)).find((r) => r.opportunity === title)!;
    expect((await getRecord(ctx, gone.id)).status).toBe("archived");
    expect(await after("Implementation Specialist")).toMatchObject({ status: "active", stage: "screen" });
    expect((await listRecords(ctx, { view: "review" })).map((r) => r.opportunity)).toEqual(["Implementation Specialist"]);
    expect((await listRecords(ctx, { view: "leads" })).map((r) => r.opportunity)).not.toContain("Implementation Specialist");

    // Review: yes → Ready.
    const ready = await reviewFoundJob(ctx, india.id, "yes");
    expect(ready).toMatchObject({ stage: "verify", status: "active", fitTier: "good" });

    // Running again adds nothing twice (even archived jobs aren't re-added).
    const rep2 = await runDiscovery(ctx, { fetcher: fetcher(), today: "2026-10-07" });
    expect(rep2.newLeads).toBe(0);
    expect(await listHistory(ctx, { event: "job_board_search" })).toHaveLength(2);
  });

  it("changes nothing when a board can't be read", async () => {
    const ctx = await testCtx();
    const r = (await upsertLead(ctx, { account: "Acme", opportunity: "X", sourceUrl: `https://jobs.lever.co/acme/${CLOSED}` })).record;
    const rep = await runDiscovery(ctx, { fetcher: fetcher(false) });
    expect(rep.boardsChecked).toBe(0);
    expect(rep.boardsFailed).toHaveLength(1);
    expect((await getRecord(ctx, r.id)).attributes.verifiedOpen).toBeUndefined();
  });

  it("doesn't suggest a job you already saved from another site, or the same job twice", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    // Saved from LinkedIn — different link, same company and title.
    await upsertLead(ctx, { account: "Acme Inc.", opportunity: "Implementation  Specialist", sourceUrl: "https://www.linkedin.com/jobs/view/1" });
    const twice = [...board, { ...board[1], id: "88888888-8888-8888-8888-888888888888", hostedUrl: "https://jobs.lever.co/acme/88888888-8888-8888-8888-888888888888" }];
    await addBoard(ctx, "https://jobs.lever.co/acme");
    const rep = await runDiscovery(ctx, {
      fetcher: async (url: string) => (url.includes("/v0/postings/acme") ? { status: 200, json: async () => twice } : { status: 404, json: async () => ({}) }),
    });
    const found = (await listRecords(ctx)).filter((r) => r.origin === "discovery").map((r) => r.opportunity);
    expect(found).toEqual(["Implementation Consultant"]);
    expect(rep).toMatchObject({ newLeads: 1, alreadyKnown: 2 });
  });
});
