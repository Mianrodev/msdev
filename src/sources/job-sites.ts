/**
 * Read-only access to the free public feeds of remote-job sites (Remotive,
 * Himalayas, Workable's job search, Remote Rocketship, Jobicy, RemoteOK,
 * Working Nomads, We Work Remotely). Workable is used by companies in every
 * industry, not just tech; Remote Rocketship gives each job's own apply link.
 *
 * These sites are used to DISCOVER companies, never as proof a job is real:
 * a listing only counts once the same job is found on the company's own
 * careers board (see services/discovery.ts). Requests go through the fetcher
 * in job-boards.ts, the one module allowed to go online.
 */
import { defaultFetcher, plainText, type Fetcher } from "./job-boards";
import { workRestriction } from "./restrictions";

export type Site =
  | "remotive"
  | "himalayas"
  | "workable"
  | "remoterocketship"
  | "jobicy"
  | "remoteok"
  | "workingnomads"
  | "weworkremotely";

export const SITES: Record<Site, { name: string; home: string }> = {
  remotive: { name: "Remotive", home: "https://remotive.com" },
  himalayas: { name: "Himalayas", home: "https://himalayas.app" },
  workable: { name: "Workable job search", home: "https://jobs.workable.com" },
  remoterocketship: { name: "Remote Rocketship", home: "https://www.remoterocketship.com" },
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
  /** Where the site says to apply: usually the company's own careers system. */
  applyUrl?: string;
}

/** `partial`: the site asked us to slow down or time ran out, so this list is incomplete (not kept as a copy). */
export type SiteResult = { ok: true; listings: Listing[]; partial?: boolean } | { ok: false; error: string };

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
        let open: { word: string; cursor?: string }[] = searchWords.map((word) => ({ word }));
        let busy = false;
        let late = false;
        for (let page = 0; page < 5 && open.length && !busy; page++) {
          const more: typeof open = [];
          for (const { word, cursor } of open) {
            if (Date.now() > deadline) {
              late = true;
              break; // keep what's found so far
            }
            // Pages follow the site's cursor (its offset parameter is being retired).
            const q = new URLSearchParams({ q: word });
            if (cursor) q.set("cursor", cursor);
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
            const d = (await res.json()) as { jobs?: Record<string, unknown>[]; nextCursor?: string };
            const jobs = d.jobs ?? [];
            for (const r of jobs) {
              const url = str(r.applicationLink) || str(r.guid);
              if (!url || seen.has(url)) continue;
              seen.add(url);
              const where = Array.isArray(r.locationRestrictions)
                ? (r.locationRestrictions as unknown[]).map(String).join(", ")
                : "";
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
            if (jobs.length === 20 && d.nextCursor) more.push({ word, cursor: d.nextCursor });
          }
          open = more;
        }
        return { ok: true, listings: out.filter(listing), partial: busy || late };
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
        let late = false;
        for (let page = 0; page < 10 && open.length && !busy; page++) {
          const more: Search[] = [];
          for (const search of open) {
            if (Date.now() > deadline) {
              late = true;
              break; // keep what's found so far
            }
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
              const places = (Array.isArray(r.locations) ? (r.locations as unknown[]).map(String) : []).filter(
                (l) => l && l !== "TELECOMMUTE",
              );
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
        const listings = [...found.values()].map(({ places, ...l }) => ({
          ...l,
          location: places.size ? `Remote — ${[...places].join("; ")}` : "Remote",
        }));
        return { ok: true, listings: listings.filter(listing), partial: busy || late };
      }
      case "remoterocketship": {
        // One public page per kind of job, for remote jobs open to your country (20 newest each).
        // Each job names where to apply, which is usually the company's own careers system.
        if (!country) return { ok: true, listings: [] };
        const place = country.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const out: Listing[] = [];
        const seen = new Set<string>();
        const slugs = [
          ...new Set(
            searchWords.map((w) =>
              w
                .toLowerCase()
                .replace(/&/g, "and")
                .replace(/['’]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, ""),
            ),
          ),
        ];
        let partial = false;
        for (const slug of slugs.filter((x) => x.length > 2)) {
          if (Date.now() > deadline) {
            partial = true;
            break; // keep what's found so far
          }
          const res = await fetcher(`https://www.remoterocketship.com/country/${place}/jobs/${slug}`);
          if (res.status === 429) {
            partial = true;
            break;
          }
          if (res.status !== 200 || !res.text) continue;
          const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(await res.text());
          if (!m) continue;
          let jobs: Record<string, unknown>[] = [];
          try {
            jobs = (JSON.parse(m[1]).props?.pageProps?.initialJobOpenings ?? []) as Record<string, unknown>[];
          } catch {
            continue;
          }
          for (const r of jobs) {
            const co = (r.company ?? {}) as Record<string, unknown>;
            const apply = str(r.url);
            if (!apply || seen.has(apply) || str(r.locationType) !== "remote") continue;
            seen.add(apply);
            out.push({
              site,
              company: str(co.name),
              title: str(r.roleTitle),
              location: `Remote — ${str(r.location) || country}`,
              url:
                str(co.slug) && str(r.slug)
                  ? `https://www.remoterocketship.com/company/${str(co.slug)}/jobs/${str(r.slug)}`
                  : apply,
              postedAt: day(r.created_at),
              summary:
                [
                  str(r.twoLineJobDescriptionSummary),
                  str(r.jobDescriptionSummary),
                  str(r.employmentType) === "contract" ? "Contract role." : "",
                ]
                  .filter(Boolean)
                  .join(" ") || null,
              companyHint: str(co.slug) || undefined,
              applyUrl: apply,
            });
          }
        }
        return { ok: true, listings: out.filter(listing), partial };
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
        const decode = (t: string) =>
          t
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&");
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
    return {
      ok: false,
      error: /abort|timeout/i.test(msg) ? "site took too long to answer" : /answered/.test(msg) ? msg : "couldn't reach the site",
    };
  }
}

/**
 * Common signs of a fake job. Any hit keeps a listing out, whatever else it says. Each sign looks for
 * the scam *behaviour* (being told to pay, or to move to a messaging app), and sentences that warn
 * against it ("we will never ask for a fee") don't count.
 */
const WARNING_SIGNS: [RegExp, string][] = [
  [
    /\b(contact|message|reach|text|chat|apply|connect|add|dm)\b[^.!?\n]{0,40}\b(whats\s?app|telegram|wechat)\b/i,
    "asks you to talk on a messaging app",
  ],
  [/\b(whats\s?app|telegram)\s*(:|number|no\.?|at|@|\+)/i, "asks you to talk on a messaging app"],
  [
    /\b(registration|training|application|processing|security|starter[- ]kit|onboarding)\s+(fee|deposit|charges?)\b/i,
    "asks you to pay a fee",
  ],
  [/\b(pay|send|transfer)\s+(us\s+)?(an?\s+)?(small\s+|one[- ]time\s+|refundable\s+)?(fee|deposit)\b/i, "asks you to pay"],
  [/\b(salary|paid|pay|compensation)\b[^.!?\n]{0,30}\b(crypto(currency)?|bitcoin|usdt)\b/i, "pays in crypto"],
  [
    /\bearn\s+(\$|₹|rs\.?\s?)?\d[\d,]*\s*(per|a|\/)\s*(day|hour)\b[^.!?\n]{0,40}\b(from home|easy|no experience)/i,
    "promises easy money",
  ],
  [/\b(send|mail)\s+you\s+a\s+(cheque|check)\b|\b(cheque|check)\s+(to|for)\s+(buy|purchas)/i, "sends a cheque to buy equipment"],
];
/** Checked in every sentence: these phrases are the warning sign themselves ("no interview needed"). */
const ALWAYS: [RegExp, string][] = [
  [
    /\b(no interviews?( needed| required)?|hired instantly|instant hire|guaranteed (job|income|placement))\b/i,
    "promises a job without an interview",
  ],
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

/**
 * Careers systems companies post their own jobs on (beyond the job boards the app reads in full).
 * A job page on one of these, or on a site whose address carries the company's name, is the company's own.
 */
const CAREERS_HOSTS: [RegExp, string][] = [
  [/(^|\.)myworkdayjobs\.com$|(^|\.)myworkdaysite\.com$/, "Workday"],
  [/(^|\.)bamboohr\.com$/, "BambooHR"],
  [/(^|\.)breezy\.hr$/, "Breezy HR"],
  [/(^|\.)zohorecruit\.(com|in|eu)$/, "Zoho Recruit"],
  [/(^|\.)careers-page\.com$/, "Recruit CRM"],
  [/(^|\.)jobvite\.com$/, "Jobvite"],
  [/(^|\.)icims\.com$/, "iCIMS"],
  [/(^|\.)teamtailor\.com$/, "Teamtailor"],
  [/(^|\.)jobs\.personio\.(de|com)$/, "Personio"],
  [/(^|\.)ats\.rippling\.com$/, "Rippling"],
  [/(^|\.)pinpointhq\.com$/, "Pinpoint"],
  [/(^|\.)app\.dover\.(com|io)$/, "Dover"],
  [/(^|\.)applytojob\.com$/, "JazzHR"],
  [/(^|\.)successfactors\.(com|eu)$/, "SuccessFactors"],
  [/(^|\.)oraclecloud\.com$/, "Oracle"],
  [/(^|\.)taleo\.net$/, "Taleo"],
  [/(^|\.)jobs\.gem\.com$/, "Gem"],
  [/(^|\.)freshteam\.com$/, "Freshteam"],
  [/(^|\.)keka\.com$/, "Keka"],
  [/(^|\.)darwinbox\.(in|com)$/, "Darwinbox"],
  [/(^|\.)recruitee\.com$/, "Recruitee"],
  [/(^|\.)workable\.com$/, "Workable"],
];

export function careersSystem(url: string, company: string): string | null {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.port || u.username) return null;
    host = u.hostname.toLowerCase();
    // Only ordinary public website names (no IP addresses or internal network names).
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) || /\.(internal|local|localhost|lan|home|corp)$/.test(host))
      return null;
  } catch {
    return null;
  }
  for (const [re, name] of CAREERS_HOSTS) if (re.test(host)) return name;
  // The company's own website: its name is in the address ("jobs.gainwelltechnologies.com" for Gainwell).
  const words = company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|company|plc|pvt|private|the|group|technologies|solutions)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  return words.length && words.some((w) => host.split(".").some((part) => part.includes(w))) ? "Company website" : null;
}

/**
 * Open one job's page on the company's own careers system and check it's live with the same title.
 * Answers the title the page shows and any "who can apply" limit in its text, or null (gone, moved,
 * or unreadable).
 */
/** One job read from its own careers page (not a job board): what the checks need. */
export interface JobPage {
  title: string;
  location: string | null;
  /** The whole description as plain text. */
  text: string;
  /** First posted, as the company's own system says (YYYY-MM-DD), or null when the page doesn't say. */
  postedAt: string | null;
  /** The page's own remote flag: true = remote, false = on-site or hybrid, null = not said. */
  remote: boolean | null;
}

const isoDay = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

/**
 * Read a job on the company's own careers page so the same checks can run on it: Workday and BambooHR
 * publish the job as data; other pages are read for their schema.org JobPosting, or as plain text.
 * null = couldn't read it, or the page says the job is closed.
 */
export async function readJobPage(url: string, fetcher: Fetcher = defaultFetcher): Promise<JobPage | null> {
  try {
    const wd =
      /^https:\/\/([a-z0-9-]+)\.(wd\d+\.myworkdayjobs\.com|myworkdaysite\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)\/job\/([^?#]+)/i.exec(url);
    if (wd) {
      const res = await fetcher(`https://${wd[1]}.${wd[2]}/wday/cxs/${wd[1]}/${wd[3]}/job/${wd[4]}`);
      if (res.status !== 200) return null;
      const d = (await res.json()) as {
        jobPostingInfo?: { title?: string; jobDescription?: string; location?: string; startDate?: string; canApply?: boolean; remoteType?: string };
      };
      const i = d.jobPostingInfo;
      if (!i?.title || i.canApply === false) return null;
      const where = [i.location, i.remoteType].filter(Boolean).join(" · ") || null;
      return {
        title: i.title,
        location: where,
        text: plainText(`${i.jobDescription ?? ""}<p>${where ?? ""}`, 200_000) ?? "",
        postedAt: isoDay(i.startDate),
        remote: /remote/i.test(where ?? "") ? true : null,
      };
    }
    const bh = /^https:\/\/([a-z0-9-]+)\.bamboohr\.com\/careers\/(\d+)/i.exec(url);
    if (bh) {
      const res = await fetcher(`https://${bh[1]}.bamboohr.com/careers/${bh[2]}/detail`);
      if (res.status !== 200) return null;
      const d = (await res.json()) as {
        result?: {
          jobOpening?: {
            jobOpeningName?: string;
            jobOpeningStatus?: string;
            description?: string;
            datePosted?: string;
            locationType?: string;
            atsLocation?: Record<string, string | null>;
            location?: Record<string, string | null>;
          };
        };
      };
      const j = d.result?.jobOpening;
      if (!j?.jobOpeningName || (j.jobOpeningStatus && !/open/i.test(j.jobOpeningStatus))) return null;
      const loc = j.atsLocation ?? j.location ?? {};
      // BambooHR: locationType "1" = remote, "2" = hybrid, "0" = on-site.
      const remote = j.locationType === "1" ? true : j.locationType === "0" || j.locationType === "2" ? false : null;
      const where =
        [loc.city, loc.state, loc.country ?? loc.addressCountry].filter(Boolean).join(", ") + (remote ? " (Remote)" : "");
      return {
        title: j.jobOpeningName,
        location: where || null,
        text: plainText(`${j.description ?? ""}<p>${where}`, 200_000) ?? "",
        postedAt: isoDay(j.datePosted),
        remote,
      };
    }
    const res = await fetcher(url);
    if (res.status !== 200 || !res.text) return null;
    const page = (await res.text()).slice(0, 800_000);
    if (
      /\b(no longer (available|accepting|open)|position (has been )?filled|job (posting )?(is )?(closed|expired)|this job (has )?expired)\b/i.test(
        page.slice(0, 200_000),
      )
    )
      return null;
    // schema.org JobPosting, which most careers sites publish for search engines.
    for (const m of page.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      let data: unknown;
      try {
        data = JSON.parse(m[1].trim());
      } catch {
        continue;
      }
      const items = (Array.isArray(data) ? data : [data, ...(((data as { "@graph"?: unknown[] })?.["@graph"]) ?? [])]) as Record<
        string,
        unknown
      >[];
      const jp = items.find((x) => x && String(x["@type"] ?? "").includes("JobPosting"));
      if (!jp || typeof jp.title !== "string") continue;
      const places = ([] as unknown[])
        .concat(jp.jobLocation ?? [])
        .map((l) => {
          const a = ((l as { address?: Record<string, unknown> })?.address ?? {}) as Record<string, unknown>;
          const country = typeof a.addressCountry === "string" ? a.addressCountry : (a.addressCountry as { name?: string })?.name;
          return [a.addressLocality, a.addressRegion, country].filter((x) => typeof x === "string" && x).join(", ");
        })
        .filter(Boolean);
      const allowed = ([] as unknown[])
        .concat(jp.applicantLocationRequirements ?? [])
        .map((l) => (l as { name?: string })?.name)
        .filter(Boolean);
      const remote = /telecommute/i.test(String(jp.jobLocationType ?? "")) ? true : null;
      const where = [...places, ...allowed.map((a) => `Remote: ${a}`)].join(" / ") + (remote && !allowed.length ? " (Remote)" : "");
      return {
        title: jp.title,
        location: where || null,
        text: plainText(`${String(jp.description ?? "")}<p>${where}`, 200_000) ?? "",
        postedAt: isoDay(jp.datePosted),
        remote,
      };
    }
    // No data on the page: its text still answers remote / region / who can apply.
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page)?.[1]?.replace(/\s+/g, " ").trim();
    const text = plainText(page.replace(/<(script|style|nav|header|footer)\b[\s\S]*?<\/\1>/gi, " "), 200_000) ?? "";
    if (!title || text.length < 200) return null;
    return { title, location: null, text, postedAt: null, remote: null };
  } catch {
    return null;
  }
}

export async function postingPageTitle(
  url: string,
  fetcher: Fetcher = defaultFetcher,
): Promise<{ title: string; onlyFor: string | null } | null> {
  try {
    // Workday pages are drawn by a script; the same job is published as JSON next to it.
    const wd =
      /^https:\/\/([a-z0-9-]+)\.(wd\d+\.myworkdayjobs\.com|myworkdaysite\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)\/job\/(.+)$/i.exec(
        url,
      );
    if (wd) {
      const res = await fetcher(`https://${wd[1]}.${wd[2]}/wday/cxs/${wd[1]}/${wd[3]}/job/${wd[4]}`);
      if (res.status !== 200) return null;
      const d = (await res.json()) as { jobPostingInfo?: { title?: string; jobDescription?: string; location?: string } };
      const info = d.jobPostingInfo;
      if (!info?.title) return null;
      const text = plainText(`${info.jobDescription ?? ""}<p>${info.location ?? ""}`, 200_000) ?? "";
      return { title: info.title, onlyFor: workRestriction(text) };
    }
    const res = await fetcher(url);
    if (res.status !== 200 || !res.text) return null;
    const page = (await res.text()).slice(0, 600_000);
    if (
      /\b(no longer (available|accepting|open)|position (has been )?filled|job (posting )?(is )?(closed|expired)|this job (has )?expired)\b/i.test(
        page.slice(0, 200_000),
      )
    )
      return null;
    const decode = (t: string) =>
      t
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    const og =
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(page) ??
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i.exec(page);
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page);
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(page);
    const shown = [og?.[1], title?.[1], h1?.[1]?.replace(/<[^>]+>/g, " ")]
      .map((t) => (t ? decode(t) : ""))
      .filter(Boolean)
      .join(" | ");
    if (!shown) return null;
    const text = decode(page.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
    return { title: shown, onlyFor: workRestriction(text) };
  } catch {
    return null;
  }
}
