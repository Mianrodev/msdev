import { describe, expect, it } from "vitest";
import { candidateBoards, detectBoard } from "@/sources/job-boards";
import { fetchSite, warningSigns } from "@/sources/job-sites";
import { listRecords, getRecord, upsertLead, holdRecord } from "@/services/records";
import { createRule } from "@/services/rules";
import { addBoard, listBoards, regionVerdict, reviewFoundJob, runDiscovery, seedDiscoveryRules, titleMatches, DEFAULTS } from "@/services/discovery";
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
    expect(detectBoard("https://bunq.recruitee.com/o/ios-developer-3")).toMatchObject({ provider: "recruitee", slug: "bunq", postingId: "ios-developer-3" });
    expect(detectBoard("https://bunq.recruitee.com/")).toMatchObject({ provider: "recruitee", slug: "bunq" });
    expect(detectBoard("https://jobs.smartrecruiters.com/Acme/744000148454651-data-consultant")).toMatchObject({ provider: "smartrecruiters", slug: "Acme", postingId: "744000148454651" });
    expect(candidateBoards("Globex Labs, Inc.").map((b) => `${b.provider}:${b.slug}`)).toContain("lever:globexlabs");
    expect(candidateBoards("Globex Labs, Inc.").map((b) => `${b.provider}:${b.slug}`)).toContain("greenhouse:globex-labs");
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

  it("finds new companies through remote-job sites, but only trusts jobs confirmed on the company's own board", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    const calls: string[] = [];
    const ok = (body: unknown) => ({ status: 200, json: async () => body });
    const siteFetcher = async (url: string) => {
      calls.push(url);
      if (url.startsWith("https://remotive.com/api/remote-jobs"))
        return ok({
          jobs: [
            { company_name: "Globex Corp", title: "Implementation Specialist", candidate_required_location: "Worldwide", url: "https://remotive.com/remote-jobs/1" },
            { company_name: "Initech", title: "CRM Automation Consultant", candidate_required_location: "India", url: "https://remotive.com/remote-jobs/2" },
            { company_name: "Quick Cash Jobs", title: "Implementation Assistant", candidate_required_location: "Worldwide", url: "https://remotive.com/remote-jobs/3", description: "Message us on WhatsApp. Small registration fee required." },
            { company_name: "Stateside", title: "Implementation Lead", candidate_required_location: "USA", url: "https://remotive.com/remote-jobs/4" },
          ],
        });
      if (url.startsWith("https://boards-api.greenhouse.io/v1/boards/globex/jobs"))
        return ok({
          jobs: [
            { id: 11, title: "Implementation Specialist", absolute_url: "https://job-boards.greenhouse.io/globex/jobs/11", location: { name: "Remote" }, company_name: "Globex" },
            { id: 12, title: "Onboarding Manager", absolute_url: "https://job-boards.greenhouse.io/globex/jobs/12", location: { name: "Remote - India" }, company_name: "Globex" },
            { id: 13, title: "Implementation Consultant", absolute_url: "https://job-boards.greenhouse.io/globex/jobs/13", location: { name: "Berlin" }, company_name: "Globex" },
          ],
        });
      return { status: 404, json: async () => ({}) };
    };

    const rep = await runDiscovery(ctx, { fetcher: siteFetcher, today: "2026-09-30" });
    expect(rep.companiesConfirmed).toEqual([{ company: "Globex", board: "Greenhouse", site: "Remotive" }]);
    expect(rep).toMatchObject({ newLeads: 2, filteredOut: 1, notConfirmedTotal: 1, warningSkipped: 1 });
    expect(rep.notConfirmed?.map((n) => n.company)).toEqual(["Initech"]);

    const found = (await listRecords(ctx)).filter((r) => r.origin === "discovery");
    expect(found.map((r) => r.opportunity).sort()).toEqual(["Implementation Specialist", "Onboarding Manager"]);
    for (const r of found) {
      expect(r.sourceUrl).toMatch(/^https:\/\/job-boards\.greenhouse\.io\/globex\/jobs\//); // the company's page, not the job site
      expect(r.attributes.genuine).toMatch(/^YES — first seen on Remotive, then found on a Greenhouse careers page under the name "Globex" listing the same job/);
    }
    expect((await listBoards(ctx)).find((b) => b.company === "Globex")).toMatchObject({ foundVia: "Remotive", enabled: true });

    // Next week: Globex is simply a watched board, and Initech isn't looked up again yet.
    calls.length = 0;
    const rep2 = await runDiscovery(ctx, { fetcher: siteFetcher, today: "2026-10-07" });
    expect(rep2.newLeads).toBe(0);
    expect(rep2.companiesConfirmed).toEqual([]);
    expect(calls.filter((u) => /initech/i.test(u))).toEqual([]);
    expect(rep2.notConfirmed?.map((n) => n.company)).toEqual(["Initech"]);
  });

  it("recognises scam warning signs, without flagging ordinary job text", () => {
    for (const scam of [
      "Apply via Telegram",
      "Message us on WhatsApp. Small registration fee required.",
      "WhatsApp: +91 90000 00000",
      "A one-time training fee applies",
      "You pay a refundable deposit for the laptop.",
      "Salary paid in USDT every week.",
      "No interview needed, hired instantly!",
      "We will send you a cheque to buy equipment.",
    ])
      expect(warningSigns(scam), scam).not.toHaveLength(0);
    for (const fine of [
      "You will own the implementation of our CRM for customers in India.",
      "Integrates HubSpot with the WhatsApp Business API and Telegram bots.",
      "We will never ask for an application fee or contact you via WhatsApp.",
      "Automate workflows that send payment reminders.",
      "Background check required. Home office equipment stipend.",
      "Build our Bitcoin payments infrastructure.",
      "Beware of scams: we never ask candidates to pay a fee.",
    ])
      expect(warningSigns(fine), fine).toHaveLength(0);
  });

  it("isn't stopped by a badly formed link, and checks closed jobs whose link is on the company's own site", async () => {
    const ctx = await testCtx();
    expect(detectBoard("https://www.linkedin.com/jobs/view/50%-off")).toBeNull();
    await upsertLead(ctx, { account: "Odd", opportunity: "Something", sourceUrl: "https://example.com/jobs/100%-remote" });
    // Saved from the company's own site; the posting lives on its Greenhouse board.
    const saved = (await upsertLead(ctx, { account: "Globex", opportunity: "Onboarding Manager", sourceUrl: "https://globex.example/careers?gh_jid=12" })).record;
    await addBoard(ctx, "https://job-boards.greenhouse.io/globex");
    let open = true;
    const gh = async (url: string) =>
      url.startsWith("https://boards-api.greenhouse.io/v1/boards/globex/jobs")
        ? { status: 200, json: async () => ({ jobs: open ? [{ id: 12, title: "Onboarding Manager", absolute_url: "https://globex.example/careers?gh_jid=12", location: { name: "Remote" } }] : [] }) }
        : { status: 404, json: async () => ({}) };
    await runDiscovery(ctx, { fetcher: gh, sites: false });
    open = false;
    // Straight after, the shared copy is reused (nothing downloaded again)…
    expect((await runDiscovery(ctx, { fetcher: gh, sites: false })).closed).toBe(0);
    // …a fresh read notices the job has gone.
    const rep = await runDiscovery(ctx, { fetcher: gh, sites: false, maxAgeMs: 0 });
    expect(rep.closed).toBe(1);
    expect((await getRecord(ctx, saved.id)).attributes.verifiedOpen).toMatch(/^NO/);
  });

  it("doesn't list jobs at a company you already watch (under another name) as unconfirmed", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await upsertLead(ctx, { account: "Acme Labs", opportunity: "Ops", sourceUrl: "https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111" });
    const f = async (url: string) =>
      url.startsWith("https://remotive.com/")
        ? { status: 200, json: async () => ({ jobs: [{ company_name: "Acme", title: "Implementation Specialist", candidate_required_location: "Worldwide", url: "https://remotive.com/x" }] }) }
        : url.includes("/v0/postings/acme")
          ? { status: 200, json: async () => [] }
          : { status: 404, json: async () => ({}) };
    const rep = await runDiscovery(ctx, { fetcher: f });
    expect(rep.notConfirmedTotal).toBe(0);
  });

  it("downloads each board once and shares it: a second search, or another person's, reuses the copy", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await addBoard(ctx, "https://jobs.lever.co/acme");
    const calls: string[] = [];
    const counting = async (url: string) => {
      calls.push(url);
      return fetcher()(url);
    };
    const first = await runDiscovery(ctx, { fetcher: counting, sites: false });
    expect(calls.filter((u) => u.includes("/v0/postings/acme"))).toHaveLength(1);
    expect(first.data).toMatchObject({ boardsDownloaded: 1, boardsReused: 0 });
    calls.length = 0;
    const again = await runDiscovery(ctx, { fetcher: counting, sites: false });
    expect(calls).toEqual([]);
    expect(again.data).toMatchObject({ boardsDownloaded: 0, boardsReused: 1 });
    // Someone else watching the same company: no download either.
    const other = { ...ctx, workspaceId: "someone-else" };
    await ctx.db.execute("insert into workspaces (id, name) values ('someone-else', 'Other') on conflict do nothing");
    await addBoard(other, "https://jobs.lever.co/acme");
    await runDiscovery(other, { fetcher: counting, sites: false });
    expect(calls).toEqual([]);
  });

  it("keeps only small facts in the shared copy, plus descriptions of jobs someone could want", async () => {
    const ctx = await testCtx();
    await addBoard(ctx, "https://jobs.lever.co/acme");
    await runDiscovery(ctx, { fetcher: fetcher(), sites: false });
    const rows = (await ctx.db.execute("select value from source_cache where key like 'board:%'")) as unknown as { rows?: { value: { postings: { title: string; summary: string | null }[] } }[] };
    const postings = (rows.rows ?? (rows as unknown as { value: { postings: { title: string; summary: string | null }[] } }[]))[0].value.postings;
    expect(postings.find((p) => p.title === "Account Executive")?.summary).toBeNull();
    expect(postings.find((p) => p.title === "Implementation Specialist")?.summary).toMatch(/Implementation Specialist/);
  });
});

describe("Himalayas search", () => {
  it("searches every word: three pages for the first 12, one page for the rest", async () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      const q = new URL(url).searchParams;
      const jobs = Array.from({ length: 20 }, (_, i) => ({
        companyName: "Acme",
        title: `${q.get("q")} ${q.get("offset")} ${i}`,
        applicationLink: `https://acme.example/${q.get("q")}/${q.get("offset")}/${i}`,
      }));
      return { status: 200, json: async () => ({ jobs }) };
    };
    const words = Array.from({ length: 15 }, (_, i) => `word${i}`);
    const res = await fetchSite("himalayas", { searchWords: words }, fetcher);
    expect(asked).toHaveLength(12 * 3 + 3);
    expect(res.ok && res.listings.some((l) => l.title.startsWith("word14 "))).toBe(true);
  });
});
