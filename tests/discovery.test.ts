import { describe, expect, it } from "vitest";
import { candidateBoards, detectBoard } from "@/sources/job-boards";
import { fetchSite, warningSigns } from "@/sources/job-sites";
import {
  listRecords,
  getRecord,
  upsertLead,
  holdRecord,
} from "@/services/records";
import { createRule } from "@/services/rules";
import {
  addBoard,
  listBoards,
  regionVerdict,
  remoteVerdict,
  reviewFoundJob,
  runDiscovery,
  seedDiscoveryRules,
  titleMatches,
  DEFAULTS,
} from "@/services/discovery";
import { runUpdate } from "@/services/run-update";
import { listHistory } from "@/services/history";
import { records } from "@/db/schema";
import { testCtx } from "./helpers";

const OPEN = "11111111-1111-1111-1111-111111111111";
const CLOSED = "22222222-2222-2222-2222-222222222222";
const job = (
  id: string,
  text: string,
  location: string,
  workplaceType = "remote",
) => ({
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
  job(
    "33333333-3333-3333-3333-333333333333",
    "Implementation Specialist",
    "Remote - India",
  ),
  job(
    "44444444-4444-4444-4444-444444444444",
    "CRM Automation Lead",
    "United States - Remote",
  ),
  job(
    "55555555-5555-5555-5555-555555555555",
    "Solutions Engineer",
    "Bangalore",
    "onsite",
  ),
  job(
    "66666666-6666-6666-6666-666666666666",
    "Account Executive",
    "Remote - India",
  ),
  job(
    "77777777-7777-7777-7777-777777777777",
    "Director of Implementation",
    "Remote",
  ),
];
const fetcher =
  (ok = true) =>
  async (url: string) => {
    if (!ok || !url.includes("/v0/postings/acme"))
      return { status: 404, json: async () => ({}) };
    return { status: 200, json: async () => board };
  };

describe("job board links", () => {
  it("recognises the four boards and posting ids", () => {
    expect(
      detectBoard(`https://jobs.lever.co/acme/${OPEN}/apply`),
    ).toMatchObject({
      provider: "lever",
      slug: "acme",
      postingId: OPEN,
    });
    expect(
      detectBoard("https://job-boards.greenhouse.io/tebra/jobs/4708633005"),
    ).toMatchObject({
      provider: "greenhouse",
      slug: "tebra",
      postingId: "4708633005",
    });
    expect(
      detectBoard("https://jobs.ashbyhq.com/Scale%20Army%20Careers"),
    ).toMatchObject({
      provider: "ashby",
      slug: "Scale Army Careers",
    });
    expect(
      detectBoard("https://apply.workable.com/huzzle/j/991B0F2A1C/"),
    ).toMatchObject({
      provider: "workable",
      slug: "huzzle",
      postingId: "991B0F2A1C",
    });
    expect(detectBoard("https://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(
      detectBoard("https://bunq.recruitee.com/o/ios-developer-3"),
    ).toMatchObject({
      provider: "recruitee",
      slug: "bunq",
      postingId: "ios-developer-3",
    });
    expect(detectBoard("https://bunq.recruitee.com/")).toMatchObject({
      provider: "recruitee",
      slug: "bunq",
    });
    expect(
      detectBoard(
        "https://jobs.smartrecruiters.com/Acme/744000148454651-data-consultant",
      ),
    ).toMatchObject({
      provider: "smartrecruiters",
      slug: "Acme",
      postingId: "744000148454651",
    });
    expect(
      candidateBoards("Globex Labs, Inc.").map(
        (b) => `${b.provider}:${b.slug}`,
      ),
    ).toContain("lever:globexlabs");
    expect(
      candidateBoards("Globex Labs, Inc.").map(
        (b) => `${b.provider}:${b.slug}`,
      ),
    ).toContain("greenhouse:globex-labs");
  });
  it("matches titles and regions without guessing", () => {
    expect(titleMatches("Implementation Specialist", DEFAULTS)).toBe(true);
    expect(titleMatches("Director of Implementation", DEFAULTS)).toBe(false);
    expect(titleMatches("Frontend Engineer", DEFAULTS)).toBe(false);
    expect(
      titleMatches("Software Development Engineer II - CRM", DEFAULTS),
    ).toBe(false);
    expect(titleMatches("Sr. GTM Engineer", DEFAULTS)).toBe(true);
    expect(titleMatches("QA Automation 3/ SDET3", DEFAULTS)).toBe(false);
    expect(
      regionVerdict(
        "Remote - India",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^YES/);
    expect(
      regionVerdict(
        "United States - Remote",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^NO/);
    expect(
      regionVerdict("Remote", DEFAULTS.regionWords, DEFAULTS.otherRegionWords),
    ).toBe("UNKNOWN");
    expect(
      regionVerdict(
        "Remote - US or India",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^YES/);
    expect(
      regionVerdict(
        "New York",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^NO .*doesn't say remote/);
    expect(
      regionVerdict(
        "New York",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
        "remote",
      ),
    ).toMatch(/^NO — remote, but/);
    expect(
      regionVerdict(
        "Remote-first",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toBe("UNKNOWN");
    expect(
      regionVerdict(
        "Fully Remote",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toBe("UNKNOWN");
    expect(
      regionVerdict(
        "Anywhere in South America",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^NO/);
    expect(
      regionVerdict(
        "Remote - Anywhere",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^YES/);
    expect(
      regionVerdict(
        "Remote (any timezone)",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toBe("UNKNOWN");
    expect(
      regionVerdict(
        "Cape Town",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
        "remote",
      ),
    ).toMatch(/^NO/);
    expect(
      regionVerdict(
        "Remote, US",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^NO/);
    expect(
      regionVerdict(
        "Remote (PST or MT timezone)",
        DEFAULTS.regionWords,
        DEFAULTS.otherRegionWords,
      ),
    ).toMatch(/^NO/);
  });
});

describe("finding leads", () => {
  it("checks links, adds matching jobs once, and sorts them", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await createRule(ctx, {
      key: "open",
      label: "Listing still open",
      appliesFrom: "verify",
      field: "verifiedOpen",
      operator: "not_starts_with_any",
      value: ["NO"],
    });
    const existing = (
      await upsertLead(ctx, {
        account: "Acme",
        opportunity: "Implementation Consultant",
        sourceUrl: `https://jobs.lever.co/acme/${OPEN}`,
      })
    ).record;
    const gone = (
      await upsertLead(ctx, {
        account: "Acme",
        opportunity: "Ops Analyst",
        sourceUrl: `https://jobs.lever.co/acme/${CLOSED}`,
      })
    ).record;
    await holdRecord(ctx, gone.id, "Not sure");

    const rep = await runDiscovery(ctx, {
      fetcher: fetcher(),
      today: "2026-09-30",
    });
    // US-only and on-site jobs fail the first-look rules, so they're counted but never added.
    expect(rep).toMatchObject({
      boardsChecked: 1,
      jobsSeen: 6,
      stillOpen: 1,
      closed: 1,
      newLeads: 1,
      filteredOut: 2,
      alreadyKnown: 1,
    });
    expect(await getRecord(ctx, existing.id)).toMatchObject({
      sourceVerification: "verified",
    });
    expect((await getRecord(ctx, existing.id)).attributes.verifiedOpen).toMatch(
      /^YES/,
    );
    expect((await getRecord(ctx, gone.id)).attributes.verifiedOpen).toMatch(
      /^NO/,
    );

    const found = (await listRecords(ctx)).filter(
      (r) => r.origin === "discovery",
    );
    expect(found.map((r) => r.opportunity)).toEqual([
      "Implementation Specialist",
    ]);
    const india = found.find(
      (r) => r.opportunity === "Implementation Specialist",
    )!;
    expect(india).toMatchObject({
      account: "Acme",
      sourceBoard: "Lever",
      location: "Remote - India",
      sourceVerification: "verified",
    });
    expect(india.attributes).toMatchObject({
      workplaceType: "remote",
      employmentType: "Full Time",
      postedOn: "2026-09-20",
    });
    expect(india.extra.postingSummary).toBe(
      "About the Implementation Specialist role.",
    );

    // Weekly check: the closed held lead is archived; the good find passed every check, so it is Ready
    // to apply to — marked "not yet rated" rather than given an invented rating.
    await runUpdate(ctx);
    const after = async (title: string) =>
      (await listRecords(ctx)).find((r) => r.opportunity === title)!;
    expect((await getRecord(ctx, gone.id)).status).toBe("archived");
    expect(await after("Implementation Specialist")).toMatchObject({
      status: "active",
      stage: "verify",
      fitTier: null,
    });
    expect((await after("Implementation Specialist")).fitRationale).toMatch(
      /^Passed every check \(.*remote.*\)\. Not yet rated/,
    );
    expect(
      (await listRecords(ctx, { view: "review" })).map((r) => r.opportunity),
    ).toEqual([]);
    expect(
      (await listRecords(ctx, { view: "prospects" })).map((r) => r.opportunity),
    ).toContain("Implementation Specialist");

    // The owner's AI rates it: the rating and the why become the lead's own fields.
    const ready = await reviewFoundJob(ctx, india.id, "yes", {
      by: "your AI",
      fit: "strong",
      why: "Implementation is your core work; remote India.",
    });
    expect(ready).toMatchObject({
      stage: "verify",
      status: "active",
      fitTier: "strong",
      fitRationale: "Implementation is your core work; remote India.",
    });
    expect(ready.verifyReason).toMatch(/^Sorted by your AI: /);

    // Running again adds nothing twice (even archived jobs aren't re-added).
    const rep2 = await runDiscovery(ctx, {
      fetcher: fetcher(),
      today: "2026-10-07",
    });
    expect(rep2.newLeads).toBe(0);
    expect(await listHistory(ctx, { event: "job_board_search" })).toHaveLength(
      2,
    );
  });

  it("changes nothing when a board can't be read", async () => {
    const ctx = await testCtx();
    const r = (
      await upsertLead(ctx, {
        account: "Acme",
        opportunity: "X",
        sourceUrl: `https://jobs.lever.co/acme/${CLOSED}`,
      })
    ).record;
    const rep = await runDiscovery(ctx, { fetcher: fetcher(false) });
    expect(rep.boardsChecked).toBe(0);
    expect(rep.boardsFailed).toHaveLength(1);
    expect(
      (await getRecord(ctx, r.id)).attributes.verifiedOpen,
    ).toBeUndefined();
  });

  it("doesn't suggest a job you already saved from another site, or the same job twice", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    // Saved from LinkedIn — different link, same company and title.
    await upsertLead(ctx, {
      account: "Acme Inc.",
      opportunity: "Implementation  Specialist",
      sourceUrl: "https://www.linkedin.com/jobs/view/1",
    });
    const twice = [
      ...board,
      {
        ...board[1],
        id: "88888888-8888-8888-8888-888888888888",
        hostedUrl:
          "https://jobs.lever.co/acme/88888888-8888-8888-8888-888888888888",
      },
    ];
    await addBoard(ctx, "https://jobs.lever.co/acme");
    const rep = await runDiscovery(ctx, {
      fetcher: async (url: string) =>
        url.includes("/v0/postings/acme")
          ? { status: 200, json: async () => twice }
          : { status: 404, json: async () => ({}) },
    });
    const found = (await listRecords(ctx))
      .filter((r) => r.origin === "discovery")
      .map((r) => r.opportunity);
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
            {
              company_name: "Globex Corp",
              title: "Implementation Specialist",
              candidate_required_location: "Worldwide",
              url: "https://remotive.com/remote-jobs/1",
            },
            {
              company_name: "Initech",
              title: "CRM Automation Consultant",
              candidate_required_location: "India",
              url: "https://remotive.com/remote-jobs/2",
            },
            {
              company_name: "Quick Cash Jobs",
              title: "Implementation Assistant",
              candidate_required_location: "Worldwide",
              url: "https://remotive.com/remote-jobs/3",
              description:
                "Message us on WhatsApp. Small registration fee required.",
            },
            {
              company_name: "Stateside",
              title: "Implementation Lead",
              candidate_required_location: "USA",
              url: "https://remotive.com/remote-jobs/4",
            },
          ],
        });
      if (
        url.startsWith("https://boards-api.greenhouse.io/v1/boards/globex/jobs")
      )
        return ok({
          jobs: [
            {
              id: 11,
              title: "Implementation Specialist",
              absolute_url: "https://job-boards.greenhouse.io/globex/jobs/11",
              location: { name: "Remote" },
              company_name: "Globex",
            },
            {
              id: 12,
              title: "Onboarding Manager",
              absolute_url: "https://job-boards.greenhouse.io/globex/jobs/12",
              location: { name: "Remote - India" },
              company_name: "Globex",
            },
            {
              id: 13,
              title: "Implementation Consultant",
              absolute_url: "https://job-boards.greenhouse.io/globex/jobs/13",
              location: { name: "Berlin" },
              company_name: "Globex",
            },
          ],
        });
      return { status: 404, json: async () => ({}) };
    };

    const rep = await runDiscovery(ctx, {
      fetcher: siteFetcher,
      today: "2026-09-30",
    });
    expect(rep.companiesConfirmed).toEqual([
      { company: "Globex", board: "Greenhouse", site: "Remotive" },
    ]);
    expect(rep).toMatchObject({
      newLeads: 2,
      filteredOut: 1,
      notConfirmedTotal: 1,
      warningSkipped: 1,
    });
    expect(rep.notConfirmed?.map((n) => n.company)).toEqual(["Initech"]);

    const found = (await listRecords(ctx)).filter(
      (r) => r.origin === "discovery",
    );
    expect(found.map((r) => r.opportunity).sort()).toEqual([
      "Implementation Specialist",
      "Onboarding Manager",
    ]);
    for (const r of found) {
      expect(r.sourceUrl).toMatch(
        /^https:\/\/job-boards\.greenhouse\.io\/globex\/jobs\//,
      ); // the company's page, not the job site
      expect(r.attributes.genuine).toMatch(
        /^YES — first seen on Remotive, then found on a Greenhouse careers page under the name "Globex" listing the same job/,
      );
    }
    expect(
      (await listBoards(ctx)).find((b) => b.company === "Globex"),
    ).toMatchObject({ foundVia: "Remotive", enabled: true });

    // Next week: Globex is simply a watched board, and Initech isn't looked up again yet.
    calls.length = 0;
    const rep2 = await runDiscovery(ctx, {
      fetcher: siteFetcher,
      today: "2026-10-07",
    });
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
    expect(
      detectBoard("https://www.linkedin.com/jobs/view/50%-off"),
    ).toBeNull();
    await upsertLead(ctx, {
      account: "Odd",
      opportunity: "Something",
      sourceUrl: "https://example.com/jobs/100%-remote",
    });
    // Saved from the company's own site; the posting lives on its Greenhouse board.
    const saved = (
      await upsertLead(ctx, {
        account: "Globex",
        opportunity: "Onboarding Manager",
        sourceUrl: "https://globex.example/careers?gh_jid=12",
      })
    ).record;
    await addBoard(ctx, "https://job-boards.greenhouse.io/globex");
    let open = true;
    const gh = async (url: string) =>
      url.startsWith("https://boards-api.greenhouse.io/v1/boards/globex/jobs")
        ? {
            status: 200,
            json: async () => ({
              jobs: open
                ? [
                    {
                      id: 12,
                      title: "Onboarding Manager",
                      absolute_url: "https://globex.example/careers?gh_jid=12",
                      location: { name: "Remote" },
                    },
                  ]
                : [],
            }),
          }
        : { status: 404, json: async () => ({}) };
    await runDiscovery(ctx, { fetcher: gh, sites: false });
    open = false;
    // Straight after, the shared copy is reused (nothing downloaded again)…
    expect(
      (await runDiscovery(ctx, { fetcher: gh, sites: false })).closed,
    ).toBe(0);
    // …a fresh read notices the job has gone.
    const rep = await runDiscovery(ctx, {
      fetcher: gh,
      sites: false,
      maxAgeMs: 0,
    });
    expect(rep.closed).toBe(1);
    expect((await getRecord(ctx, saved.id)).attributes.verifiedOpen).toMatch(
      /^NO/,
    );
  });

  it("doesn't list jobs at a company you already watch (under another name) as unconfirmed", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await upsertLead(ctx, {
      account: "Acme Labs",
      opportunity: "Ops",
      sourceUrl:
        "https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111",
    });
    const f = async (url: string) =>
      url.startsWith("https://remotive.com/")
        ? {
            status: 200,
            json: async () => ({
              jobs: [
                {
                  company_name: "Acme",
                  title: "Implementation Specialist",
                  candidate_required_location: "Worldwide",
                  url: "https://remotive.com/x",
                },
              ],
            }),
          }
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
    expect(calls.filter((u) => u.includes("/v0/postings/acme"))).toHaveLength(
      1,
    );
    expect(first.data).toMatchObject({ boardsDownloaded: 1, boardsReused: 0 });
    calls.length = 0;
    const again = await runDiscovery(ctx, { fetcher: counting, sites: false });
    expect(calls).toEqual([]);
    expect(again.data).toMatchObject({ boardsDownloaded: 0, boardsReused: 1 });
    // Someone else watching the same company: no download either.
    const other = { ...ctx, workspaceId: "someone-else" };
    await ctx.db.execute(
      "insert into workspaces (id, name) values ('someone-else', 'Other') on conflict do nothing",
    );
    await addBoard(other, "https://jobs.lever.co/acme");
    await runDiscovery(other, { fetcher: counting, sites: false });
    expect(calls).toEqual([]);
  });

  it("keeps only small facts in the shared copy, plus descriptions of jobs someone could want", async () => {
    const ctx = await testCtx();
    await addBoard(ctx, "https://jobs.lever.co/acme");
    await runDiscovery(ctx, { fetcher: fetcher(), sites: false });
    const rows = (await ctx.db.execute(
      "select value from source_cache where key like 'board2:%'",
    )) as unknown as {
      rows?: {
        value: { postings: { title: string; summary: string | null }[] };
      }[];
    };
    const postings = (rows.rows ??
      (rows as unknown as {
        value: { postings: { title: string; summary: string | null }[] };
      }[]))[0].value.postings;
    expect(
      postings.find((p) => p.title === "Account Executive")?.summary,
    ).toBeNull();
    expect(
      postings.find((p) => p.title === "Implementation Specialist")?.summary,
    ).toMatch(/Implementation Specialist/);
  });
});

describe("Himalayas search", () => {
  it("searches every word, a page at a time, up to five pages each", async () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      const q = new URL(url).searchParams;
      const page = q.get("cursor") ?? "first";
      const jobs = Array.from({ length: 20 }, (_, i) => ({
        companyName: "Acme",
        title: `${q.get("q")} ${page} ${i}`,
        applicationLink: `https://acme.example/${q.get("q")}/${page}/${i}`,
      }));
      return {
        status: 200,
        json: async () => ({ jobs, nextCursor: `after-${page}` }),
      };
    };
    const words = Array.from({ length: 15 }, (_, i) => `word${i}`);
    const res = await fetchSite("himalayas", { searchWords: words }, fetcher);
    expect(asked).toHaveLength(15 * 5);
    // every word's first page comes before any second page
    expect(asked.slice(0, 15).every((u) => !u.includes("cursor="))).toBe(true);
    expect(asked[15]).toContain("cursor=after-first");
    expect(
      res.ok && res.listings.some((l) => l.title.startsWith("word14 ")),
    ).toBe(true);
  });
});

describe("Workable job search", () => {
  it("merges one job posted for several countries and keeps the company's website as a hint", async () => {
    const asked: string[] = [];
    const job = (country: string) => ({
      title: "Automation Lead",
      url: `https://jobs.workable.com/view/x-${country}`,
      created: "2026-09-30T10:00:00Z",
      description: "<p>Own our process automation.</p>",
      locations: ["TELECOMMUTE", country],
      company: {
        title: "Harbour Freight Lines",
        website: "https://www.harbourfreight.example/",
      },
    });
    const fetcher = async (url: string) => {
      asked.push(url);
      if (asked.length > 2) return { status: 429, json: async () => ({}) };
      return {
        status: 200,
        json: async () => ({ jobs: [job("India"), job("Philippines")] }),
      };
    };
    const res = await fetchSite(
      "workable",
      {
        searchWords: ["automation", "operations", "systems"],
        country: "India",
      },
      fetcher,
    );
    expect(asked[0]).toContain("location=India");
    expect(asked[0]).toContain("workplace=remote");
    expect(asked).toHaveLength(3); // stops politely when asked to slow down
    expect(res.ok && res.listings).toEqual([
      expect.objectContaining({
        company: "Harbour Freight Lines",
        location: "Remote — India; Philippines",
        companyHint: "harbourfreight",
      }),
    ]);
  });

  it("looks on the company's Workable page first for jobs found there", () => {
    expect(
      candidateBoards("Harbour Freight Lines", ["harbourfreight"], {
        workable: true,
      })[0],
    ).toEqual({
      provider: "workable",
      slug: "harbourfreight",
    });
    expect(
      candidateBoards("Harbour Freight Lines").some(
        (b) => b.provider === "workable",
      ),
    ).toBe(false);
  });
});

describe("Himalayas slowing down", () => {
  it("keeps what it found when asked to slow down", async () => {
    let n = 0;
    const fetcher = async (url: string) => {
      n++;
      if (n > 2) return { status: 429, json: async () => ({}) };
      const q = new URL(url).searchParams.get("q");
      return {
        status: 200,
        json: async () => ({
          jobs: [
            {
              companyName: "Acme",
              title: `${q} lead`,
              applicationLink: `https://acme.example/${q}`,
            },
          ],
        }),
      };
    };
    const res = await fetchSite(
      "himalayas",
      { searchWords: ["a", "b", "c", "d"] },
      fetcher,
    );
    expect(res.ok && res.listings.length).toBe(2);
    expect(n).toBe(3);
  });
});

describe("Remote only", () => {
  const v = (
    title: string,
    location: string | null,
    workplace: string | null = null,
    summary: string | null = null,
  ) => remoteVerdict({ title, location, workplace, summary }).slice(0, 3);
  it("needs clear evidence that the job is remote", () => {
    expect(v("Implementation Manager", "Bengaluru, Karnataka, India")).toBe(
      "NO ",
    );
    expect(v("Implementation Manager", "Remote - India")).toBe("YES");
    expect(v("Implementation Manager", "India", "remote")).toBe("YES");
    expect(
      v(
        "Implementation Manager",
        "India",
        null,
        "This is a fully remote role open to candidates in India.",
      ),
    ).toBe("YES");
    expect(
      v(
        "Implementation Manager",
        "Pune",
        null,
        "Remote-friendly team; 3 days a week in our Pune office.",
      ),
    ).toBe("NO ");
    expect(v("Operations Manager (on-site)", "India")).toBe("NO ");
    expect(v("Program Manager", "Hybrid - Mumbai")).toBe("NO ");
    expect(v("Program Manager", "Remote", "hybrid")).toBe("NO ");
    expect(v("Program Manager", "Anywhere (contract)")).toBe("YES");
  });
});

describe("Remote Rocketship and companies' own job pages", () => {
  it("adds a job once its own page on the company's careers system shows it live", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    const page = (title: string) => ({
      status: 200,
      json: async () => ({}),
      text: async () =>
        `<html><head><meta property="og:title" content="${title}"></head></html>`,
    });
    const rr = (jobs: unknown[]) => ({
      status: 200,
      json: async () => ({}),
      text: async () =>
        `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialJobOpenings: jobs } } })}</script>`,
    });
    const job = (n: number, title: string, url: string, company: string) => ({
      roleTitle: title,
      url,
      locationType: "remote",
      location: "India",
      slug: `job-${n}`,
      created_at: "2026-09-30T00:00:00Z",
      company: { name: company, slug: company.toLowerCase() },
    });
    const fetcher = async (url: string) => {
      if (
        url.startsWith(
          "https://www.remoterocketship.com/country/india/jobs/implementation",
        )
      )
        return rr([
          job(
            1,
            "Implementation Manager",
            "https://harbourfreight.bamboohr.com/careers/12",
            "Harbour Freight",
          ),
          job(
            2,
            "Implementation Lead",
            "https://othercorp.bamboohr.com/careers/99",
            "Other Corp",
          ),
          job(
            3,
            "Implementation Analyst",
            "https://random-site.example/jobs/3",
            "Gizmo Ltd",
          ),
        ]);
      if (url === "https://harbourfreight.bamboohr.com/careers/12")
        return page("Implementation Manager");
      if (url === "https://othercorp.bamboohr.com/careers/99")
        return page("Current Openings"); // gone
      return { status: 404, json: async () => ({}) };
    };
    const rep = await runDiscovery(ctx, { fetcher, today: "2026-09-30" });
    expect(rep).toMatchObject({ newLeads: 1, pagesConfirmed: 1 });
    const [r] = (await listRecords(ctx)).filter(
      (x) => x.origin === "discovery",
    );
    expect(r).toMatchObject({
      account: "Harbour Freight",
      opportunity: "Implementation Manager",
      sourceUrl: "https://harbourfreight.bamboohr.com/careers/12",
      sourceVerification: "verified",
    });
    expect(r.attributes.genuine).toMatch(/own careers page \(BambooHR\)/);
    expect(rep.notConfirmed?.map((n) => n.company).sort()).toEqual([
      "Gizmo Ltd",
      "Other Corp",
    ]);
  });
});

describe("careers system addresses", () => {
  it("knows companies' careers systems and refuses odd addresses", async () => {
    const { careersSystem } = await import("@/sources/job-sites");
    expect(
      careersSystem("https://astreya.wd5.myworkdayjobs.com/x/job/1", "Astreya"),
    ).toBe("Workday");
    expect(
      careersSystem(
        "https://jobs.gainwelltechnologies.com/job/1",
        "Gainwell Technologies",
      ),
    ).toBe("Company website");
    expect(
      careersSystem("https://random-site.example/jobs/3", "Gizmo Ltd"),
    ).toBeNull();
    expect(
      careersSystem("http://acme.bamboohr.com/careers/1", "Acme"),
    ).toBeNull();
    expect(
      careersSystem("https://169.254.169.254/latest", "Metadata"),
    ).toBeNull();
    expect(
      careersSystem("https://metadata.google.internal/x", "Metadata"),
    ).toBeNull();
    expect(
      careersSystem("https://acme.bamboohr.com:8443/x", "Acme"),
    ).toBeNull();
  });
});

describe("Who can apply (read from the whole posting)", () => {
  it("catches limits to another country, wherever they sit in the posting", async () => {
    const { workRestriction } = await import("@/sources/restrictions");
    const { whoCanApply } = await import("@/services/discovery");
    const s = { regionWords: ["India", "Anywhere", "Worldwide", "APAC"] };
    const longIntro = "We build great software. ".repeat(400); // the limit comes after 10,000 characters
    for (const text of [
      `${longIntro} Remote: Work from Anywhere. Insurance mostly covered. *Available only to FT US-based employees`,
      `${longIntro} Please note, this role is only open to candidates who live in the US.`,
      `${longIntro} You must be based in the United Kingdom.`,
      `${longIntro} This role requires candidates to be legally authorized to work in the United States without sponsorship.`,
      `${longIntro} Job Type: Full-time, W-2.`,
      `${longIntro} We cannot hire candidates outside of Canada at this time.`,
    ])
      expect(workRestriction(text), text.slice(-80)).not.toBeNull();
    for (const text of [
      "Fully remote. Open to candidates anywhere, including India.",
      "Pay range for US-based candidates: $120k–$150k. Candidates elsewhere are paid in local currency.",
      "We are an equal opportunity employer and consider protected veteran status. Facilitar la comunicación.",
      "Comfortable working with US time zones.",
    ])
      expect(workRestriction(text), text).toBeNull();
    // A US work-permit question on a job that names India is a company-wide form question; a plain limit still counts.
    expect(
      whoCanApply(
        {
          location: "Remote - India",
          summary: "Are you legally authorized to work in the United States?",
        },
        s,
      ),
    ).toBeNull();
    expect(
      whoCanApply(
        {
          location: "Remote",
          summary: "Are you legally authorized to work in the United States?",
        },
        s,
      ),
    ).not.toBeNull();
    expect(
      whoCanApply(
        {
          location: "Remote - India",
          summary: "This role is only open to candidates who live in the US.",
        },
        s,
      ),
    ).not.toBeNull();
  });

  it("keeps out a board job whose full description or application form limits it to the US", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await addBoard(ctx, "https://job-boards.greenhouse.io/acme");
    const ok = (body: unknown) => ({ status: 200, json: async () => body });
    const fetcher = async (url: string) => {
      if (url.endsWith("/v1/boards/acme/jobs"))
        return ok({
          jobs: [1, 2].map((id) => ({
            id,
            title: `Implementation Lead ${id}`,
            absolute_url: `https://job-boards.greenhouse.io/acme/jobs/${id}`,
            location: { name: "Remote" },
          })),
        });
      if (url.includes("/jobs/1?questions=true"))
        return ok({
          content: "Fully remote role.",
          questions: [
            {
              label: "Are you legally authorized to work in the United States?",
            },
          ],
        });
      if (url.includes("/jobs/2?questions=true"))
        return ok({
          content: "Fully remote role, open worldwide.",
          questions: [{ label: "LinkedIn profile" }],
        });
      return { status: 404, json: async () => ({}) };
    };
    const rep = await runDiscovery(ctx, {
      fetcher,
      today: "2026-10-02",
      sites: false,
    });
    const found = (await listRecords(ctx)).filter(
      (r) => r.origin === "discovery",
    );
    expect(found.map((r) => r.opportunity)).toEqual(["Implementation Lead 2"]);
    expect(found[0].attributes.whoCanApply).toMatch(/^YES/);
    expect(rep.filteredOut).toBe(1);
  });
});

describe("Who can apply — the wordings that slipped through", () => {
  it("catches common 'another country only' sentences and spares sentences that include India", async () => {
    const { workRestriction, recruiterSign } =
      await import("@/sources/restrictions");
    const { regionVerdictFor, employerVerdict } =
      await import("@/services/discovery");
    const yours = ["India", "Anywhere", "APAC"];
    for (const t of [
      "This is a US-based role.",
      "Remote (US)",
      "Remote - United States",
      "Location: Remote, United States",
      "We are only able to hire in the US and Canada at this time.",
      "This position is open to candidates in the UK only.",
      "US residents only.",
      "We can only hire candidates based in the United States.",
      "Eligible locations: United States, Canada",
    ])
      expect(workRestriction(t, false, yours), t).not.toBeNull();
    for (const t of [
      "Open to candidates in the US, Canada and India.",
      "Remote (US or India).",
      "Salary range shown is for US-based candidates; others are paid in local currency.",
      "We work US hours but hire anywhere in APAC.",
      "Location: Remote (India)",
    ])
      expect(workRestriction(t, false, yours), t).toBeNull();
    const s = {
      regionWords: yours,
      otherRegionWords: ["United States", "US", "USA", "Europe"],
    };
    expect(
      regionVerdictFor(
        { title: "Implementation Manager (US only)", location: "Remote" },
        s,
      ),
    ).toMatch(/^NO — the title says/);
    expect(
      regionVerdictFor(
        {
          title: "US & India Implementation Manager",
          location: "Remote - India",
        },
        s,
      ),
    ).toMatch(/^YES/);
    expect(
      recruiterSign(
        "Weekday AI (client undisclosed - staffing placement)",
        null,
      ),
    ).toMatch(/company name/);
    expect(
      recruiterSign(
        "Jobgether",
        "This position is listed on behalf of a partner company",
      ),
    ).toBeNull(); // wording not in the list: no false alarm
    expect(
      recruiterSign("Acme", "We are hiring for our client, a fintech."),
    ).toMatch(/posting says/);
    expect(employerVerdict("Acme", "Acme is a logistics company.")).toMatch(
      /^YES/,
    );
  });

  it("only says a job is open to you when the listing or description says so (stress-test leaks)", async () => {
    const { regionVerdictFor } = await import("@/services/discovery");
    const { evaluate } = await import("@/core/rules");
    const s = {
      regionWords: ["India", "Anywhere", "Worldwide", "APAC", "Bengaluru"],
      otherRegionWords: ["United States", "US", "UK"],
    };
    const plain = {
      title: "Technical Onboarding Manager",
      location: "Remote",
      workplace: "remote",
    };
    // "Remote" alone, US benefits in the text: not stated → UNKNOWN (goes On hold, not Ready).
    expect(
      regionVerdictFor(
        { ...plain, summary: "Medical, dental, vision and a 401(k) match." },
        s,
      ),
    ).toMatch(/^UNKNOWN/);
    expect(
      regionVerdictFor(
        { ...plain, summary: "This is a remote role. We hire globally." },
        s,
      ),
    ).toMatch(/^YES — the description/);
    expect(
      regionVerdictFor(
        {
          ...plain,
          summary: "The role is fully remote and open to candidates in India.",
        },
        s,
      ),
    ).toMatch(/^YES/);
    expect(
      regionVerdictFor(
        { ...plain, summary: "You can work from anywhere in APAC." },
        s,
      ),
    ).toMatch(/^YES/);
    expect(
      regionVerdictFor(
        { ...plain, summary: "Work from anywhere in the United States." },
        s,
      ),
    ).toMatch(/^UNKNOWN/);
    expect(
      regionVerdictFor(
        { ...plain, summary: "We have offices in Bengaluru and Austin." },
        s,
      ),
    ).toMatch(/^UNKNOWN/);
    expect(
      regionVerdictFor({ ...plain, title: "Solutions Engineer - India" }, s),
    ).toMatch(/^YES — the title/);
    // The hold rule acts on a written UNKNOWN answer, but not on a missing one (leads added by hand).
    const rule = {
      key: "discovery.region_stated",
      label: "Says it's open to your region",
      appliesFrom: "screen" as const,
      field: "openToYourRegion",
      operator: "not_starts_with_any" as const,
      value: ["UNKNOWN"],
      effect: "hold" as const,
      enabled: true,
    };
    expect(
      evaluate(
        [rule],
        { openToYourRegion: "UNKNOWN — the listing doesn't say" },
        "screen",
      ).holds,
    ).toHaveLength(1);
    expect(
      evaluate(
        [rule],
        { openToYourRegion: "YES — listing mentions India" },
        "screen",
      ).holds,
    ).toHaveLength(0);
    expect(evaluate([rule], {}, "screen").holds).toHaveLength(0);
  });

  it("treats 'not remote' and office words in the description as not remote", async () => {
    const { remoteVerdict } = await import("@/services/discovery");
    expect(
      remoteVerdict({
        title: "Ops Lead",
        location: "India",
        summary:
          "Remote-friendly company. This role is not remote: you will be in our Pune office.",
      }),
    ).toMatch(/^NO/);
    expect(
      remoteVerdict({
        title: "Ops Lead",
        location: "India",
        summary: "We are remote-first. This role is hybrid in Bengaluru.",
      }),
    ).toMatch(/^NO/);
    expect(
      remoteVerdict({
        title: "Ops Lead",
        location: "India",
        summary:
          "This is a fully remote role; you can work from anywhere in India.",
      }),
    ).toMatch(/^YES/);
  });

  it("doesn't add a job it couldn't read, and lists skipped jobs with the reason", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await addBoard(ctx, "https://job-boards.greenhouse.io/acme");
    const ok = (body: unknown) => ({ status: 200, json: async () => body });
    const fetcher = async (url: string) => {
      if (url.endsWith("/v1/boards/acme/jobs"))
        return ok({
          jobs: [
            {
              id: 1,
              title: "Implementation Lead",
              absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1",
              location: { name: "Remote" },
            },
            {
              id: 2,
              title: "Implementation Manager",
              absolute_url: "https://job-boards.greenhouse.io/acme/jobs/2",
              location: { name: "Remote" },
            },
            {
              id: 3,
              title: "Implementation Specialist (US only)",
              absolute_url: "https://job-boards.greenhouse.io/acme/jobs/3",
              location: { name: "Remote" },
            },
          ],
        });
      if (url.includes("/jobs/2?questions=true"))
        return ok({
          content:
            "Fully remote. Open to candidates anywhere. We hire in the US only.",
          questions: [],
        });
      return { status: 500, json: async () => ({}) }; // job 1's description can't be read
    };
    const rep = await runDiscovery(ctx, {
      fetcher,
      today: "2026-10-03",
      sites: false,
    });
    expect(rep.unread).toBe(1);
    expect(rep.newLeads).toBe(0);
    expect(rep.skippedTotal).toBe(2);
    expect(rep.skippedJobs?.map((s) => s.title).sort()).toEqual([
      "Implementation Manager",
      "Implementation Specialist (US only)",
    ]);
    expect(
      rep.skippedJobs?.find((s) => s.title === "Implementation Manager")
        ?.reason,
    ).toMatch(/Who can apply/);
  });
});

describe("Closed listings and boards that have gone", () => {
  it("archives a Ready lead whose listing closed, and switches off a board that answers 'not found' twice", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    const ok = (body: unknown) => ({ status: 200, json: async () => body });
    const lever = (ids: string[]) =>
      ok(
        ids.map((id) => ({
          id,
          text: "Implementation Specialist",
          hostedUrl: `https://jobs.lever.co/acme/${id}`,
          categories: { location: "Remote - India" },
          workplaceType: "remote",
          descriptionPlain: "Fully remote role, open worldwide.",
        })),
      );
    let acmeJobs = [OPEN, CLOSED];
    let globexStatus = 200;
    const fetcher = async (url: string) => {
      if (url.includes("lever.co/v0/postings/acme")) return lever(acmeJobs);
      if (url.includes("lever.co/v0/postings/globex"))
        return globexStatus === 200
          ? lever([OPEN])
          : { status: globexStatus, json: async () => ({}) };
      return { status: 404, json: async () => ({}) };
    };
    const lead = (slug: string, id: string) =>
      upsertLead(
        ctx,
        {
          account: slug === "acme" ? "Acme" : "Globex",
          opportunity: "Implementation Specialist",
          sourceUrl: `https://jobs.lever.co/${slug}/${id}`,
        },
        "discovery",
      );
    const closing = (await lead("acme", CLOSED)).record;
    const fine = (await lead("acme", OPEN)).record;
    const onGlobex = (await lead("globex", OPEN)).record;
    await runDiscovery(ctx, { fetcher, today: "2026-10-01", sites: false });
    expect((await getRecord(ctx, fine.id)).status).toBe("active");

    // The listing closes: the lead is archived with a plain reason.
    acmeJobs = [OPEN];
    await runDiscovery(ctx, {
      fetcher,
      today: "2026-10-08",
      sites: false,
      maxAgeMs: 0,
    });
    expect(await getRecord(ctx, closing.id)).toMatchObject({
      status: "archived",
      archiveReason:
        "No longer listed on Acme's job board (checked 2026-10-08)",
    });
    expect((await getRecord(ctx, fine.id)).status).toBe("active");

    // Globex's board disappears: one "not found" is tolerated, the second switches it off and holds its leads.
    globexStatus = 404;
    const rep1 = await runDiscovery(ctx, {
      fetcher,
      today: "2026-10-15",
      sites: false,
      maxAgeMs: 0,
    });
    expect(rep1.boardsFailed).toEqual([
      {
        company: "Globex",
        error: "this job board no longer exists at this address",
      },
    ]);
    expect(rep1.boardsGone).toEqual([]);
    const rep2 = await runDiscovery(ctx, {
      fetcher,
      today: "2026-10-22",
      sites: false,
      maxAgeMs: 0,
    });
    expect(rep2.boardsGone).toEqual(["Globex"]);
    expect(
      (await listBoards(ctx)).find((b) => b.company === "Globex")?.enabled,
    ).toBe(false);
    const held = await getRecord(ctx, onGlobex.id);
    expect(held.status).toBe("hold");
    expect(held.attributes.verifiedOpen).toMatch(
      /^UNKNOWN — Globex's job board no longer exists/,
    );
  });
});

describe("Tidy data", () => {
  it("treats placeholders as empty and ignores bracket notes in company names", async () => {
    const { isUnknown } = await import("@/core/types");
    const { normalizeText } = await import("@/core/dedup");
    for (const v of ["Not checked", "TBD", "-", "?", "N/A", "unknown", ""])
      expect(isUnknown(v), v).toBe(true);
    expect(isUnknown("Bengaluru, India")).toBe(false);
    expect(
      normalizeText("Weekday AI (client undisclosed - staffing placement)"),
    ).toBe(normalizeText("Weekday AI"));
    expect(normalizeText("Acme Technologies Pvt. Ltd.")).toBe(
      "acme technologies",
    );
  });
});

describe("Being frugal and reading Workday", () => {
  it("reads a Workday job through its JSON twin", async () => {
    const { postingPageTitle } = await import("@/sources/job-sites");
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return {
        status: 200,
        json: async () => ({
          jobPostingInfo: {
            title: "Project Manager, PMO Operations",
            jobDescription:
              "<p>Fully remote. Must be based in the United States.</p>",
            location: "Hyderabad, India",
          },
        }),
        text: async () => "",
      };
    };
    const got = await postingPageTitle(
      "https://astreya.wd5.myworkdayjobs.com/en-US/life-at-astreya/job/hyderabad-india/project-manager_r0017274",
      fetcher,
    );
    expect(asked[0]).toBe(
      "https://astreya.wd5.myworkdayjobs.com/wday/cxs/astreya/life-at-astreya/job/hyderabad-india/project-manager_r0017274",
    );
    expect(got?.title).toBe("Project Manager, PMO Operations");
    expect(got?.onlyFor).toMatch(/must live in another country/);
  });

  it("remembers a skipped job for a month instead of downloading and judging it again", async () => {
    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await addBoard(ctx, "https://job-boards.greenhouse.io/acme");
    const asked: string[] = [];
    const ok = (body: unknown) => ({ status: 200, json: async () => body });
    const fetcher = async (url: string) => {
      asked.push(url);
      if (url.endsWith("/v1/boards/acme/jobs"))
        return ok({
          jobs: [
            {
              id: 7,
              title: "Implementation Lead",
              absolute_url: "https://job-boards.greenhouse.io/acme/jobs/7",
              location: { name: "Remote" },
            },
          ],
        });
      if (url.includes("/jobs/7?questions=true"))
        return ok({
          content: "Fully remote. Only open to candidates in the US.",
          questions: [],
        });
      return { status: 404, json: async () => ({}) };
    };
    const rep1 = await runDiscovery(ctx, {
      fetcher,
      today: "2026-10-03",
      sites: false,
    });
    expect(rep1.skippedTotal).toBe(1);
    const fetches = asked.filter((u) => u.includes("/jobs/7")).length;
    const rep2 = await runDiscovery(ctx, {
      fetcher,
      today: "2026-10-10",
      sites: false,
      maxAgeMs: 0,
    });
    expect(rep2.filteredOut).toBe(1);
    expect(rep2.skippedTotal).toBe(0); // not judged again
    expect(asked.filter((u) => u.includes("/jobs/7")).length).toBe(fetches); // and not downloaded again
  });
});

describe("Region wording", () => {
  it("doesn't mistake 'Remote job' or 'Remote – hiring worldwide' for a place", () => {
    const mine = ["India", "Anywhere", "Worldwide"];
    const others = ["United States", "US", "Canada"];
    expect(regionVerdict("Remote job", mine, others, "remote")).toBe("UNKNOWN");
    expect(
      regionVerdict("Remote — hiring worldwide", mine, others, "remote"),
    ).toMatch(/^YES/);
    expect(regionVerdict("Remote US", mine, others, "remote")).toMatch(/^NO/);
    expect(regionVerdict("Remote – Chicago", mine, others, "remote")).toMatch(
      /^NO — remote, but/,
    );
  });
});

describe("Existing leads are re-checked against the posting", () => {
  it("catches 'Remote anywhere in the US' and archives a Ready lead found before the check existed", async () => {
    const { workRestriction } = await import("@/sources/restrictions");
    expect(
      workRestriction(
        "Location Preference: Remote anywhere in the US\n\nAbout The Role: we are seeking…",
      ),
    ).toMatch(/another country/);
    expect(workRestriction("Remote anywhere in the US.")).not.toBeNull();
    expect(workRestriction("Work from anywhere in the world.")).toBeNull();

    const ctx = await testCtx();
    await seedDiscoveryRules(ctx);
    await addBoard(ctx, "https://job-boards.greenhouse.io/fp");
    const ok = (body: unknown) => ({ status: 200, json: async () => body });
    const fetcher = async (url: string) => {
      if (url.endsWith("/v1/boards/fp/jobs"))
        return ok({
          jobs: [
            {
              id: 5,
              title: "Customer Success Engineer - US",
              absolute_url: "https://job-boards.greenhouse.io/fp/jobs/5",
              location: { name: "Remote" },
            },
          ],
        });
      if (url.includes("/jobs/5?questions=true"))
        return ok({
          content:
            "Fully remote.\n\nLocation Preference: Remote anywhere in the US",
          questions: [],
        });
      return { status: 404, json: async () => ({}) };
    };
    // A lead added by an older version: Ready, with the old, incomplete facts.
    const old = (
      await upsertLead(
        ctx,
        {
          account: "FP",
          opportunity: "Customer Success Engineer - US",
          sourceUrl: "https://job-boards.greenhouse.io/fp/jobs/5",
          attributes: {
            whoCanApply:
              "YES — the full posting doesn't limit who can apply to another country",
            remoteCheck: "YES — the job board marks it remote",
            openToYourRegion: "UNKNOWN",
          },
        },
        "discovery",
      )
    ).record;
    await ctx.db.update(records).set({ sourceVerification: "verified" });
    const ready = await reviewFoundJob(ctx, old.id, "yes");
    expect(ready).toMatchObject({ stage: "verify", status: "active" });

    // The next search re-judges it from the posting, and the weekly check archives it with the reason.
    await runDiscovery(ctx, { fetcher, today: "2026-10-08", sites: false });
    const re = await getRecord(ctx, old.id);
    expect(re.attributes.whoCanApply).toMatch(/^NO/);
    expect(re.attributes.openToYourRegion).toMatch(/^NO — the title says/);
    await runUpdate(ctx);
    const after = await getRecord(ctx, old.id);
    expect(after.status).toBe("archived");
    expect(
      (
        await listHistory(ctx, {
          entityType: "record",
          entityId: old.id,
          limit: 50,
        })
      ).some((h) => h.event === "facts_rechecked"),
    ).toBe(true);
  });
});
