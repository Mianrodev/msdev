/**
 * Read-only access to the free public feeds of remote-job sites (Remotive,
 * Himalayas, Jobicy, RemoteOK, Working Nomads, We Work Remotely).
 *
 * These sites are used to DISCOVER companies, never as proof a job is real:
 * a listing only counts once the same job is found on the company's own
 * careers board (see services/discovery.ts). Requests go through the fetcher
 * in job-boards.ts, the one module allowed to go online.
 */
import { defaultFetcher, plainText, type Fetcher } from "./job-boards";

export type Site = "remotive" | "himalayas" | "jobicy" | "remoteok" | "workingnomads" | "weworkremotely";

export const SITES: Record<Site, { name: string; home: string }> = {
  remotive: { name: "Remotive", home: "https://remotive.com" },
  himalayas: { name: "Himalayas", home: "https://himalayas.app" },
  jobicy: { name: "Jobicy", home: "https://jobicy.com" },
  remoteok: { name: "RemoteOK", home: "https://remoteok.com" },
  workingnomads: { name: "Working Nomads", home: "https://www.workingnomads.com" },
  weworkremotely: { name: "We Work Remotely", home: "https://weworkremotely.com" },
};

export interface Listing {
  site: Site;
  company: string;
  title: string;
  location: string | null;
  /** The listing on the job site (not the company). */
  url: string;
  postedAt: string | null;
  /** Plain-text start of the description, used only for the warning-sign check. */
  summary: string | null;
  /** The site's own short name for the company, a hint for finding its careers board. */
  companyHint?: string;
}

export type SiteResult = { ok: true; listings: Listing[] } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const day = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const listing = (l: Listing | null): l is Listing => !!l && !!l.company && !!l.title && !!l.url;

async function json(fetcher: Fetcher, url: string): Promise<unknown> {
  const res = await fetcher(url);
  if (res.status !== 200) throw new Error(`site answered ${res.status}`);
  return res.json();
}

/**
 * Read one site's current remote jobs. `searchWords` narrows sites that support searching (Himalayas);
 * `country` asks Himalayas for jobs open to that country. Failures are returned, never thrown.
 */
export async function fetchSite(
  site: Site,
  { searchWords = [], country }: { searchWords?: string[]; country?: string } = {},
  fetcher: Fetcher = defaultFetcher,
): Promise<SiteResult> {
  try {
    switch (site) {
      case "remotive": {
        const d = (await json(fetcher, "https://remotive.com/api/remote-jobs")) as { jobs?: Record<string, unknown>[] };
        return {
          ok: true,
          listings: (d.jobs ?? [])
            .map((r) => ({
              site,
              company: str(r.company_name),
              title: str(r.title),
              location: str(r.candidate_required_location) || null,
              url: str(r.url),
              postedAt: day(r.publication_date),
              summary: plainText(str(r.description), 1500),
            }))
            .filter(listing),
        };
      }
      case "himalayas": {
        const out: Listing[] = [];
        const seen = new Set<string>();
        for (const word of searchWords.slice(0, 12)) {
          for (let offset = 0; offset < 60; offset += 20) {
            const q = new URLSearchParams({ q: word, offset: String(offset) });
            if (country) q.set("country", country);
            const d = (await json(fetcher, `https://himalayas.app/jobs/api/search?${q}`)) as { jobs?: Record<string, unknown>[] };
            const jobs = d.jobs ?? [];
            for (const r of jobs) {
              const url = str(r.applicationLink) || str(r.guid);
              if (!url || seen.has(url)) continue;
              seen.add(url);
              const where = Array.isArray(r.locationRestrictions) ? (r.locationRestrictions as unknown[]).map(String).join(", ") : "";
              out.push({
                site,
                company: str(r.companyName),
                title: str(r.title),
                location: where || null,
                url,
                postedAt: day(r.pubDate),
                summary: plainText(str(r.description) || str(r.excerpt), 1500),
                companyHint: str(r.companySlug) || undefined,
              });
            }
            if (jobs.length < 20) break;
          }
        }
        return { ok: true, listings: out.filter(listing) };
      }
      case "jobicy": {
        const out: Listing[] = [];
        for (const url of ["https://jobicy.com/api/v2/remote-jobs?count=100", "https://jobicy.com/api/v2/remote-jobs?count=100&geo=apac"]) {
          const d = (await json(fetcher, url)) as { jobs?: Record<string, unknown>[] };
          for (const r of d.jobs ?? [])
            out.push({
              site,
              company: str(r.companyName),
              title: str(r.jobTitle),
              location: str(r.jobGeo) || null,
              url: str(r.url),
              postedAt: day(r.pubDate),
              summary: plainText(str(r.jobDescription) || str(r.jobExcerpt), 1500),
            });
        }
        return { ok: true, listings: out.filter(listing) };
      }
      case "remoteok": {
        const d = (await json(fetcher, "https://remoteok.com/api")) as Record<string, unknown>[];
        if (!Array.isArray(d)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          listings: d
            .filter((r) => r && r.position)
            .map((r) => ({
              site,
              company: str(r.company),
              title: str(r.position),
              location: str(r.location) || null,
              url: str(r.url),
              postedAt: day(r.date ?? r.epoch),
              summary: plainText(str(r.description), 1500),
            }))
            .filter(listing),
        };
      }
      case "workingnomads": {
        const d = (await json(fetcher, "https://www.workingnomads.com/api/exposed_jobs/")) as Record<string, unknown>[];
        if (!Array.isArray(d)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          listings: d
            .map((r) => ({
              site,
              company: str(r.company_name),
              title: str(r.title),
              location: str(r.location) || null,
              url: str(r.url),
              postedAt: day(r.pub_date),
              summary: plainText(str(r.description), 1500),
            }))
            .filter(listing),
        };
      }
      case "weworkremotely": {
        const res = await fetcher("https://weworkremotely.com/remote-jobs.rss");
        if (res.status !== 200 || !res.text) return { ok: false, error: `site answered ${res.status}` };
        const xml = await res.text();
        const tag = (item: string, name: string) => {
          const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item);
          return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
        };
        const decode = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
        const listings = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
          // Titles read "Company: Job title".
          const full = decode(tag(item, "title"));
          const i = full.indexOf(": ");
          return {
            site,
            company: i > 0 ? full.slice(0, i).trim() : "",
            title: i > 0 ? full.slice(i + 2).trim() : full,
            location: decode(tag(item, "region")) || null,
            url: tag(item, "link"),
            postedAt: day(tag(item, "pubDate")),
            summary: plainText(decode(tag(item, "description")), 1500),
          };
        });
        return { ok: true, listings: listings.filter(listing) };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort|timeout/i.test(msg) ? "site took too long to answer" : /answered/.test(msg) ? msg : "couldn't reach the site" };
  }
}

/** Common signs of a fake job. Any hit keeps a listing out, whatever else it says. */
const WARNING_SIGNS: [RegExp, string][] = [
  [/\b(whats\s?app|telegram|signal app|wechat)\b/i, "asks you to talk on a messaging app"],
  [/\b(registration|training|application|processing|security|starter[- ]kit)\s+(fee|deposit|charges?)\b/i, "asks you to pay a fee"],
  [/\b(pay|send|deposit|transfer)\s+(us|a|the)?\s*(fee|money|deposit|payment)\b/i, "asks you to pay"],
  [/\b(crypto(currency)?|bitcoin|usdt|forex trading)\b.{0,40}\b(pay|salary|paid|earn)/i, "pays in crypto"],
  [/\b(no interview|hired instantly|instant hire|guaranteed (job|income|placement))\b/i, "promises a job without an interview"],
  [/\bearn\s+(\$|₹|rs\.?\s?)?\d[\d,]*\s*(per|a|\/)\s*(day|hour)\b.{0,40}\b(from home|easy|no experience)/i, "promises easy money"],
  [/\b(check|cheque)\b.{0,40}\b(deposit|equipment|purchase)/i, "sends a cheque to buy equipment"],
];

export function warningSigns(text: string): string[] {
  return WARNING_SIGNS.filter(([re]) => re.test(text)).map(([, why]) => why);
}
