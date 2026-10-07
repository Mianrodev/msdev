/**
 * Read-only access to public company job boards (Lever, Greenhouse, Ashby,
 * Workable, Recruitee, SmartRecruiters). These are the official, free, public feeds each board publishes
 * for its customers' careers pages — no account or key needed.
 *
 * This is the ONLY module allowed to make network requests (see
 * eslint.config.mjs). It only ever GETs public job listings from the hosts
 * below; it never submits, posts or contacts anything.
 */
import { workRestriction } from "./restrictions";

export type Provider = "lever" | "greenhouse" | "ashby" | "workable" | "recruitee" | "smartrecruiters";

export const PROVIDER_NAMES: Record<Provider, string> = {
  lever: "Lever",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  workable: "Workable",
  recruitee: "Recruitee",
  smartrecruiters: "SmartRecruiters",
};

export interface BoardRef {
  provider: Provider;
  /** The company's board name on that provider, e.g. "drivetrain". */
  slug: string;
  /** Lever and Greenhouse run separate EU instances. */
  region?: "eu";
}

export interface Posting {
  id: string;
  title: string;
  url: string;
  location: string | null;
  /** remote / hybrid / onsite, or null when the board doesn't say. Never guessed. */
  workplace: "remote" | "hybrid" | "onsite" | null;
  employment: string | null;
  compensation: string | null;
  postedAt: string | null;
  /** Plain-text start of the description, for review without opening the listing. */
  summary: string | null;
  /** A "who can apply" limit found in the FULL description (e.g. "only open to candidates in the US").
   *  null = read, none found; missing = not read yet (boards whose list has no descriptions). */
  onlyFor?: string | null;
}

export type BoardResult = { ok: true; company: string | null; postings: Posting[] } | { ok: false; error: string };

/** What a job board's answer means, in plain words. */
export function boardError(status: number): string {
  if (status === 404 || status === 410) return "this job board no longer exists at this address";
  if (status === 429) return "the job board asked us to slow down — tried again next time";
  if (status >= 500) return "the job board had a problem — tried again next time";
  return `the job board answered ${status}`;
}
export const BOARD_GONE = /no longer exists/;

export const boardKey = (b: BoardRef) => `${b.provider}:${b.region ?? ""}:${b.slug.toLowerCase()}`;
export const postingKey = (b: BoardRef, postingId: string) => `${boardKey(b)}:${postingId.toLowerCase()}`;

/** Recognise a job-board link. Returns the board, and the posting id when the link points at one job. */
export function detectBoard(link: string | null | undefined): (BoardRef & { postingId?: string }) | null {
  if (!link) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const parts = u.pathname
    .split("/")
    .filter(Boolean)
    .map((p) => {
      // A stray "%" (e.g. "/100%-remote") can't be decoded; keep it as typed rather than fail.
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  const [a, b, c] = parts;
  if (!a && !host.endsWith(".recruitee.com")) return null;

  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    return { provider: "lever", slug: a, region: host.includes(".eu.") ? "eu" : undefined, postingId: isUuid(b) ? b : undefined };
  }
  if (/^(job-boards|boards)(\.eu)?\.greenhouse\.io$/.test(host)) {
    // .../{slug}/jobs/{id}
    return {
      provider: "greenhouse",
      slug: a,
      region: host.includes(".eu.") ? "eu" : undefined,
      postingId: b === "jobs" && /^\d+$/.test(c ?? "") ? c : undefined,
    };
  }
  if (host === "jobs.ashbyhq.com") {
    return { provider: "ashby", slug: a, postingId: isUuid(b) ? b : undefined };
  }
  if (host.endsWith(".recruitee.com") && host.split(".").length === 3) {
    // {slug}.recruitee.com/o/{job}
    const slug = host.split(".")[0];
    if (slug === "www" || slug === "app") return null;
    return { provider: "recruitee", slug, postingId: a === "o" && b ? b : undefined };
  }
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    // {Company}/{id}-{title}
    if (a === "oneclick-ui" || a === "sr-jobs") return null;
    return { provider: "smartrecruiters", slug: a, postingId: /^\d+/.exec(b ?? "")?.[0] };
  }
  if (host === "apply.workable.com") {
    if (a === "api" || a === "j") return null;
    return { provider: "workable", slug: a, postingId: b === "j" && c ? c : undefined };
  }
  return null;
}

/** The careers-page address for a board (the form detectBoard recognises). */
export function boardLink(b: BoardRef): string {
  const slug = encodeURIComponent(b.slug);
  switch (b.provider) {
    case "lever":
      return `https://jobs${b.region === "eu" ? ".eu" : ""}.lever.co/${slug}`;
    case "greenhouse":
      return `https://job-boards${b.region === "eu" ? ".eu" : ""}.greenhouse.io/${slug}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${slug}`;
    case "workable":
      return `https://apply.workable.com/${slug}/`;
    case "recruitee":
      return `https://${b.slug}.recruitee.com/`;
    case "smartrecruiters":
      return `https://jobs.smartrecruiters.com/${slug}`;
  }
}

/**
 * Where a company's own careers board might be, from its name: the boards to try, most likely first.
 * Only ever used together with a check that the job is really listed there.
 */
export function candidateBoards(company: string, hints: string[] = [], { workable = false } = {}): BoardRef[] {
  const words = company
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|company|plc|pvt|private|bv|sa|ag|the)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];
  const slugs = [
    ...new Set([
      ...hints.map((h) => h.toLowerCase()).filter((h) => /^[a-z0-9-]{2,60}$/.test(h)),
      words.join(""),
      words.join("-"),
    ]),
  ].slice(0, 3);
  const out: BoardRef[] = [];
  // A job found on Workable's search is on the company's Workable page, so look there first.
  if (workable) for (const slug of slugs) out.push({ provider: "workable", slug });
  for (const provider of ["greenhouse", "lever", "ashby", "recruitee"] as const)
    for (const slug of slugs) out.push({ provider, slug });
  out.push({ provider: "smartrecruiters", slug: words.join("") });
  return out;
}

function isUuid(s: string | undefined): s is string {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Enough for any whole job description (only used to look for "who can apply" limits, never stored). */
const FULL = 200_000;

const plain = (html: string | null | undefined, max = 4000): string | null => {
  if (!html) return null;
  const t = html
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return t ? (t.length > max ? `${t.slice(0, max).trimEnd()}…` : t) : null;
};

function normWorkplace(v: unknown): Posting["workplace"] {
  const s = String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (s === "remote") return "remote";
  if (s === "hybrid") return "hybrid";
  if (s === "onsite" || s === "inoffice" || s === "office") return "onsite";
  return null;
}

const iso = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export type Fetcher = (url: string) => Promise<{ status: number; json: () => Promise<unknown>; text?: () => Promise<string> }>;

/** The most one answer may be (the biggest real job board list seen is ~16 MB). */
const MAX_BODY = 40 * 1024 * 1024;

export const defaultFetcher: Fetcher = countingFetcher().fetcher;

/** A fetcher that also adds up how much it downloaded (so each search can say what it used). */
export function countingFetcher(inner?: Fetcher): { fetcher: Fetcher; bytes: () => number } {
  let bytes = 0;
  const fetcher: Fetcher = async (url) => {
    if (inner) {
      const r = await inner(url);
      return r;
    }
    const res = await fetch(url, {
      headers: {
        accept: "application/json, application/rss+xml;q=0.9",
        "user-agent": "ProspectCRM/1.0 (reads public job listings)",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      redirect: "manual", // a page that moved elsewhere is not followed (its new address could be anywhere)
    });
    // Read once (never more than MAX_BODY), count it, then hand it out as JSON or text.
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY) {
      await res.body?.cancel();
      return { status: 413, json: async () => ({}), text: async () => "" };
    }
    const body = res.status === 200 ? (await res.text()).slice(0, MAX_BODY) : (await res.body?.cancel(), "");
    bytes += body.length;
    return { status: res.status, json: async () => JSON.parse(body) as unknown, text: async () => body };
  };
  return { fetcher, bytes: () => bytes };
}

/**
 * The start of one job's description, for boards whose list leaves it out (Greenhouse, SmartRecruiters).
 * One small request per job — used only for jobs actually being added.
 */
/** One job's description, for boards whose list leaves it out, plus any "who can apply" limit in it
 *  (for Greenhouse, the application form's questions too, e.g. "Are you legally authorized to work in the US?"). */
export async function fetchPostingSummary(
  board: BoardRef,
  postingId: string,
  fetcher: Fetcher = defaultFetcher,
): Promise<{ summary: string | null; onlyFor: string | null } | null> {
  const slug = encodeURIComponent(board.slug);
  const id = encodeURIComponent(postingId);
  try {
    if (board.provider === "greenhouse") {
      const base = board.region === "eu" ? "https://boards-api.eu.greenhouse.io" : "https://boards-api.greenhouse.io";
      const res = await fetcher(`${base}/v1/boards/${slug}/jobs/${id}?questions=true`);
      if (res.status !== 200) return null;
      const r = (await res.json()) as { content?: string; questions?: { label?: string }[] };
      const html =
        typeof r.content === "string"
          ? r.content
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&")
          : null;
      const questions = (r.questions ?? []).map((q) => q.label ?? "").join(". ");
      return { summary: plain(html), onlyFor: workRestriction(`${plain(html, FULL) ?? ""}\n${questions}`) };
    }
    if (board.provider === "smartrecruiters") {
      const res = await fetcher(`https://api.smartrecruiters.com/v1/companies/${slug}/postings/${id}`);
      if (res.status !== 200) return null;
      const r = (await res.json()) as { jobAd?: { sections?: Record<string, { text?: string }> } };
      const sec = r.jobAd?.sections ?? {};
      const html = [
        sec.companyDescription?.text,
        sec.jobDescription?.text,
        sec.qualifications?.text,
        sec.additionalInformation?.text,
      ]
        .filter(Boolean)
        .join("<p>");
      return { summary: plain(html), onlyFor: workRestriction(plain(html, FULL)) };
    }
    if (board.provider === "lever") {
      const host = board.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
      const res = await fetcher(`${host}/v0/postings/${slug}/${id}`);
      if (res.status !== 200) return null;
      const r = (await res.json()) as {
        descriptionPlain?: string;
        additionalPlain?: string;
        lists?: { text?: string; content?: string }[];
      };
      const full = [
        r.descriptionPlain,
        ...(r.lists ?? []).map((l) => `${l.text ?? ""}\n${plain(l.content, FULL) ?? ""}`),
        r.additionalPlain,
      ]
        .filter(Boolean)
        .join("\n");
      return { summary: full.slice(0, 1500) || null, onlyFor: workRestriction(full) };
    }
    // Other boards publish descriptions only in their full list: read it and find this job.
    const all = await fetchBoard(board, fetcher);
    if (all.ok) {
      const p = all.postings.find((x) => x.id === postingId);
      if (p && (p.summary || p.onlyFor !== undefined)) return { summary: p.summary, onlyFor: p.onlyFor ?? null };
    }
  } catch {
    // no description is fine — the listing link still works
  }
  return null;
}

/** HTML to readable plain text (shared with the remote-job site reader). */
export const plainText = (html: string | null | undefined, max = 1500) => plain(html, max);

/** Fetch every open job on one company's board. Failures are returned, never thrown. */
export async function fetchBoard(board: BoardRef, fetcher: Fetcher = defaultFetcher): Promise<BoardResult> {
  const slug = encodeURIComponent(board.slug);
  try {
    switch (board.provider) {
      case "lever": {
        const base = board.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
        const res = await fetcher(`${base}/v0/postings/${slug}?mode=json`);
        if (res.status !== 200) return { ok: false, error: boardError(res.status) };
        const rows = (await res.json()) as Record<string, unknown>[];
        if (!Array.isArray(rows)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          company: null,
          postings: rows.map((r) => {
            const cat = (r.categories ?? {}) as Record<string, unknown>;
            const sal = r.salaryRange as { min?: number; max?: number; currency?: string; interval?: string } | undefined;
            return {
              id: String(r.id),
              title: String(r.text ?? "").trim(),
              url: String(r.hostedUrl ?? ""),
              location:
                (Array.isArray(cat.allLocations) && cat.allLocations.length
                  ? cat.allLocations.join(" / ")
                  : (cat.location as string)) ?? null,
              workplace: normWorkplace(r.workplaceType),
              employment: (cat.commitment as string) ?? null,
              compensation: sal?.min ? `${sal.currency ?? ""} ${sal.min}–${sal.max ?? ""} ${sal.interval ?? ""}`.trim() : null,
              postedAt: iso(r.createdAt),
              summary: plain((r.descriptionPlain as string) ?? (r.description as string)),
              onlyFor: workRestriction(
                plain(
                  [
                    r.description,
                    ...(Array.isArray(r.lists)
                      ? (r.lists as { text?: string; content?: string }[]).flatMap((l) => [l.text, l.content])
                      : []),
                    r.additional,
                  ]
                    .filter((x): x is string => typeof x === "string")
                    .join("<p>"),
                  FULL,
                ),
              ),
            };
          }),
        };
      }
      case "greenhouse": {
        const base = board.region === "eu" ? "https://boards-api.eu.greenhouse.io" : "https://boards-api.greenhouse.io";
        // The list without descriptions is ~100x smaller; descriptions are fetched only for jobs being added.
        const res = await fetcher(`${base}/v1/boards/${slug}/jobs`);
        if (res.status !== 200) return { ok: false, error: boardError(res.status) };
        const body = (await res.json()) as { jobs?: Record<string, unknown>[] };
        if (!Array.isArray(body.jobs)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          company: (body.jobs[0]?.company_name as string) ?? null,
          postings: body.jobs.map((r) => {
            const loc = ((r.location as { name?: string }) ?? {}).name ?? null;
            // Greenhouse has no workplace field; only an explicit word in the location counts.
            const wp = loc && /\bremote\b/i.test(loc) ? "remote" : loc && /\bhybrid\b/i.test(loc) ? "hybrid" : null;
            const content =
              typeof r.content === "string"
                ? r.content
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, "&")
                : null;
            return {
              id: String(r.id),
              title: String(r.title ?? "").trim(),
              url: String(r.absolute_url ?? ""),
              location: loc,
              workplace: wp,
              employment: null,
              compensation: null,
              postedAt: iso(r.first_published ?? r.updated_at),
              summary: plain(content),
              ...(content ? { onlyFor: workRestriction(plain(content, FULL)) } : {}),
            };
          }),
        };
      }
      case "ashby": {
        const res = await fetcher(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
        if (res.status !== 200) return { ok: false, error: boardError(res.status) };
        const body = (await res.json()) as { jobs?: Record<string, unknown>[] };
        if (!Array.isArray(body.jobs)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          company: null,
          postings: body.jobs
            .filter((r) => r.isListed !== false)
            .map((r) => {
              const sec = Array.isArray(r.secondaryLocations)
                ? (r.secondaryLocations as { location?: string }[]).map((s) => s.location).filter(Boolean)
                : [];
              const comp = (r.compensation as { compensationTierSummary?: string } | undefined)?.compensationTierSummary ?? null;
              return {
                id: String(r.id),
                title: String(r.title ?? "").trim(),
                url: String(r.jobUrl ?? ""),
                location: [r.location, ...sec].filter(Boolean).join(" / ") || null,
                workplace: normWorkplace(r.workplaceType) ?? (r.isRemote === true ? "remote" : null),
                employment: (r.employmentType as string) ?? null,
                compensation: comp,
                postedAt: iso(r.publishedAt),
                summary: plain((r.descriptionPlain as string) ?? (r.descriptionHtml as string)),
                onlyFor: workRestriction(plain((r.descriptionHtml as string) ?? (r.descriptionPlain as string), FULL)),
              };
            }),
        };
      }
      case "recruitee": {
        const res = await fetcher(`https://${slug}.recruitee.com/api/offers/`);
        if (res.status !== 200) return { ok: false, error: boardError(res.status) };
        const body = (await res.json()) as { offers?: Record<string, unknown>[] };
        if (!Array.isArray(body.offers)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          company: (body.offers[0]?.company_name as string) ?? null,
          postings: body.offers
            .filter((r) => r.status === undefined || r.status === "published")
            .map((r) => ({
              id: String(r.slug ?? r.id),
              title: String(r.title ?? "").trim(),
              url: String(r.careers_url ?? `https://${board.slug}.recruitee.com/o/${String(r.slug ?? "")}`),
              location: (r.location as string) || [r.city, r.country].filter(Boolean).join(", ") || null,
              workplace: r.remote === true ? "remote" : r.hybrid === true ? "hybrid" : r.on_site === true ? "onsite" : null,
              employment: (r.employment_type_code as string)?.replace(/_/g, " ") ?? null,
              compensation: null,
              postedAt: iso(typeof r.published_at === "string" ? r.published_at.replace(" UTC", "Z").replace(" ", "T") : null),
              summary: plain(r.description as string),
              onlyFor: workRestriction(
                plain([r.description, r.requirements].filter((x) => typeof x === "string").join("<p>"), FULL),
              ),
            })),
        };
      }
      case "smartrecruiters": {
        const postings: Posting[] = [];
        let company: string | null = null;
        for (let offset = 0; offset < 1000; offset += 100) {
          const res = await fetcher(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${offset}`);
          if (res.status !== 200) return { ok: false, error: boardError(res.status) };
          const body = (await res.json()) as { totalFound?: number; content?: Record<string, unknown>[] };
          if (!Array.isArray(body.content)) return { ok: false, error: "unexpected response" };
          for (const r of body.content) {
            const loc = (r.location ?? {}) as { fullLocation?: string; remote?: boolean; hybrid?: boolean };
            company ??= ((r.company ?? {}) as { name?: string }).name ?? null;
            postings.push({
              id: String(r.id),
              title: String(r.name ?? "").trim(),
              url: `https://jobs.smartrecruiters.com/${slug}/${String(r.id)}`,
              location: loc.fullLocation ?? null,
              // SmartRecruiters states it explicitly: remote, hybrid, or neither (on-site).
              workplace: loc.remote === true ? "remote" : loc.hybrid === true ? "hybrid" : loc.remote === false ? "onsite" : null,
              employment: ((r.typeOfEmployment ?? {}) as { label?: string }).label ?? null,
              compensation: null,
              postedAt: iso(r.releasedDate),
              summary: null,
            });
          }
          if (body.content.length < 100 || postings.length >= (body.totalFound ?? 0)) break;
        }
        return { ok: true, company, postings };
      }
      case "workable": {
        const res = await fetcher(`https://apply.workable.com/api/v1/widget/accounts/${slug}`);
        if (res.status !== 200) return { ok: false, error: boardError(res.status) };
        const body = (await res.json()) as { name?: string; jobs?: Record<string, unknown>[] };
        if (!Array.isArray(body.jobs)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          company: body.name ?? null,
          postings: body.jobs.map((r) => {
            const loc = [r.city, r.state, r.country].filter(Boolean).join(", ") || null;
            return {
              id: String(r.shortcode ?? r.id),
              title: String(r.title ?? "").trim(),
              url: String(r.url ?? r.shortlink ?? ""),
              location: loc,
              workplace: r.telecommuting === true ? "remote" : null,
              employment: (r.employment_type as string) ?? null,
              compensation: null,
              postedAt: iso(r.published_on ?? r.created_at),
              summary: plain(r.description as string),
              onlyFor: workRestriction(
                plain([r.description, r.requirements, r.benefits].filter((x) => typeof x === "string").join("<p>"), FULL),
              ),
            };
          }),
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort|timeout/i.test(msg) ? "board took too long to answer" : "couldn't reach the board" };
  }
}
