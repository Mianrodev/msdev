/**
 * Read-only access to public company job boards (Lever, Greenhouse, Ashby,
 * Workable). These are the official, free, public feeds each board publishes
 * for its customers' careers pages — no account or key needed.
 *
 * This is the ONLY module allowed to make network requests (see
 * eslint.config.mjs). It only ever GETs public job listings from the hosts
 * below; it never submits, posts or contacts anything.
 */

export type Provider = "lever" | "greenhouse" | "ashby" | "workable";

export const PROVIDER_NAMES: Record<Provider, string> = {
  lever: "Lever",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  workable: "Workable",
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
}

export type BoardResult = { ok: true; company: string | null; postings: Posting[] } | { ok: false; error: string };

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
  const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  const [a, b, c] = parts;
  if (!a) return null;

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
  if (host === "apply.workable.com") {
    if (a === "api" || a === "j") return null;
    return { provider: "workable", slug: a, postingId: b === "j" && c ? c : undefined };
  }
  return null;
}

function isUuid(s: string | undefined): s is string {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const plain = (html: string | null | undefined, max = 1500): string | null => {
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
  const s = String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
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

export type Fetcher = (url: string) => Promise<{ status: number; json: () => Promise<unknown> }>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "ProspectCRM/1.0 (reads public job listings)" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  return { status: res.status, json: () => res.json() };
};

/** Fetch every open job on one company's board. Failures are returned, never thrown. */
export async function fetchBoard(board: BoardRef, fetcher: Fetcher = defaultFetcher): Promise<BoardResult> {
  const slug = encodeURIComponent(board.slug);
  try {
    switch (board.provider) {
      case "lever": {
        const base = board.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
        const res = await fetcher(`${base}/v0/postings/${slug}?mode=json`);
        if (res.status !== 200) return { ok: false, error: `board answered ${res.status}` };
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
              location: (Array.isArray(cat.allLocations) && cat.allLocations.length ? cat.allLocations.join(" / ") : (cat.location as string)) ?? null,
              workplace: normWorkplace(r.workplaceType),
              employment: (cat.commitment as string) ?? null,
              compensation: sal?.min ? `${sal.currency ?? ""} ${sal.min}–${sal.max ?? ""} ${sal.interval ?? ""}`.trim() : null,
              postedAt: iso(r.createdAt),
              summary: plain((r.descriptionPlain as string) ?? (r.description as string)),
            };
          }),
        };
      }
      case "greenhouse": {
        const base = board.region === "eu" ? "https://boards-api.eu.greenhouse.io" : "https://boards-api.greenhouse.io";
        const res = await fetcher(`${base}/v1/boards/${slug}/jobs?content=true`);
        if (res.status !== 200) return { ok: false, error: `board answered ${res.status}` };
        const body = (await res.json()) as { jobs?: Record<string, unknown>[] };
        if (!Array.isArray(body.jobs)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          company: (body.jobs[0]?.company_name as string) ?? null,
          postings: body.jobs.map((r) => {
            const loc = ((r.location as { name?: string }) ?? {}).name ?? null;
            // Greenhouse has no workplace field; only an explicit word in the location counts.
            const wp = loc && /\bremote\b/i.test(loc) ? "remote" : loc && /\bhybrid\b/i.test(loc) ? "hybrid" : null;
            const content = typeof r.content === "string" ? r.content.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&") : null;
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
            };
          }),
        };
      }
      case "ashby": {
        const res = await fetcher(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
        if (res.status !== 200) return { ok: false, error: `board answered ${res.status}` };
        const body = (await res.json()) as { jobs?: Record<string, unknown>[] };
        if (!Array.isArray(body.jobs)) return { ok: false, error: "unexpected response" };
        return {
          ok: true,
          company: null,
          postings: body.jobs
            .filter((r) => r.isListed !== false)
            .map((r) => {
              const sec = Array.isArray(r.secondaryLocations) ? (r.secondaryLocations as { location?: string }[]).map((s) => s.location).filter(Boolean) : [];
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
              };
            }),
        };
      }
      case "workable": {
        const res = await fetcher(`https://apply.workable.com/api/v1/widget/accounts/${slug}`);
        if (res.status !== 200) return { ok: false, error: res.status === 429 ? "board is busy (rate limited) — will retry next time" : `board answered ${res.status}` };
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
