/**
 * Read-only access to the free public feeds of remote-job sites (Remotive,
 * Himalayas, Workable's job search, Jobicy, RemoteOK, Working Nomads, We Work
 * Remotely). Workable is used by companies in every industry, not just tech.
 *
 * These sites are used to DISCOVER companies, never as proof a job is real:
 * a listing only counts once the same job is found on the company's own
 * careers board (see services/discovery.ts). Requests go through the fetcher
 * in job-boards.ts, the one module allowed to go online.
 */
import { defaultFetcher, plainText, type Fetcher } from "./job-boards";

export type Site = "remotive" | "himalayas" | "workable" | "jobicy" | "remoteok" | "workingnomads" | "weworkremotely";

export const SITES: Record<Site, { name: string; home: string }> = {
  remotive: { name: "Remotive", home: "https://remotive.com" },
  himalayas: { name: "Himalayas", home: "https://himalayas.app" },
  workable: { name: "Workable job search", home: "https://jobs.workable.com" },
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
 * Read one site's current remote jobs. `searchWords` narrows sites that support searching (Himalayas,
 * Workable); `country` asks them for jobs open to that country. Failures are returned, never thrown.
 */
export async function fetchSite(
  site: Site,
  { searchWords = [], country, deadline = Infinity }: { searchWords?: string[]; country?: string; deadline?: number } = {},
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
        // Every word, a page at a time: all words get their first page before any word gets its second,
        // so running out of time loses the deepest pages, never whole words. Up to 5 pages (100 jobs) a word.
        const out: Listing[] = [];
        const seen = new Set<string>();
        let open = [...searchWords];
        let busy = false;
        for (let offset = 0; offset < 100 && open.length && !busy; offset += 20) {
          const more: string[] = [];
          for (const word of open) {
            if (Date.now() > deadline) break; // keep what's found so far
            const q = new URLSearchParams({ q: word, offset: String(offset) });
            if (country) q.set("country", country);
            const res = await fetcher(`https://himalayas.app/jobs/api/search?${q}`);
            if (res.status === 429) {
              busy = true; // asked to slow down: keep what's found
              break;
            }
            if (res.status !== 200) {
              if (!out.length) throw new Error(`site answered ${res.status}`);
              continue;
            }
            const d = (await res.json()) as { jobs?: Record<string, unknown>[] };
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
            if (jobs.length === 20) more.push(word);
          }
          open = more;
        }
        return { ok: true, listings: out.filter(listing) };
      }
      case "workable": {
        // Remote jobs open to your country for every word (up to 10 pages each, a page at a time as above),
        // plus the first page worldwide for the first 12 words. A job posted for several countries is one
        // listing, with every place it names.
        const found = new Map<string, Listing & { places: Set<string> }>();
        type Search = { w: string; where?: string; token?: string };
        let open: Search[] = [
          ...searchWords.map((w) => ({ w, where: country })),
          ...(country ? searchWords.slice(0, 12).map((w) => ({ w, where: undefined, token: "" })) : []),
        ];
        let busy = false;
        for (let page = 0; page < 10 && open.length && !busy; page++) {
          const more: Search[] = [];
          for (const search of open) {
            if (Date.now() > deadline) break; // keep what's found so far
            const q = new URLSearchParams({ query: search.w, workplace: "remote" });
            if (search.where) q.set("location", search.where);
            if (search.token) q.set("pageToken", search.token);
            const res = await fetcher(`https://jobs.workable.com/api/v1/jobs?${q}`);
            if (res.status === 429) {
              busy = true; // asked to slow down: keep what's found
              break;
            }
            if (res.status !== 200) continue;
            const d = (await res.json()) as { jobs?: Record<string, unknown>[]; nextPageToken?: string };
            for (const r of d.jobs ?? []) {
              const co = (r.company ?? {}) as Record<string, unknown>;
              const company = str(co.title);
              const title = str(r.title);
              const key = `${company}|${title}`.toLowerCase();
              const places = (Array.isArray(r.locations) ? (r.locations as unknown[]).map(String) : []).filter((l) => l && l !== "TELECOMMUTE");
              const had = found.get(key);
              if (had) {
                places.forEach((l) => had.places.add(l));
                continue;
              }
              let hint: string | undefined;
              try {
                hint = new URL(str(co.website)).hostname.replace(/^www\./, "").split(".")[0] || undefined;
              } catch {}
              found.set(key, {
                site,
                company,
                title,
                location: null,
                url: str(r.url),
                postedAt: day(r.created),
                summary: plainText(str(r.description), 1500),
                companyHint: hint,
                places: new Set(places),
              });
            }
            // Worldwide searches ("" token) stay at one page.
            if (d.nextPageToken && search.token !== "" && (d.jobs ?? []).length) more.push({ ...search, token: d.nextPageToken });
          }
          open = more;
        }
        const listings = [...found.values()].map(({ places, ...l }) => ({ ...l, location: places.size ? `Remote — ${[...places].join("; ")}` : "Remote" }));
        return { ok: true, listings: listings.filter(listing) };
      }
      case "jobicy": {
        const out: Listing[] = [];
        const seen = new Set<string>();
        for (const url of [
          "https://jobicy.com/api/v2/remote-jobs?count=100",
          "https://jobicy.com/api/v2/remote-jobs?count=100&geo=apac",
          "https://jobicy.com/api/v2/remote-jobs?count=100&industry=management",
          "https://jobicy.com/api/v2/remote-jobs?count=100&industry=business",
        ]) {
          const d = (await json(fetcher, url)) as { jobs?: Record<string, unknown>[] };
          for (const r of d.jobs ?? []) {
            if (seen.has(str(r.url))) continue;
            seen.add(str(r.url));
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
        // The main feed only has the newest jobs; the category feeds go further back.
        let xml = "";
        for (const feed of [
          "remote-jobs",
          "categories/remote-management-and-finance-jobs",
          "categories/remote-product-jobs",
          "categories/all-other-remote-jobs",
          "categories/remote-sales-and-marketing-jobs",
        ]) {
          const res = await fetcher(`https://weworkremotely.com/${feed}.rss`);
          if (res.status !== 200 || !res.text) {
            if (feed === "remote-jobs") return { ok: false, error: `site answered ${res.status}` };
            continue;
          }
          xml += await res.text();
        }
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
        const seen = new Set<string>();
        return { ok: true, listings: listings.filter((l) => listing(l) && !seen.has(l.url) && !!seen.add(l.url)) };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort|timeout/i.test(msg) ? "site took too long to answer" : /answered/.test(msg) ? msg : "couldn't reach the site" };
  }
}

/**
 * Common signs of a fake job. Any hit keeps a listing out, whatever else it says. Each sign looks for
 * the scam *behaviour* (being told to pay, or to move to a messaging app), and sentences that warn
 * against it ("we will never ask for a fee") don't count.
 */
const WARNING_SIGNS: [RegExp, string][] = [
  [/\b(contact|message|reach|text|chat|apply|connect|add|dm)\b[^.!?\n]{0,40}\b(whats\s?app|telegram|wechat)\b/i, "asks you to talk on a messaging app"],
  [/\b(whats\s?app|telegram)\s*(:|number|no\.?|at|@|\+)/i, "asks you to talk on a messaging app"],
  [/\b(registration|training|application|processing|security|starter[- ]kit|onboarding)\s+(fee|deposit|charges?)\b/i, "asks you to pay a fee"],
  [/\b(pay|send|transfer)\s+(us\s+)?(an?\s+)?(small\s+|one[- ]time\s+|refundable\s+)?(fee|deposit)\b/i, "asks you to pay"],
  [/\b(salary|paid|pay|compensation)\b[^.!?\n]{0,30}\b(crypto(currency)?|bitcoin|usdt)\b/i, "pays in crypto"],
  [/\bearn\s+(\$|₹|rs\.?\s?)?\d[\d,]*\s*(per|a|\/)\s*(day|hour)\b[^.!?\n]{0,40}\b(from home|easy|no experience)/i, "promises easy money"],
  [/\b(send|mail)\s+you\s+a\s+(cheque|check)\b|\b(cheque|check)\s+(to|for)\s+(buy|purchas)/i, "sends a cheque to buy equipment"],
];
/** Checked in every sentence: these phrases are the warning sign themselves ("no interview needed"). */
const ALWAYS: [RegExp, string][] = [
  [/\b(no interviews?( needed| required)?|hired instantly|instant hire|guaranteed (job|income|placement))\b/i, "promises a job without an interview"],
];
const WARNS_AGAINST = /\b(never|not|no|won't|don't|do not|will not|beware|scams?|fraud(ulent)?)\b/i;

export function warningSigns(text: string): string[] {
  const out = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    for (const [re, why] of ALWAYS) if (re.test(sentence) && !/\b(never|beware|scams?)\b/i.test(sentence)) out.add(why);
    if (WARNS_AGAINST.test(sentence)) continue;
    for (const [re, why] of WARNING_SIGNS) if (re.test(sentence)) out.add(why);
  }
  return [...out];
}
