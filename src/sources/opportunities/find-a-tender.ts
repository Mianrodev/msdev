/**
 * Live tenders: UK Find a Tender Service (FTS) public OCDS API.
 *
 *   https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?updatedFrom=…&limit=100
 *
 * Keyless, read-only, published by the Cabinet Office under the Open Government Licence v3.0
 * (reuse and storage allowed with attribution).
 *
 * Coverage — what one search actually reads:
 *  - The API has no keyword, region or deadline search. The app reads every release (all notice
 *    types) updated in the last OPP_FTS_LOOKBACK_DAYS days (default 3), newest first, up to
 *    OPP_FTS_MAX_PAGES pages of 100 (default 20 = 2,000 releases), then filters locally.
 *  - It deliberately does NOT use `stages=tender`: in October 2026 that filter returned only notices
 *    under the old EU-derived regulations (legal basis 32014L00xx) and left out Procurement Act 2023
 *    notices (legal basis 2023/54), which are most new UK tenders. The docs describe `stages` as a
 *    coarse filter only.
 *  - A contracting process is kept only if its newest release in the window is a tender, tender
 *    update or cancellation — so a process that has moved on to award/contract isn't shown as open.
 *  - A tender published earlier and not updated within the window is NOT seen. Notices published only
 *    on Contracts Finder or devolved portals, and private-sector RFPs, are not included. (Procurement
 *    Act notices marked "below threshold" do appear on Find a Tender and are included.)
 * Pages are cached for 30 minutes to respect the service.
 */
import { z } from "zod";
import { parseDeadline } from "@/core/opportunities/dates";
import { itemKey } from "@/core/opportunities/dedup";
import { fromSource, known, unknown } from "@/core/opportunities/fields";
import type { Money } from "@/core/opportunities/money";
import type { TenderQuery } from "@/core/opportunities/modules/tenders";
import type { Evidence, Link, NormalizedItem } from "@/core/opportunities/types";
import { ProviderError, type Provider } from "./types";

const HOST = "www.find-tender.service.gov.uk";
const BASE = `https://${HOST}/api/1.0/ocdsReleasePackages`;
const PAGE_SIZE = 100;
const ID = "find-a-tender";

const envInt = (name: string, d: number, lo: number, hi: number) => {
  const n = Math.round(Number(process.env[name]));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
};
/** Days of updates read per search (1–14). */
export const lookbackDays = () => envInt("OPP_FTS_LOOKBACK_DAYS", 3, 1, 14);
/** Pages of 100 releases read per search (1–50). */
export const maxPages = () => envInt("OPP_FTS_MAX_PAGES", 20, 1, 50);

/** One line, always visible before a live search. */
export function coverageSummary(): string {
  return `Live = Find a Tender notices updated in the last ${lookbackDays()} day${lookbackDays() === 1 ? "" : "s"} only — not every open UK tender.`;
}

/** Plain statement of coverage, shown before a live search and next to its results. */
export function coverageStatement(): string {
  return `Find a Tender (UK public sector: Procurement Act 2023 notices, including those marked below threshold, plus older-regime notices still being updated). Each live search reads notices updated in the last ${lookbackDays()} day${lookbackDays() === 1 ? "" : "s"} (newest first, at most ${(maxPages() * PAGE_SIZE).toLocaleString("en-GB")} releases) and filters them here. Tenders published earlier and not updated since, notices published only on Contracts Finder or devolved portals (e.g. Public Contracts Scotland, Sell2Wales, eTendersNI), private-sector RFPs and other countries are not included.`;
}

const TENDER_TAGS = new Set(["tender", "tenderUpdate", "tenderAmendment", "tenderCancellation"]);

/** UK NUTS level-1 codes → region names (deterministic lookup, so "Scotland" finds UKM… notices). */
const NUTS1: Record<string, string> = {
  UKC: "North East England",
  UKD: "North West England",
  UKE: "Yorkshire and the Humber",
  UKF: "East Midlands",
  UKG: "West Midlands",
  UKH: "East of England",
  UKI: "London",
  UKJ: "South East England",
  UKK: "South West England",
  UKL: "Wales",
  UKM: "Scotland",
  UKN: "Northern Ireland",
};

const region = (code: string | undefined | null) => {
  if (!code) return null;
  const name = NUTS1[code.slice(0, 3).toUpperCase()];
  return name ? `${code} (${name})` : code === "UK" ? "United Kingdom" : code;
};

const Value = z.object({ amount: z.number().nullish(), currency: z.string().nullish() }).partial();
const Release = z
  .object({
    ocid: z.string(),
    id: z.string(),
    date: z.string().nullish(),
    tag: z.array(z.string()).nullish(),
    buyer: z.object({ name: z.string().nullish() }).partial().nullish(),
    parties: z
      .array(
        z
          .object({
            name: z.string().nullish(),
            roles: z.array(z.string()).nullish(),
            address: z.object({ region: z.string().nullish(), locality: z.string().nullish(), countryName: z.string().nullish() }).partial().nullish(),
          })
          .partial(),
      )
      .nullish(),
    tender: z
      .object({
        title: z.string().nullish(),
        description: z.string().nullish(),
        status: z.string().nullish(),
        mainProcurementCategory: z.string().nullish(),
        procurementMethodDetails: z.string().nullish(),
        classification: z.object({ id: z.string().nullish(), description: z.string().nullish() }).partial().nullish(),
        items: z
          .array(
            z
              .object({
                additionalClassifications: z.array(z.object({ description: z.string().nullish() }).partial()).nullish(),
                deliveryAddresses: z.array(z.object({ region: z.string().nullish() }).partial()).nullish(),
              })
              .partial(),
          )
          .nullish(),
        lots: z.array(z.object({ title: z.string().nullish(), description: z.string().nullish() }).partial()).nullish(),
        value: Value.nullish(),
        tenderPeriod: z.object({ endDate: z.string().nullish() }).partial().nullish(),
        enquiryPeriod: z.object({ endDate: z.string().nullish() }).partial().nullish(),
        submissionMethod: z.array(z.string()).nullish(),
        submissionMethodDetails: z.string().nullish(),
        eligibilityCriteria: z.string().nullish(),
        selectionCriteria: z.object({ criteria: z.array(z.object({ type: z.string().nullish(), description: z.string().nullish() }).partial()).nullish() }).partial().nullish(),
        documents: z.array(z.object({ documentType: z.string().nullish(), title: z.string().nullish(), url: z.string().nullish() }).partial()).nullish(),
      })
      .partial()
      .nullish()
      .default({}),
  })
  .passthrough();
type ReleaseT = z.infer<typeof Release>;

const Package = z.object({ releases: z.array(z.unknown()), links: z.object({ next: z.string().nullish() }).partial().nullish() }).passthrough();

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))];

export function normalizeRelease(r: ReleaseT, now: Date): NormalizedItem {
  const t = r.tender ?? {};
  const noticeUrl = `https://${HOST}/Notice/${encodeURIComponent(r.id)}`;
  const publishedAt = r.date ?? null;
  const ev = (quote: string | null, label = "Notice data (OCDS)"): Evidence => ({
    kind: "published",
    provider: ID,
    sourceUrl: noticeUrl,
    retrievedAt: now.toISOString(),
    publishedAt,
    quote: quote ? quote.slice(0, 1200) : null,
    label,
  });
  const buyerParty = r.parties?.find((p) => p.roles?.includes("buyer"));
  const buyer = r.buyer?.name ?? buyerParty?.name ?? null;
  const geography = uniq([
    region(buyerParty?.address?.region),
    buyerParty?.address?.locality,
    buyerParty?.address?.countryName,
    ...(t.items ?? []).flatMap((i) => (i.deliveryAddresses ?? []).map((d) => region(d.region))),
  ]);
  const categories = uniq([t.classification?.description, ...(t.items ?? []).flatMap((i) => (i.additionalClassifications ?? []).map((c) => c.description))]);
  const deadlineRaw = t.tenderPeriod?.endDate ?? null;
  const deadline = parseDeadline(deadlineRaw);
  const clarRaw = t.enquiryPeriod?.endDate ?? null;
  const clar = parseDeadline(clarRaw);
  // A published amount of 0 (or less) is a placeholder, not a budget — treat it as not stated.
  const zeroValue = typeof t.value?.amount === "number" && t.value.amount <= 0;
  const money: Money | null =
    typeof t.value?.amount === "number" && t.value.amount > 0 ? { raw: `${t.value.amount} ${t.value.currency ?? ""}`.trim(), currency: t.value.currency ?? null, min: t.value.amount, max: t.value.amount, qualifier: "exact" } : null;
  const eligibility = uniq([t.eligibilityCriteria, ...(t.selectionCriteria?.criteria ?? []).map((c) => (c.description ? `${c.type ? `${c.type}: ` : ""}${c.description}` : null))]);
  const docs = (t.documents ?? []).filter((d) => d.url && /^https:\/\//i.test(d.url));
  const scope = uniq((t.lots ?? []).map((l) => [l.title, l.description].filter(Boolean).join(": "))).join("\n\n");
  const submission = uniq([...(t.submissionMethod ?? []).map((s) => s.replace(/([a-z])([A-Z])/g, "$1 $2")), t.submissionMethodDetails]).join(" — ");
  const links: Link[] = [
    { label: "Original notice on Find a Tender", url: noticeUrl, kind: "notice" },
    ...docs.map((d) => ({ label: d.title ?? d.documentType ?? "Document", url: d.url!, kind: "attachment" as const })),
    ...(t.submissionMethodDetails && /^https?:\/\//i.test(t.submissionMethodDetails) ? [{ label: "Submission portal", url: t.submissionMethodDetails, kind: "submission" as const }] : []),
  ];
  return {
    module: "tenders",
    key: itemKey("tenders", { id: r.ocid }),
    provider: ID,
    mode: "live",
    title: t.title ?? "(untitled notice)",
    subtitle: buyer,
    sourceUrl: noticeUrl,
    retrievedAt: now.toISOString(),
    publishedAt,
    links,
    fields: {
      buyer: fromSource(buyer, ev(buyer)),
      reference: known(r.id, ev(r.id)),
      noticeStatus: fromSource(t.status, ev(t.status ?? null), t.status, `As listed by Find a Tender on ${now.toISOString().slice(0, 10)}`),
      opportunityType: fromSource(t.mainProcurementCategory, ev(t.mainProcurementCategory ?? null)),
      procedure: fromSource(t.procurementMethodDetails, ev(t.procurementMethodDetails ?? null)),
      category: fromSource(categories, ev(categories.join(", "))),
      geography: fromSource(geography, ev(geography.join(", "), "Notice data (OCDS) — NUTS codes with region names added")),
      summary: fromSource(t.description, ev(t.description ?? null)),
      scope: scope ? known(scope, ev(scope)) : unknown("No lot details published"),
      publishedOn: publishedAt ? known(publishedAt.slice(0, 10), ev(publishedAt), publishedAt) : unknown(),
      deadline: deadline ? known(deadline, ev(deadline.raw), deadline.raw, deadline.notes.join("; ") || undefined) : unknown("Deadline not published in the notice data"),
      clarificationDeadline: clar ? known(clar, ev(clar.raw), clar.raw, clar.notes.join("; ") || undefined) : unknown(),
      budget: money
        ? known(money, ev(money.raw), money.raw, "Estimated value as published (OCDS tender.value) — not a guaranteed amount")
        : unknown(zeroValue ? "Published as 0 — treated as not stated" : "Budget not published"),
      eligibility: eligibility.length ? known(eligibility, ev(eligibility.join("\n"))) : unknown("Not published in the notice data — read the full notice"),
      requiredDocuments: unknown("Not listed in the notice data — usually in the tender pack"),
      submissionMethod: submission ? known(submission, ev(submission)) : unknown("Not stated"),
      attachments: docs.length ? known(docs.map((d) => d.title ?? d.documentType ?? d.url!), ev(docs.map((d) => d.url).join("\n"), "Notice documents")) : unknown("No documents linked in the notice data"),
    },
  };
}

/** Start of the update window, in whole hours (keeps the cache key stable within an hour). */
function windowStart(now: Date): string {
  const from = new Date(now.getTime() - lookbackDays() * 86_400_000);
  from.setUTCMinutes(0, 0, 0);
  return from.toISOString().slice(0, 19);
}

function firstUrl(now: Date): string {
  const p = new URLSearchParams({ limit: String(PAGE_SIZE), updatedFrom: windowStart(now) });
  return `${BASE}?${p}`;
}

export const findATender: Provider<TenderQuery> = {
  id: ID,
  name: "Find a Tender (UK)",
  module: "tenders",
  mode: "live",
  description: "UK public-sector tender notices from the Cabinet Office's Find a Tender Service OCDS API (Procurement Act 2023 and older-regime notices).",
  coverage: coverageStatement,
  coverageSummary,
  homepage: "https://www.find-tender.service.gov.uk/",
  licence: "Open Government Licence v3.0",
  licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  attribution: "Contains public sector information licensed under the Open Government Licence v3.0 (Find a Tender Service, Cabinet Office).",
  allowHosts: [HOST],
  cacheTtlMs: 30 * 60_000,
  storagePolicy: "OGL v3.0: may be stored, adapted and redistributed with attribution. Exports include the attribution line.",
  available: () => (process.env.OPP_LIVE_FIND_A_TENDER === "off" ? { ok: false, reason: "Switched off by OPP_LIVE_FIND_A_TENDER=off" } : { ok: true }),
  search: async (_q, io) => {
    const warnings: string[] = [];
    // Newest release per contracting process, whatever its type.
    const newest = new Map<string, ReleaseT>();
    let url: string | undefined = firstUrl(io.now);
    let pages = 0;
    let read = 0;
    let invalid = 0;
    let allCached = true;
    const limit = maxPages();
    while (url && pages < limit) {
      const cacheKey = `opp:fts:v2:${url}`;
      let body = await io.cache.get(cacheKey, 30 * 60_000);
      if (!body) {
        allCached = false;
        body = await io.getJson(url);
        await io.cache.set(cacheKey, body);
      }
      const pkg = Package.safeParse(body);
      if (!pkg.success) throw new ProviderError("Find a Tender sent data in an unexpected format.");
      for (const raw of pkg.data.releases) {
        read++;
        const r = Release.safeParse(raw);
        if (!r.success) {
          invalid++;
          continue;
        }
        const prev = newest.get(r.data.ocid);
        if (!prev || (r.data.date ?? "") > (prev.date ?? "")) newest.set(r.data.ocid, r.data);
      }
      pages++;
      const next = pkg.data.links?.next ?? undefined;
      url = next && next.startsWith(`https://${HOST}/`) ? next : undefined;
    }
    const tenders = [...newest.values()].filter((r) => (r.tag ?? []).some((t) => TENDER_TAGS.has(t)));
    const movedOn = [...newest.values()].length - tenders.length;
    const capped = !!url;
    if (capped)
      warnings.push(
        `Stopped after ${read.toLocaleString("en-GB")} releases (${pages} pages, the per-search limit) — older notices in the ${lookbackDays()}-day window weren't read, so results are incomplete.`,
      );
    if (invalid) warnings.push(`${invalid} release${invalid > 1 ? "s" : ""} had an unexpected format and were skipped.`);
    const coverage = `Read ${read.toLocaleString("en-GB")} releases updated since ${windowStart(io.now).replace("T", " ").slice(0, 16)} UTC${capped ? " (stopped at the page limit)" : " (the whole window)"}; ${tenders.length} were open-stage tender notices, ${movedOn} processes were at another stage (planning, award or contract) and were left out.`;
    return { items: tenders.map((r) => normalizeRelease(r, io.now)), warnings, cached: allCached, coverage };
  },
};
