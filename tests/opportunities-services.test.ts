/** Opportunities services: search persistence, provenance, demo/live separation, isolation, export, safety. */
import { describe, expect, it } from "vitest";
import { acceptInvite, createFirstPassword, createInvite, OWNER_ID } from "@/lib/auth";
import { tenderQuery } from "@/core/opportunities/modules/tenders";
import type { NormalizedItem } from "@/core/opportunities/types";
import type { Ctx } from "@/services/context";
import { exportItems, DEMO_LABEL } from "@/services/opportunities/export";
import {
  addNote,
  addToList,
  createList,
  getItem,
  listNotes,
  listSaved,
  saveItem,
  searchResults,
  setStatus,
  toNormalized,
  unsaveItem,
} from "@/services/opportunities/items";
import { getProfile, saveProfile } from "@/services/opportunities/profile";
import { recentSearches, runSearch, SearchInputError } from "@/services/opportunities/search";
import { UsageLimitError } from "@/services/opportunities/usage";
import { unsupportedFigures, summarizeRecord } from "@/sources/opportunities/ai-enricher";
import { findATender, normalizeRelease } from "@/sources/opportunities/find-a-tender";
import { checkUrl, isPrivateAddress, safeGetText, UnsafeUrlError } from "@/sources/opportunities/safe-fetch";
import type { Provider } from "@/sources/opportunities/types";
import { toCsv } from "@/services/export";
import { testCtx } from "./helpers";

const NOW = new Date("2026-10-09T10:00:00Z");

async function twoSpaces(): Promise<{ owner: Ctx; anna: Ctx }> {
  const owner = await testCtx();
  await createFirstPassword(owner.db, "correct horse battery");
  const { token } = await createInvite(owner.db, { email: "anna@example.com", name: "Anna", createdBy: OWNER_ID });
  const a = (await acceptInvite(owner.db, token!, "annas own password"))!;
  return { owner, anna: { db: owner.db, workspaceId: a.workspaceId, actor: { kind: "human", id: a.id } } };
}

/** A fake live provider: returns whatever it's given, or throws. */
function fakeLive(items: NormalizedItem[] | Error, id = "fake-live"): Provider<Record<string, unknown>> {
  return {
    id,
    name: "Fake live source",
    module: "tenders",
    mode: "live",
    description: "test",
    storagePolicy: "test",
    available: () => ({ ok: true }),
    search: async () => {
      if (items instanceof Error) throw items;
      return { items, warnings: [] };
    },
  };
}

describe("demo search end to end", () => {
  it("stores ranked results with field-level provenance, and labels everything demo", async () => {
    const ctx = await testCtx();
    await saveProfile(ctx, { services: "website design, accessibility", certifications: "Cyber Essentials" });
    const out = await runSearch(ctx, "tenders", { mode: "demo", keywords: "accessibility" }, { now: NOW });
    expect(out.status).toBe("complete");
    expect(out.resultCount).toBeGreaterThan(1);
    const res = (await searchResults(ctx, out.searchId))!;
    expect(res.search.mode).toBe("demo");
    expect(res.rows.every((r) => r.item.mode === "demo")).toBe(true);
    const top = res.rows[0];
    expect(top.match.components.length).toBeGreaterThan(3);
    // Provenance survives storage: every known field still has its evidence with source URL, provider and retrieval time.
    const it = toNormalized(top.item);
    for (const f of Object.values(it.fields)) {
      if (f.state === "unknown") continue;
      expect(f.evidence.length).toBeGreaterThan(0);
      for (const e of f.evidence) {
        expect(e.provider).toMatch(/^demo-/);
        expect(e.retrievedAt).toBe(NOW.toISOString());
      }
    }
    const deadline = it.fields.deadline;
    expect(deadline.raw).toBeTruthy();
    expect(deadline.evidence[0].quote).toBe(deadline.raw);
  });

  it("re-running a search updates items in place and keeps the user's status and notes", async () => {
    const ctx = await testCtx();
    const first = await runSearch(ctx, "suppliers", { mode: "demo", product: "tote bags" }, { now: NOW });
    const row = (await searchResults(ctx, first.searchId))!.rows[0].item;
    await setStatus(ctx, row.id, "evaluating");
    await addNote(ctx, row.id, "Ask for a sample in natural canvas");
    const second = await runSearch(ctx, "suppliers", { mode: "demo", product: "tote bags" }, { now: NOW });
    const again = (await searchResults(ctx, second.searchId))!.rows.find((r) => r.item.id === row.id)!;
    expect(again.item.status).toBe("evaluating");
    expect((await listNotes(ctx, row.id))[0].body).toMatch(/sample/);
  });

  it("a demo search with one failing source is partial and names it; all failing is a failed search with no results", async () => {
    const ctx = await testCtx();
    const partial = await runSearch(ctx, "sponsors", { mode: "demo", simulate: "one_source_fails" }, { now: NOW });
    expect(partial.status).toBe("partial");
    const p = (await searchResults(ctx, partial.searchId))!;
    expect((p.search.providers as { ok: boolean; error?: string }[]).filter((r) => !r.ok)[0].error).toMatch(/Simulated timeout/);
    expect(p.rows.length).toBeGreaterThan(0);
    const failed = await runSearch(ctx, "sponsors", { mode: "demo", simulate: "all_sources_fail" }, { now: NOW });
    expect(failed.status).toBe("failed");
    expect(failed.resultCount).toBe(0);
    expect(failed.error).toMatch(/No source answered/);
  });

  it("rejects invalid input with a plain message", async () => {
    const ctx = await testCtx();
    await expect(runSearch(ctx, "tenders", { mode: "demo", deadlineFrom: "next week" }, { now: NOW })).rejects.toBeInstanceOf(SearchInputError);
  });

  it("rate-limits searches per workspace per minute", async () => {
    const ctx = await testCtx();
    process.env.OPP_SEARCHES_PER_MINUTE = "2";
    try {
      await runSearch(ctx, "expansion", { mode: "demo" }, { now: NOW });
      await runSearch(ctx, "expansion", { mode: "demo" }, { now: NOW });
      await expect(runSearch(ctx, "expansion", { mode: "demo" }, { now: NOW })).rejects.toBeInstanceOf(UsageLimitError);
    } finally {
      delete process.env.OPP_SEARCHES_PER_MINUTE;
    }
  });
});

describe("demo and live never mix", () => {
  it("a failed live search records the failure and never substitutes demo results", async () => {
    const ctx = await testCtx();
    const out = await runSearch(ctx, "tenders", { mode: "live" }, { now: NOW, providers: [fakeLive(new Error("The provider answered 503"))] });
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/No demo data was used/);
    expect((await searchResults(ctx, out.searchId))!.rows).toEqual([]);
  });

  it("modules without a live source refuse live mode outright", async () => {
    const ctx = await testCtx();
    const out = await runSearch(ctx, "suppliers", { mode: "live" }, { now: NOW });
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/No live data source is connected/);
  });

  it("a provider that hands back records of the other mode has them dropped", async () => {
    const ctx = await testCtx();
    const demoItem = (await (await import("@/sources/opportunities/demo/tenders")).demoTenderPortal.search(tenderQuery.parse({}), { now: NOW, getJson: async () => ({}), cache: { get: async () => null, set: async () => {} } })).items[0];
    const out = await runSearch(ctx, "tenders", { mode: "live" }, { now: NOW, providers: [fakeLive([demoItem])] });
    expect(out.resultCount).toBe(0);
    expect((await recentSearches(ctx, "tenders"))[0].warnings.join(" ")).toMatch(/wrong kind were dropped/);
  });

  it("the same notice found in demo and live stays two separate records", async () => {
    const ctx = await testCtx();
    const live = normalizeRelease(SAMPLE_RELEASE, NOW);
    await runSearch(ctx, "tenders", { mode: "live", includeClosed: "on" }, { now: NOW, providers: [fakeLive([live])] });
    await runSearch(ctx, "tenders", { mode: "demo" }, { now: NOW });
    const liveRows = (await recentSearches(ctx, "tenders")).filter((s) => s.mode === "live");
    expect(liveRows).toHaveLength(1);
  });
});

describe("saved items, lists, statuses, export", () => {
  it("saves into named lists, tracks status, and exports with provenance and demo labels", async () => {
    const ctx = await testCtx();
    const out = await runSearch(ctx, "tenders", { mode: "demo" }, { now: NOW });
    const rows = (await searchResults(ctx, out.searchId))!.rows;
    const list = await createList(ctx, "tenders", "Q4 bids");
    await addToList(ctx, list.id, rows[0].item.id);
    await saveItem(ctx, rows[1].item.id, "preparing");
    await addNote(ctx, rows[0].item.id, "Call the buyer's procurement desk on Monday");
    expect((await getItem(ctx, rows[0].item.id)).status).toBe("saved");
    expect((await listSaved(ctx, { module: "tenders", listId: list.id })).map((r) => r.id)).toEqual([rows[0].item.id]);
    expect((await listSaved(ctx, { module: "tenders", status: "preparing" })).map((r) => r.id)).toEqual([rows[1].item.id]);
    await expect(createList(ctx, "tenders", "Q4 bids")).rejects.toThrow(/already have a list/);
    await expect(setStatus(ctx, rows[0].item.id, "won_the_lottery")).rejects.toThrow(/Unknown status/);

    const internal = await exportItems(ctx, "tenders", { listId: list.id }, "internal");
    expect(internal.demo).toBe(true);
    expect(internal.rows[0]["Data mode"]).toBe(DEMO_LABEL);
    expect(internal.rows[0]["Source URL"]).toMatch(/^https:\/\/notices\.demo-portal\.example\//);
    expect(internal.rows[0]["Retrieved at"]).toBe(NOW.toISOString());
    expect(String(internal.rows[0]["Submission deadline — original wording"])).toBeTruthy();
    expect(internal.rows[0].Notes).toMatch(/procurement desk/);
    const shared = await exportItems(ctx, "tenders", { listId: list.id }, "shared");
    expect(shared.rows[0]).not.toHaveProperty("Notes");
    expect(toCsv(shared.rows)).toContain(DEMO_LABEL);

    const all = await exportItems(ctx, "tenders", { searchId: out.searchId }, "shared");
    expect(all.rows).toHaveLength(rows.length);
    expect(all.rows[0]).toHaveProperty("Score (0–100, comparative)");

    await unsaveItem(ctx, rows[0].item.id);
    expect(await listSaved(ctx, { module: "tenders", listId: list.id })).toEqual([]);
  });

  it("automated actors can't record statuses that mean a person acted", async () => {
    const ctx = await testCtx();
    const out = await runSearch(ctx, "tenders", { mode: "demo" }, { now: NOW });
    const id = (await searchResults(ctx, out.searchId))!.rows[0].item.id;
    const bot: Ctx = { ...ctx, actor: { kind: "system", process: "test" } };
    await expect(setStatus(bot, id, "submitted")).rejects.toThrow();
    await expect(setStatus(ctx, id, "submitted")).resolves.toMatchObject({ status: "submitted" });
  });
});

describe("workspace isolation", () => {
  it("searches, items, lists, notes, profile and exports never cross workspaces", async () => {
    const { owner, anna } = await twoSpaces();
    await saveProfile(owner, { companyName: "Owner Ltd", services: "secret service line" });
    const out = await runSearch(owner, "tenders", { mode: "demo" }, { now: NOW });
    const item = (await searchResults(owner, out.searchId))!.rows[0].item;
    const list = await createList(owner, "tenders", "Owner list");
    await addToList(owner, list.id, item.id);
    await addNote(owner, item.id, "owner's private note");

    expect(await searchResults(anna, out.searchId)).toBeNull();
    await expect(getItem(anna, item.id)).rejects.toThrow(/not found/);
    await expect(saveItem(anna, item.id)).rejects.toThrow(/not found/);
    await expect(addNote(anna, item.id, "x")).rejects.toThrow(/not found/);
    await expect(addToList(anna, list.id, item.id)).rejects.toThrow(/not found/);
    expect(await listNotes(anna, item.id)).toEqual([]);
    expect(await listSaved(anna, { module: "tenders" })).toEqual([]);
    expect(await recentSearches(anna)).toEqual([]);
    expect((await getProfile(anna)).companyName).toBe("");
    await expect(exportItems(anna, "tenders", { searchId: out.searchId }, "internal")).rejects.toThrow(/not found/);
    await expect(exportItems(anna, "tenders", { listId: list.id }, "internal")).rejects.toThrow(/not found/);

    // Anna's own search of the same demo data creates her own rows.
    const hers = await runSearch(anna, "tenders", { mode: "demo" }, { now: NOW });
    const herItem = (await searchResults(anna, hers.searchId))!.rows[0].item;
    expect(herItem.id).not.toBe(item.id);
    expect((await getItem(owner, item.id)).savedAt).toBeTruthy();
  });
});

describe("network safety", () => {
  it("refuses private, loopback and link-local addresses, raw IPs, http, credentials and unlisted hosts", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.20.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.69", "2a04:4e42::1"]) expect(isPrivateAddress(ip)).toBe(false);
    const allow = ["www.find-tender.service.gov.uk"];
    expect(() => checkUrl("http://www.find-tender.service.gov.uk/x", allow)).toThrow(UnsafeUrlError);
    expect(() => checkUrl("https://user:pw@www.find-tender.service.gov.uk/x", allow)).toThrow(UnsafeUrlError);
    expect(() => checkUrl("https://169.254.169.254/latest", ["169.254.169.254"])).toThrow(/Raw IP/);
    expect(() => checkUrl("https://evil.example/x", allow)).toThrow(/not an allowed host/);
    expect(() => checkUrl("https://www.find-tender.service.gov.uk:8443/x", allow)).toThrow(/port/);
    expect(checkUrl("https://www.find-tender.service.gov.uk/api", allow).hostname).toBe(allow[0]);
  });

  it("blocks hosts that resolve to private addresses and redirects to other hosts; retries are bounded", async () => {
    const allow = ["api.example.org"];
    await expect(safeGetText("https://api.example.org/x", { allowHosts: allow, lookup: async () => [{ address: "10.0.0.5" }], fetchImpl: (async () => new Response("{}")) as typeof fetch })).rejects.toThrow(/private/);
    const redirect = (async () => new Response(null, { status: 302, headers: { location: "https://metadata.internal/" } })) as typeof fetch;
    await expect(safeGetText("https://api.example.org/x", { allowHosts: allow, lookup: async () => [{ address: "93.184.216.34" }], fetchImpl: redirect })).rejects.toThrow(/not an allowed host/);
    let calls = 0;
    const flaky = (async () => {
      calls++;
      return new Response("busy", { status: 503 });
    }) as typeof fetch;
    await expect(safeGetText("https://api.example.org/x", { allowHosts: allow, retries: 2, lookup: async () => [{ address: "93.184.216.34" }], fetchImpl: flaky, sleep: async () => {} })).rejects.toThrow(/503/);
    expect(calls).toBe(3);
    const big = (async () => new Response("x".repeat(100), { headers: { "content-length": "100" } })) as typeof fetch;
    await expect(safeGetText("https://api.example.org/x", { allowHosts: allow, maxBytes: 10, lookup: async () => [{ address: "93.184.216.34" }], fetchImpl: big })).rejects.toThrow(/larger/);
  });
});

const SAMPLE_RELEASE = {
  ocid: "ocds-test-000001",
  id: "000001-2026",
  date: "2026-10-01T09:00:00+01:00",
  buyer: { name: "Example Borough Council" },
  parties: [{ name: "Example Borough Council", roles: ["buyer"], address: { region: "UKM75", countryName: "United Kingdom" } }],
  tender: {
    title: "Website accessibility audit",
    description: "An audit of the council website against WCAG 2.2 AA.",
    status: "active",
    mainProcurementCategory: "services",
    classification: { id: "72000000", description: "IT services" },
    value: { amount: 40000, currency: "GBP" },
    tenderPeriod: { endDate: "2026-11-02T12:00:00Z" },
    submissionMethod: ["electronicSubmission"],
    submissionMethodDetails: "https://portal.example.org/tenders",
    selectionCriteria: { criteria: [{ type: "suitability", description: "Cyber Essentials required." }] },
  },
};

describe("Find a Tender (live) normalisation", () => {
  it("maps OCDS fields with provenance, the OGL source link and region names, and leaves gaps unknown", () => {
    const it = normalizeRelease(SAMPLE_RELEASE, NOW);
    expect(it.mode).toBe("live");
    expect(it.sourceUrl).toBe("https://www.find-tender.service.gov.uk/Notice/000001-2026");
    expect(it.fields.geography.value).toContain("UKM75 (Scotland)");
    expect(it.fields.deadline.raw).toBe("2026-11-02T12:00:00Z");
    expect((it.fields.deadline.value as { instant: string }).instant).toBe("2026-11-02T12:00:00.000Z");
    expect(it.fields.budget.note).toMatch(/Estimated value/);
    expect(it.fields.requiredDocuments.state).toBe("unknown");
    expect(it.fields.eligibility.value).toEqual(["suitability: Cyber Essentials required."]);
    expect(it.fields.buyer.evidence[0]).toMatchObject({ provider: "find-a-tender", publishedAt: "2026-10-01T09:00:00+01:00", retrievedAt: NOW.toISOString() });
    expect(findATender.attribution).toMatch(/Open Government Licence/);
  });

  it("reads bounded pages through the cache and warns when results may be incomplete", async () => {
    let fetched = 0;
    const store = new Map<string, unknown>();
    const page = (n: number) => ({ releases: [{ ...SAMPLE_RELEASE, ocid: `ocds-${n}`, id: `${n}-2026` }], links: { next: `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?cursor=${n + 1}` } });
    const io = {
      now: NOW,
      getJson: async () => page(++fetched),
      cache: { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: unknown) => void store.set(k, v) },
    };
    const res = await findATender.search(tenderQuery.parse({ mode: "live" }), io);
    expect(fetched).toBe(3);
    expect(res.items).toHaveLength(3);
    expect(res.warnings.join(" ")).toMatch(/results may be incomplete/);
    fetched = 0;
    const again = await findATender.search(tenderQuery.parse({ mode: "live" }), io);
    expect(fetched).toBe(0);
    expect(again.cached).toBe(true);
  });
});

describe("AI enrichment guard", () => {
  it("is off without explicit opt-in, and discards summaries that cite figures not in the source", async () => {
    delete process.env.OPP_AI_ENRICHMENT;
    expect(await summarizeRecord("anything")).toMatchObject({ ok: false, error: expect.stringMatching(/off/) });
    expect(unsupportedFigures("Budget is £85,000 and closes 10 November 2026.", "Budget: £85,000")).toEqual(["10 November 2026"]);
    const fake = {
      beta: {
        messages: {
          parse: async () => ({ stop_reason: "end_turn", model: "test-model", parsed_output: { summary: "Worth £2m and closes 2027-01-01.", keyPoints: [], caveats: [] } }),
        },
      },
    } as unknown as Parameters<typeof summarizeRecord>[1];
    expect(await summarizeRecord("Title: Thing", fake)).toMatchObject({ ok: false, error: expect.stringMatching(/figures not in the source/) });
    const good = {
      beta: { messages: { parse: async () => ({ stop_reason: "end_turn", model: "test-model", parsed_output: { summary: "A website audit for a council.", keyPoints: ["WCAG 2.2"], caveats: [] } }) } },
    } as unknown as Parameters<typeof summarizeRecord>[1];
    expect(await summarizeRecord("Title: Website audit WCAG 2.2", good)).toMatchObject({ ok: true, model: "test-model" });
  });
});
