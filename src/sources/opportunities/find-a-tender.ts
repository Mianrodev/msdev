/**
 * Live tenders: UK Find a Tender Service (FTS) public OCDS API.
 *
 *   https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?stages=tender
 *
 * Keyless, read-only, published by the Cabinet Office under the Open Government Licence v3.0
 * (reuse and storage allowed with attribution). The API has no keyword search, so the app reads the
 * most recently updated tender notices (bounded number of pages) and filters them locally — the
 * search result says exactly how many notices were checked. Pages are cached for 30 minutes to
 * respect the service's rate limits.
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
const MAX_PAGES = 3;
const LOOKBACK_DAYS = 21;
const ID = "find-a-tender";

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

const Value = z.object({ amount: z.number().optional(), currency: z.string().optional() }).partial();
const Release = z
  .object({
    ocid: z.string(),
    id: z.string(),
    date: z.string().optional(),
    buyer: z.object({ name: z.string().optional() }).partial().optional(),
    parties: z
      .array(
        z
          .object({
            name: z.string().optional(),
            roles: z.array(z.string()).optional(),
            address: z.object({ region: z.string().optional(), locality: z.string().optional(), countryName: z.string().optional() }).partial().optional(),
          })
          .partial(),
      )
      .optional(),
    tender: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.string().optional(),
        mainProcurementCategory: z.string().optional(),
        procurementMethodDetails: z.string().optional(),
        classification: z.object({ id: z.string().optional(), description: z.string().optional() }).partial().optional(),
        items: z
          .array(
            z
              .object({
                additionalClassifications: z.array(z.object({ description: z.string().optional() }).partial()).optional(),
                deliveryAddresses: z.array(z.object({ region: z.string().optional() }).partial()).optional(),
              })
              .partial(),
          )
          .optional(),
        lots: z.array(z.object({ title: z.string().optional(), description: z.string().optional() }).partial()).optional(),
        value: Value.optional(),
        tenderPeriod: z.object({ endDate: z.string().optional() }).partial().optional(),
        enquiryPeriod: z.object({ endDate: z.string().optional() }).partial().optional(),
        submissionMethod: z.array(z.string()).optional(),
        submissionMethodDetails: z.string().optional(),
        eligibilityCriteria: z.string().optional(),
        selectionCriteria: z.object({ criteria: z.array(z.object({ type: z.string().optional(), description: z.string().optional() }).partial()).optional() }).partial().optional(),
        documents: z.array(z.object({ documentType: z.string().optional(), title: z.string().optional(), url: z.string().optional() }).partial()).optional(),
      })
      .partial(),
  })
  .passthrough();
type ReleaseT = z.infer<typeof Release>;

const Package = z.object({ releases: z.array(z.unknown()), links: z.object({ next: z.string().optional() }).partial().optional() }).passthrough();

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
  const money: Money | null =
    typeof t.value?.amount === "number" ? { raw: `${t.value.amount} ${t.value.currency ?? ""}`.trim(), currency: t.value.currency ?? null, min: t.value.amount, max: t.value.amount, qualifier: "exact" } : null;
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
      budget: money ? known(money, ev(money.raw), money.raw, "Estimated value as published (OCDS tender.value) — not a guaranteed amount") : unknown("Budget not published"),
      eligibility: eligibility.length ? known(eligibility, ev(eligibility.join("\n"))) : unknown("Not published in the notice data — read the full notice"),
      requiredDocuments: unknown("Not listed in the notice data — usually in the tender pack"),
      submissionMethod: submission ? known(submission, ev(submission)) : unknown("Not stated"),
      attachments: docs.length ? known(docs.map((d) => d.title ?? d.documentType ?? d.url!), ev(docs.map((d) => d.url).join("\n"), "Notice documents")) : unknown("No documents linked in the notice data"),
    },
  };
}

function firstUrl(now: Date): string {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  from.setUTCMinutes(0, 0, 0); // whole hours keep the cache key stable
  const p = new URLSearchParams({ stages: "tender", limit: String(PAGE_SIZE), updatedFrom: from.toISOString().slice(0, 19) });
  return `${BASE}?${p}`;
}

export const findATender: Provider<TenderQuery> = {
  id: ID,
  name: "Find a Tender (UK)",
  module: "tenders",
  mode: "live",
  description: "UK public-sector tender notices above procurement thresholds, from the Cabinet Office's Find a Tender Service OCDS API.",
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
    const releases = new Map<string, ReleaseT>();
    let url: string | undefined = firstUrl(io.now);
    let pages = 0;
    let invalid = 0;
    let allCached = true;
    while (url && pages < MAX_PAGES) {
      const cacheKey = `opp:fts:${url}`;
      let body = await io.cache.get(cacheKey, 30 * 60_000);
      if (!body) {
        allCached = false;
        body = await io.getJson(url);
        await io.cache.set(cacheKey, body);
      }
      const pkg = Package.safeParse(body);
      if (!pkg.success) throw new ProviderError("Find a Tender sent data in an unexpected format.");
      for (const raw of pkg.data.releases) {
        const r = Release.safeParse(raw);
        if (!r.success) {
          invalid++;
          continue;
        }
        const prev = releases.get(r.data.ocid);
        if (!prev || (r.data.date ?? "") > (prev.date ?? "")) releases.set(r.data.ocid, r.data);
      }
      pages++;
      const next: string | undefined = pkg.data.links?.next;
      url = next && next.startsWith(`https://${HOST}/`) ? next : undefined;
    }
    if (url) warnings.push(`Checked the ${releases.size} most recently updated tender notices (last ${LOOKBACK_DAYS} days, ${pages} pages). Older or later notices weren't read — results may be incomplete.`);
    if (invalid) warnings.push(`${invalid} notice${invalid > 1 ? "s" : ""} had an unexpected format and were skipped.`);
    return { items: [...releases.values()].map((r) => normalizeRelease(r, io.now)), warnings, cached: allCached };
  },
};
