/**
 * Stage 1 — Discovery, automated and free.
 *
 * Reads the public job boards (Lever, Greenhouse, Ashby, Workable) of every
 * company already in the tracker, plus any boards the owner adds, and:
 *
 *  1. Link check: every active/held lead whose listing is on a board we read
 *     is marked "still open" (listed) or "closed" (no longer listed) — the
 *     spreadsheet's dead-link rule. Nothing is guessed: a board we couldn't
 *     read leaves its leads untouched.
 *  2. New leads: open jobs whose title matches the owner's words are added
 *     (never duplicated; jobs already seen — even archived ones — are
 *     skipped), with the facts the board states and nothing else.
 *  3. More companies: remote-job sites (Remotive, Himalayas, Workable…) are read for
 *     matching jobs at companies not watched yet. A job only counts once the
 *     same job is found on the company's OWN careers board — then that board
 *     is watched from now on and its jobs are added as in 2. Jobs that can't be
 *     confirmed are listed for the owner to check, never added; ones showing
 *     scam warning signs are dropped.
 *
 * New finds then go through the weekly check's automatic first look and wait
 * in "New to review" for the owner's yes / hold / no.
 */
import { and, eq, sql } from "drizzle-orm";
import { records, settings as settingsTable, targetAccounts, type RecordRow } from "@/db/schema";
import { normalizeText, normalizeUrl } from "@/core/dedup";
import { containsTerm, evaluate, type RuleInput } from "@/core/rules";
import {
  boardKey,
  boardLink,
  candidateBoards,
  countingFetcher,
  detectBoard,
  fetchBoard,
  fetchPostingSummary,
  postingKey,
  PROVIDER_NAMES,
  type BoardRef,
  type Fetcher,
  type Posting,
} from "@/sources/job-boards";
import { fetchSite, SITES, warningSigns, type Listing, type Site } from "@/sources/job-sites";
import { asSystem, type Ctx } from "./context";
import { BOARD_FRESH_MS, readCache, readCacheMany, writeCache } from "./source-cache";
import { logHistory } from "./history";
import { archiveRecord, decideStage, getRecord, holdRecord, upsertLead } from "./records";
import { activeRules, createRule, getSetting, listRules, setSetting } from "./rules";

export const DISCOVERY_ORIGIN = "discovery";

const K = {
  titleWords: "discovery.titleWords",
  skipWords: "discovery.skipWords",
  regionWords: "discovery.regionWords",
  otherRegionWords: "discovery.otherRegionWords",
  extraBoards: "discovery.extraBoards",
  offBoards: "discovery.offBoards",
  offSites: "discovery.offSites",
  /** Company boards found through remote-job sites (internal bookkeeping). */
  foundBoards: "discovery.foundBoards",
  /** Companies already looked for, so a company without a findable board isn't retried every week. */
  probed: "discovery.probed",
  last: "discovery.lastRun",
  /** When the scheduled (weekly) search last started. */
  scheduled: "discovery.scheduledRun",
} as const;

/** Defaults taken from the tracker's own CONFIG (role focus, location, employment type). Editable on Find leads. */
export const DEFAULTS = {
  titleWords: [
    "implementation",
    "automation",
    "CRM",
    "solutions engineer",
    "solutions consultant",
    "solutions architect",
    "GTM engineer",
    "GTM operations",
    "revenue operations",
    "RevOps",
    "marketing operations",
    "sales operations",
    "business systems",
    "business analyst",
    "integration",
    "integrations",
    "onboarding",
    "technical operations",
    "customer success engineer",
    "technical account manager",
    "workflow",
    "HubSpot",
    "Zapier",
    "no-code",
    "low-code",
  ],
  skipWords: [
    "intern",
    "internship",
    "account executive",
    "sales development",
    "business development representative",
    "SDR",
    "BDR",
    "recruiter",
    "vice president",
    "VP",
    "head of",
    "director",
    "principal",
    "staff",
    "senior manager",
    "sr. manager",
    "engineering manager",
    "product manager",
    "software engineer",
    "software development engineer",
    "frontend",
    "backend",
    "data scientist",
    "customer support",
    "support specialist",
    "QA",
    "SDET",
    "test engineer",
    "developer",
    "data architect",
    "test automation",
    "quality assurance",
    "CAD",
  ],
  regionWords: ["India", "Anywhere", "Worldwide", "Global", "International", "APAC", "Asia"],
  otherRegionWords: [
    "United States",
    "USA",
    "US",
    "U.S.",
    "US only",
    "US-based",
    "PST",
    "PT",
    "EST",
    "ET",
    "CST",
    "MST",
    "Pacific time",
    "Eastern time",
    "NAMER",
    "North America",
    "Canada",
    "LATAM",
    "Latin America",
    "South America",
    "Brazil",
    "Mexico",
    "Europe",
    "EMEA",
    "UK",
    "United Kingdom",
    "Ireland",
    "Germany",
    "France",
    "Spain",
    "Netherlands",
    "Poland",
    "Portugal",
    "Australia",
    "New Zealand",
    "Japan",
    "Philippines",
    "Singapore",
    "Korea",
    "South Africa",
    "Sweden",
    "Denmark",
    "Norway",
    "Finland",
    "Italy",
    "Switzerland",
    "Austria",
    "Belgium",
    "Czech",
    "Romania",
    "Israel",
    "UAE",
    "Dubai",
    "KSA",
    "Saudi",
    "Egypt",
    "Nigeria",
    "Kenya",
    "Argentina",
    "Chile",
    "Colombia",
    "Turkey",
    "China",
    "Hong Kong",
    "Taiwan",
    "Vietnam",
    "Indonesia",
    "Malaysia",
    "Thailand",
  ],
};

const REMOTE_WORDS = ["remote", "anywhere", "worldwide", "distributed", "work from home", "wfh"];

/** Rules the weekly check applies to found jobs (they only use details the job board provides). */
export const DISCOVERY_RULES: RuleInput[] = [
  {
    key: "discovery.remote_only",
    label: "Remote roles only",
    description:
      "From your spreadsheet's rules: the search is remote-only. Jobs the board marks as on-site or hybrid are archived; jobs that don't say are kept for you to review.",
    appliesFrom: "screen",
    field: "workplaceType",
    operator: "excludes_all",
    value: ["onsite", "hybrid"],
    effect: "reject",
    enabled: true,
  },
  {
    key: "discovery.open_to_region",
    label: "Open to your region",
    description:
      "From your spreadsheet's rules (location eligibility). Found jobs whose listed location is only another region (e.g. US-only, Europe) are archived. Jobs that name your region, or don't name one, are kept. The region words are on the Find leads page.",
    appliesFrom: "screen",
    field: "openToYourRegion",
    operator: "not_starts_with_any",
    value: ["NO"],
    effect: "reject",
    enabled: true,
  },
];

export interface DiscoverySettings {
  titleWords: string[];
  skipWords: string[];
  regionWords: string[];
  otherRegionWords: string[];
  extraBoards: string[];
  offBoards: string[];
  offSites: string[];
  foundBoards: FoundBoard[];
}

export interface FoundBoard {
  link: string;
  company: string;
  site: string;
  at: string;
}

const list = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.map(String).filter(Boolean) : fallback);

export async function getDiscoverySettings(ctx: Ctx): Promise<DiscoverySettings> {
  const [t, s, r, o, e, off, offSites, found] = await Promise.all([
    getSetting<unknown>(ctx, K.titleWords, null),
    getSetting<unknown>(ctx, K.skipWords, null),
    getSetting<unknown>(ctx, K.regionWords, null),
    getSetting<unknown>(ctx, K.otherRegionWords, null),
    getSetting<unknown>(ctx, K.extraBoards, []),
    getSetting<unknown>(ctx, K.offBoards, []),
    getSetting<unknown>(ctx, K.offSites, []),
    getSetting<unknown>(ctx, K.foundBoards, []),
  ]);
  return {
    titleWords: list(t, DEFAULTS.titleWords),
    skipWords: list(s, DEFAULTS.skipWords),
    regionWords: list(r, DEFAULTS.regionWords),
    otherRegionWords: list(o, DEFAULTS.otherRegionWords),
    extraBoards: list(e, []),
    offBoards: list(off, []),
    offSites: list(offSites, []),
    foundBoards: Array.isArray(found)
      ? found.filter((f): f is FoundBoard => !!f && typeof f === "object" && typeof (f as FoundBoard).link === "string")
      : [],
  };
}

/** Everyone's job-title words (so a shared copy keeps what anyone might want). */
async function allTitleWords(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.select({ v: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, K.titleWords));
  return [...new Set([...DEFAULTS.titleWords, ...rows.flatMap((r) => (Array.isArray(r.v) ? r.v.map(String) : []))])];
}

export async function setSiteEnabled(ctx: Ctx, site: string, on: boolean) {
  if (!(site in SITES)) throw new Error("Unknown job site");
  const s = await getDiscoverySettings(ctx);
  const next = on ? s.offSites.filter((k) => k !== site) : [...new Set([...s.offSites, site])];
  const name = SITES[site as Site].name;
  await setSetting(ctx, K.offSites, next, on ? `${name} switched on` : `${name} switched off`);
}

/**
 * Claim the scheduled search for the next `hours`. Atomic: when several requests arrive at
 * once, exactly one gets true. Written before the search starts, so a slow run still counts.
 */
export async function claimScheduledRun(ctx: Ctx, hours: number, now = Date.now()): Promise<boolean> {
  const cutoff = now - hours * 3_600_000;
  const rows = await ctx.db
    .insert(settingsTable)
    .values({ workspaceId: ctx.workspaceId, key: K.scheduled, value: { at: now } })
    .onConflictDoUpdate({
      target: [settingsTable.workspaceId, settingsTable.key],
      set: { value: { at: now }, updatedAt: new Date(now).toISOString() },
      where: sql`coalesce((${settingsTable.value}->>'at')::bigint, 0) < ${cutoff}`,
    })
    .returning({ key: settingsTable.key });
  return rows.length === 1;
}

/** Give back a claim (the run failed), so the next daily run tries this space again. */
export async function releaseScheduledRun(ctx: Ctx): Promise<void> {
  await saveInternal(ctx, K.scheduled, { at: 0 });
}

/** App bookkeeping (not an owner setting): written directly, no permission check or history entry. */
async function saveInternal(ctx: Ctx, key: string, value: unknown) {
  await ctx.db
    .insert(settingsTable)
    .values({ workspaceId: ctx.workspaceId, key, value })
    .onConflictDoUpdate({ target: [settingsTable.workspaceId, settingsTable.key], set: { value, updatedAt: new Date().toISOString() } });
}

export async function saveDiscoveryWords(
  ctx: Ctx,
  words: Pick<DiscoverySettings, "titleWords" | "skipWords" | "regionWords" | "otherRegionWords">,
) {
  await setSetting(ctx, K.titleWords, words.titleWords, "Job title words updated");
  await setSetting(ctx, K.skipWords, words.skipWords, "Skip words updated");
  await setSetting(ctx, K.regionWords, words.regionWords, "Your region words updated");
  await setSetting(ctx, K.otherRegionWords, words.otherRegionWords, "Other region words updated");
}

/** Add a company's careers link. Returns the recognised board, or null if the link isn't a supported board. */
export async function addBoard(ctx: Ctx, link: string): Promise<BoardRef | null> {
  const b = detectBoard(link);
  if (!b) return null;
  const s = await getDiscoverySettings(ctx);
  const key = boardKey(b);
  const extra = s.extraBoards.filter((x) => detectBoard(x) && boardKey(detectBoard(x)!) !== key);
  await setSetting(ctx, K.extraBoards, [...extra, link.trim()], `Company board added: ${PROVIDER_NAMES[b.provider]} ${b.slug}`);
  if (s.offBoards.includes(key)) await setSetting(ctx, K.offBoards, s.offBoards.filter((k) => k !== key), "Company board switched on");
  return b;
}

export async function setBoardEnabled(ctx: Ctx, key: string, on: boolean) {
  const s = await getDiscoverySettings(ctx);
  const next = on ? s.offBoards.filter((k) => k !== key) : [...new Set([...s.offBoards, key])];
  await setSetting(ctx, K.offBoards, next, on ? "Company board switched on" : "Company board switched off");
}

export interface WatchedBoard {
  key: string;
  ref: BoardRef;
  company: string;
  leads: number;
  enabled: boolean;
  addedByHand: boolean;
  /** The remote-job site through which this company was found, if that's how. */
  foundVia: string | null;
}

const pretty = (slug: string) =>
  slug
    .replace(/[-_.]+/g, " ")
    .replace(/\b(careers?|jobs|inc|hq|io|ai)\b$/i, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || slug;

/** Every company board to read: found in existing leads and companies, plus boards added by hand. */
export async function listBoards(ctx: Ctx): Promise<WatchedBoard[]> {
  const s = await getDiscoverySettings(ctx);
  const [recs, accts] = await Promise.all([
    ctx.db
      .select({ a: records.account, s: records.sourceUrl, n: records.nextStepUrl })
      .from(records)
      .where(eq(records.workspaceId, ctx.workspaceId)),
    ctx.db
      .select({ a: targetAccounts.name, s: targetAccounts.sourceUrl, w: targetAccounts.website })
      .from(targetAccounts)
      .where(eq(targetAccounts.workspaceId, ctx.workspaceId)),
  ]);
  const boards = new Map<string, { ref: BoardRef; names: Map<string, number>; leads: number; hand: boolean; via: string | null }>();
  const see = (link: string | null, name: string | null, countLead: boolean, hand = false, via: string | null = null) => {
    const b = detectBoard(link);
    if (!b) return;
    const key = boardKey(b);
    const e = boards.get(key) ?? { ref: { provider: b.provider, slug: b.slug, region: b.region }, names: new Map(), leads: 0, hand: false, via: null };
    e.via ??= via;
    if (name && !/^unknown$/i.test(name) && !/^\[.*\]$/.test(name)) e.names.set(name, (e.names.get(name) ?? 0) + 1);
    if (countLead) e.leads++;
    e.hand ||= hand;
    boards.set(key, e);
  };
  for (const r of recs) {
    see(r.s, r.a, true);
    if (r.n !== r.s) see(r.n, r.a, false);
  }
  for (const a of accts) {
    see(a.s, a.a, false);
    see(a.w, a.a, false);
  }
  for (const link of s.extraBoards) see(link, null, false, true);
  for (const f of s.foundBoards) see(f.link, f.company, false, false, f.site);
  return [...boards.entries()]
    .map(([key, e]) => ({
      key,
      ref: e.ref,
      company: [...e.names.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? pretty(e.ref.slug),
      leads: e.leads,
      enabled: !s.offBoards.includes(key),
      addedByHand: e.hand,
      foundVia: e.hand ? null : e.via,
    }))
    .sort((a, b) => a.company.localeCompare(b.company));
}

/**
 * Does the listed location open the job to the owner's region? Only restates what the listing says:
 *  - mentions your region → YES
 *  - names another region → NO
 *  - names a place and doesn't mention remote → NO (the spreadsheet's "on-site mislabeled" rule)
 *  - "Remote" but names another place (e.g. "Remote – Chicago") → NO ("a Remote label alone is not sufficient")
 *  - just "Remote", or nothing → UNKNOWN (kept for your review)
 */
export function regionVerdict(location: string | null, mine: string[], others: string[], workplace?: string | null): string {
  if (!location || !location.trim()) return "UNKNOWN";
  // A named place beats a general word: "Anywhere in South America" is not open to India.
  const general = (w: string) => /^(anywhere|worldwide|global|international)$/i.test(w.trim());
  const hit = mine.find((w) => !general(w) && containsTerm(location, w));
  if (hit) return `YES — listing mentions "${hit}"`;
  const other = others.find((w) => containsTerm(location, w));
  if (other) return `NO — listing is for ${location}`;
  const generalHit = mine.find((w) => general(w) && containsTerm(location, w));
  if (generalHit) return `YES — listing says "${generalHit}"`;
  const saysRemote = workplace === "remote" || REMOTE_WORDS.some((w) => containsTerm(location, w));
  if (!saysRemote) return `NO — listing is based in ${location} and doesn't say remote`;
  // What's left once remote words and punctuation are removed is a place name.
  let place = location;
  for (const w of REMOTE_WORDS) place = place.replace(new RegExp(`\\b${w}\\b`, "gi"), " ");
  place = place.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\b(only|first|friendly|flexible|fully|full|100|completely|any|anytime|location|locations|timezone|time|zones?|based|work|from|home|team|company|wide|or|and|in|the|position|role|options?|opportunity)\b/gi, " ").trim();
  if (place) return `NO — remote, but the listing is for ${location}`;
  return "UNKNOWN";
}

export function titleMatches(title: string, s: Pick<DiscoverySettings, "titleWords" | "skipWords">): boolean {
  return s.titleWords.some((w) => containsTerm(title, w)) && !s.skipWords.some((w) => containsTerm(title, w));
}

export interface DiscoveryReport {
  finishedAt: string;
  boardsChecked: number;
  boardsFailed: { company: string; error: string }[];
  jobsSeen: number;
  jobsMatching: number;
  newLeads: number;
  alreadyKnown: number;
  capped: boolean;
  /** Matching jobs not added because they fail your first-look rules (e.g. on-site, another region). */
  filteredOut: number;
  skipped: number;
  stillOpen: number;
  closed: number;
  // Remote-job sites (missing in reports saved before they were added).
  sitesChecked?: number;
  sitesFailed?: { site: string; error: string }[];
  /** Matching jobs on remote-job sites at companies you don't watch yet. */
  siteMatches?: number;
  companiesTried?: number;
  /** Companies whose own careers board was found and confirmed — watched from now on. */
  companiesConfirmed?: { company: string; board: string; site: string }[];
  /** Jobs seen on remote-job sites that couldn't be confirmed with the company (a sample). */
  notConfirmed?: { company: string; title: string; url: string; site: string; location: string | null }[];
  notConfirmedTotal?: number;
  /** Jobs dropped because they show scam warning signs. */
  warningSkipped?: number;
  /** How long each part took (seconds), and one database round trip (ms) — for spotting slow set-ups. */
  timing?: { boards: number; sites: number; saving: number; total: number; dbMs: number };
  /** How much was downloaded, and how many boards were reused from a copy read in the last 12 hours. */
  data?: { downloadedKb: number; boardsReused: number; boardsDownloaded: number };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const sameTitle = (a: string, b: string) => {
  const x = normalizeText(a);
  const y = normalizeText(b);
  return x === y || (x.length >= 8 && y.length >= 8 && (x.includes(y) || y.includes(x)));
};

/** A company looked for recently without finding its board isn't retried for this many days. */
const RETRY_DAYS = 30;
const MAX_COMPANIES_PER_SEARCH = 120;

export async function runDiscovery(
  ctx: Ctx,
  opts: {
    fetcher?: Fetcher;
    maxNew?: number;
    today?: string;
    sites?: boolean;
    siteBudgetMs?: number;
    /** Reuse boards read by anyone within this long (default 12 hours); 0 = read everything fresh. */
    maxAgeMs?: number;
  } = {},
): Promise<DiscoveryReport> {
  const sys = asSystem(ctx, "job-board-search");
  const started = Date.now();
  let dbMs = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await ctx.db.select({ k: settingsTable.key }).from(settingsTable).limit(1);
    dbMs = Math.min(dbMs, Date.now() - t);
  }
  const secs = (ms: number) => Math.round(ms / 100) / 10;
  let fetchMs = 0;
  let sitesMs = 0;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const maxNew = opts.maxNew ?? 200;
  const settings = await getDiscoverySettings(ctx);
  const rules = await activeRules(ctx);
  const allBoards = await listBoards(ctx);
  const boards = allBoards.filter((b) => b.enabled);

  // Fetch once, share with everyone: a board anyone read in the last 12 hours is reused, not downloaded
  // again. Only small facts are kept, plus the description of jobs whose titles match anyone's words.
  const maxAge = opts.maxAgeMs ?? BOARD_FRESH_MS;
  const counter = countingFetcher(opts.fetcher);
  const fetcher = counter.fetcher;
  const anyonesWords = await allTitleWords(ctx);
  const worthDescribing = (title: string) => anyonesWords.some((w) => containsTerm(title, w));
  type Kept = { company: string | null; postings: Posting[] };
  const keyOf = (ref: BoardRef) => `board:${boardKey(ref)}`;
  const kept = await readCacheMany<Kept>(ctx.db, boards.map((b) => keyOf(b.ref)), maxAge);
  let reused = 0;
  let fetched = 0;
  const getBoard = async (ref: BoardRef): Promise<({ ok: true } & Kept) | { ok: false; error: string }> => {
    const hit = kept.get(keyOf(ref)) ?? (await readCache<Kept>(ctx.db, keyOf(ref), maxAge))?.value;
    if (hit) {
      reused++;
      return { ok: true, ...hit };
    }
    const res = await fetchBoard(ref, fetcher);
    if (!res.ok) return res;
    fetched++;
    const slim: Kept = { company: res.company, postings: res.postings.map((p) => ({ ...p, summary: worthDescribing(p.title) ? p.summary : null })) };
    await writeCache(ctx.db, keyOf(ref), slim);
    kept.set(keyOf(ref), slim);
    return { ok: true, ...slim };
  };

  const tFetch = Date.now();
  const results = await pool(boards, 16, async (b) => ({ b, res: await getBoard(b.ref) }));
  fetchMs = Date.now() - tFetch;
  const report: DiscoveryReport = {
    finishedAt: "",
    boardsChecked: 0,
    boardsFailed: [],
    jobsSeen: 0,
    jobsMatching: 0,
    newLeads: 0,
    alreadyKnown: 0,
    capped: false,
    filteredOut: 0,
    skipped: 0,
    stillOpen: 0,
    closed: 0,
    sitesChecked: 0,
    sitesFailed: [],
    siteMatches: 0,
    companiesTried: 0,
    companiesConfirmed: [],
    notConfirmed: [],
    notConfirmedTotal: 0,
    warningSkipped: 0,
  };

  // Every posting any existing lead points at (including archived ones — a rejected job isn't re-added).
  const all = await ctx.db.select().from(records).where(eq(records.workspaceId, ctx.workspaceId));
  const byPosting = new Map<string, RecordRow[]>();
  // Same company + same job title = the same job, even if you saved it from LinkedIn or another site,
  // or the company posted it once per city.
  // "Acme (client undisclosed)" and "Acme" are one company: notes in brackets are ignored.
  const sameJob = (company: string, title: string) => `${normalizeText(company.replace(/\([^)]*\)/g, " "))}|${normalizeText(title)}`;
  const knownJobs = new Set(all.map((r) => sameJob(r.account, r.opportunity)));
  const byUrl = new Map<string, RecordRow[]>();
  for (const r of all) {
    const keys = new Set<string>();
    for (const link of new Set([r.sourceUrl, r.nextStepUrl])) {
      const d = detectBoard(link);
      if (d?.postingId) keys.add(postingKey(d, d.postingId));
    }
    // Found jobs remember their board posting, even when the link is on the company's own site (e.g. ?gh_jid=…).
    if (typeof r.extra.boardPosting === "string") keys.add(r.extra.boardPosting);
    for (const k of keys) byPosting.set(k, [...(byPosting.get(k) ?? []), r]);
    if (!keys.size && r.sourceUrl) {
      const u = normalizeUrl(r.sourceUrl);
      byUrl.set(u, [...(byUrl.get(u) ?? []), r]);
    }
  }

  const checked = new Set<string>();
  /** Link-check existing leads on one company board, then add its new matching jobs. */
  const processBoard = async (ref: BoardRef, key: string, company: string, postings: Posting[], via?: string) => {
    report.boardsChecked++;
    report.jobsSeen += postings.length;
    const openIds = new Set(postings.map((p) => postingKey(ref, p.id)));

    // Leads saved from a company-site link of a board posting: remember the posting, so next week's
    // link check can tell when it closes.
    for (const p of postings) {
      const recs = p.url ? byUrl.get(normalizeUrl(p.url)) : undefined;
      if (!recs) continue;
      const k = postingKey(ref, p.id);
      for (const r of recs) {
        await sys.db
          .update(records)
          .set({ extra: { ...r.extra, boardPosting: k } })
          .where(and(eq(records.workspaceId, sys.workspaceId), eq(records.id, r.id)));
        byPosting.set(k, [...(byPosting.get(k) ?? []), r]);
      }
      byUrl.delete(normalizeUrl(p.url));
    }

    // 1. Link check for existing leads on this board.
    for (const [k, recs] of byPosting) {
      if (!k.startsWith(`${key}:`)) continue;
      const open = openIds.has(k);
      for (const r of recs) {
        if (r.status === "archived" || checked.has(r.id)) continue;
        checked.add(r.id);
        if (open) report.stillOpen++;
        else report.closed++;
        await markListing(sys, r, open, company, today);
      }
    }

    // 2. New leads.
    for (const p of postings) {
      if (!p.title || !p.url || !titleMatches(p.title, settings)) continue;
      report.jobsMatching++;
      if (byPosting.has(postingKey(ref, p.id)) || knownJobs.has(sameJob(company, p.title))) {
        report.alreadyKnown++;
        continue;
      }
      if (report.newLeads >= maxNew) {
        report.capped = true;
        continue;
      }
      // Jobs that clearly fail your first-look rules (on-site, another region…) are counted, not added.
      const attributes = foundJobAttributes(ref, company, p, settings, today, via);
      const firstLook = evaluate(rules, { account: company, opportunity: p.title, location: p.location, sourceBoard: PROVIDER_NAMES[ref.provider], ...attributes }, "screen");
      if (firstLook.fails.length) {
        report.filteredOut++;
        continue;
      }
      // Boards whose list leaves descriptions out: fetch this one job's description (one small request).
      const job = p.summary ? p : { ...p, summary: await fetchPostingSummary(ref, p.id, fetcher) };
      // Even on a careers page, a listing showing scam signs is never added.
      if (warningSigns(`${job.title}\n${job.summary ?? ""}`).length) {
        report.warningSkipped!++;
        continue;
      }
      let created = false;
      try {
        created = await addFoundJob(sys, ref, company, job, attributes, today);
      } catch {
        report.skipped++; // one unusual listing never stops the search
        continue;
      }
      if (created) {
        report.newLeads++;
        byPosting.set(postingKey(ref, p.id), []);
        knownJobs.add(sameJob(company, p.title));
      } else report.alreadyKnown++;
    }
  };

  for (const { b, res } of results) {
    if (!res.ok) {
      report.boardsFailed.push({ company: b.company, error: res.error });
      continue;
    }
    await processBoard(b.ref, b.key, b.company, res.postings);
  }

  // 3. Remote-job sites → companies you don't watch yet → confirmed on their own careers board.
  if (opts.sites !== false) {
    const tSites = Date.now();
    const siteKeys = (Object.keys(SITES) as Site[]).filter((site) => !settings.offSites.includes(site));
    const general = /^(anywhere|worldwide|global|international|apac|asia|emea|latam|remote)$/i;
    const country = settings.regionWords.find((w) => !general.test(w.trim()));
    const siteResults = await pool(siteKeys, 6, async (site) => {
      // Himalayas and Workable are searched with your words and region, so their saved copy is kept per set of words.
      const searched = site === "himalayas" || site === "workable";
      const key = searched ? `site:${site}:${country ?? ""}:${[...settings.titleWords].sort().join("|").toLowerCase()}` : `site:${site}`;
      const hit = await readCache<Listing[]>(ctx.db, key, maxAge);
      if (hit) return { site, res: { ok: true as const, listings: hit.value } };
      const res = await fetchSite(site, { searchWords: settings.titleWords, country, deadline: tSites + (opts.siteBudgetMs ?? 90_000) / 2 }, fetcher);
      // Keep only listings someone could want (their titles match anyone's words).
      if (res.ok) await writeCache(ctx.db, key, res.listings.filter((l) => worthDescribing(l.title)));
      return { site, res };
    });
    const watchedNames = new Set(allBoards.map((b) => normalizeText(b.company)));
    const watchedKeys = new Set(allBoards.map((b) => b.key));
    const byCompany = new Map<string, { company: string; hints: Set<string>; listings: Listing[]; workable: boolean }>();
    for (const { site, res } of siteResults) {
      if (!res.ok) {
        report.sitesFailed!.push({ site: SITES[site].name, error: res.error });
        continue;
      }
      report.sitesChecked!++;
      for (const l of res.listings) {
        if (!titleMatches(l.title, settings)) continue;
        // These sites only list remote jobs; a listing only for another region is skipped here.
        if (/^NO/.test(regionVerdict(l.location, settings.regionWords, settings.otherRegionWords, "remote"))) continue;
        const name = normalizeText(l.company);
        if (!name || watchedNames.has(name) || knownJobs.has(sameJob(l.company, l.title))) continue;
        const e = byCompany.get(name) ?? { company: l.company, hints: new Set<string>(), listings: [], workable: false };
        if (l.companyHint) e.hints.add(l.companyHint);
        if (l.site === "workable") e.workable = true;
        if (!e.listings.some((x) => sameTitle(x.title, l.title))) {
          e.listings.push(l);
          report.siteMatches!++;
        }
        byCompany.set(name, e);
      }
    }

    const notConfirmed = (l: Listing) => {
      if (warningSigns(`${l.title}\n${l.summary ?? ""}`).length) {
        report.warningSkipped!++;
        return;
      }
      report.notConfirmedTotal!++;
      if (report.notConfirmed!.length < 60)
        report.notConfirmed!.push({ company: l.company, title: l.title, url: l.url, site: SITES[l.site].name, location: l.location });
    };

    // Where each company's careers page is (or that none was found) is shared by everyone's searches.
    const probed = { ...(await getSetting<Record<string, { at: string; link: string | null }>>(ctx, K.probed, {})) };
    const shared = await readCacheMany<{ link: string | null }>(ctx.db, [...byCompany.keys()].map((n) => `probe:${n}`), RETRY_DAYS * 86_400_000);
    const triedRecently = (name: string) => {
      const p = probed[name];
      if (shared.get(`probe:${name}`)?.link === null) return true;
      return !!p && p.link === null && Date.parse(today) - Date.parse(p.at) < RETRY_DAYS * 86_400_000;
    };
    const knownBoard = (name: string) => {
      const link = shared.get(`probe:${name}`)?.link;
      const d = link ? detectBoard(link) : null;
      return d ? [{ provider: d.provider, slug: d.slug, region: d.region }] : [];
    };
    const companies = [...byCompany.entries()];
    // Take companies from each site in turn, so one big site can't crowd out the others.
    const queues = new Map<Site, typeof companies>();
    for (const c of companies.filter(([name]) => !triedRecently(name))) {
      const site = c[1].listings[0].site;
      queues.set(site, [...(queues.get(site) ?? []), c]);
    }
    const toTry: typeof companies = [];
    while (toTry.length < MAX_COMPANIES_PER_SEARCH && [...queues.values()].some((q) => q.length))
      for (const q of queues.values()) if (q.length && toTry.length < MAX_COMPANIES_PER_SEARCH) toTry.push(q.shift()!);
    const tryNames = new Set(toTry.map(([name]) => name));
    for (const [name, e] of companies) if (!tryNames.has(name)) e.listings.forEach(notConfirmed);

    const deadline = Date.now() + (opts.siteBudgetMs ?? 90_000);
    type Try = { name: string; e: (typeof toTry)[number][1]; hit: { ref: BoardRef; res: { company: string | null; postings: Posting[] } } | null; tried: boolean; watched?: boolean };
    const tries = await pool(toTry, 6, async ([name, e]): Promise<Try> => {
      if (Date.now() > deadline) return { name, e, hit: null, tried: false };
      let busy = false; // a board that said "slow down" isn't a board that doesn't exist: try again next time
      for (const ref of [...knownBoard(name), ...candidateBoards(e.company, [...e.hints], { workable: e.workable })]) {
        // Already watched under another name: this search already reads it, nothing to confirm.
        if (watchedKeys.has(boardKey(ref))) return { name, e, hit: null, tried: true, watched: true };
        if (Date.now() > deadline) return { name, e, hit: null, tried: false };
        const res = await getBoard(ref);
        if (!res.ok && /rate limited/.test(res.error)) busy = true;
        if (!res.ok || !res.postings.length) continue;
        // The board must really list one of the jobs — a board that merely shares the name doesn't count.
        if (e.listings.some((l) => res.postings.some((p) => sameTitle(p.title, l.title)))) return { name, e, hit: { ref, res }, tried: true };
      }
      return { name, e, hit: null, tried: !busy };
    });

    sitesMs = Date.now() - tSites;
    const foundBoards = [...settings.foundBoards];
    for (const t of tries) {
      if (t.tried) report.companiesTried!++;
      if (t.watched) continue;
      if (!t.hit) {
        if (t.tried) {
          probed[t.name] = { at: today, link: null };
          await writeCache(ctx.db, `probe:${t.name}`, { link: null });
        }
        t.e.listings.forEach(notConfirmed);
        continue;
      }
      const { ref, res } = t.hit;
      const key = boardKey(ref);
      if (watchedKeys.has(key)) continue; // two names for one company, already handled
      watchedKeys.add(key);
      const company = res.company?.trim() || t.e.company;
      const site = SITES[t.e.listings[0].site].name;
      foundBoards.push({ link: boardLink(ref), company, site, at: today });
      probed[t.name] = { at: today, link: boardLink(ref) };
      await writeCache(ctx.db, `probe:${t.name}`, { link: boardLink(ref) });
      report.companiesConfirmed!.push({ company, board: PROVIDER_NAMES[ref.provider], site });
      await logHistory(sys, {
        entityType: "setting",
        entityId: K.foundBoards,
        event: "company_board_found",
        reason: `Found ${company}'s own careers page (${PROVIDER_NAMES[ref.provider]}) through ${site} — the job is listed there, so it's genuine. Watched from now on.`,
      });
      await processBoard(ref, key, company, res.postings, site);
    }
    await saveInternal(ctx, K.foundBoards, foundBoards);
    await saveInternal(ctx, K.probed, probed);
  }

  report.finishedAt = new Date().toISOString();
  const total = Date.now() - started;
  report.timing = { boards: secs(fetchMs), sites: secs(sitesMs), saving: secs(total - fetchMs - sitesMs), total: secs(total), dbMs };
  report.data = { downloadedKb: Math.round(counter.bytes() / 1024), boardsReused: reused, boardsDownloaded: fetched };
  // Internal bookkeeping (the summary shown on the page) — not an owner setting, so no permission or history entry.
  await saveInternal(ctx, K.last, report);
  const via = report.companiesConfirmed?.length ? `, ${report.companiesConfirmed.length} new companies found through remote-job sites` : "";
  await logHistory(sys, {
    entityType: "pipeline_run",
    event: "job_board_search",
    reason: `Searched ${report.boardsChecked} company job boards: ${report.newLeads} new leads found, ${report.stillOpen} listings still open, ${report.closed} closed${via}${report.boardsFailed.length ? `, ${report.boardsFailed.length} boards couldn't be read` : ""}`,
    detail: { ...report, notConfirmed: undefined },
  });
  return report;
}

async function markListing(sys: Ctx, r: RecordRow, open: boolean, company: string, today: string) {
  const was = String(r.attributes.verifiedOpen ?? "");
  const wasOpen = /^YES/i.test(was);
  const wasClosed = /^NO/i.test(was);
  const target = open ? "verified" : "unreachable";
  if ((open && wasOpen && r.sourceVerification === "verified") || (!open && wasClosed && r.sourceVerification === target)) return;
  const note = open
    ? `YES — still listed on ${company}'s job board (checked ${today})`
    : `NO — no longer listed on ${company}'s job board (checked ${today})`;
  await sys.db
    .update(records)
    .set({
      sourceVerification: target,
      attributes: { ...r.attributes, verifiedOpen: note },
      ...(open ? { lastVerifiedAt: today } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(records.workspaceId, sys.workspaceId), eq(records.id, r.id)));
  await logHistory(sys, {
    entityType: "record",
    entityId: r.id,
    event: "source_verification",
    priorStatus: r.sourceVerification,
    newStatus: target,
    reason: open ? "Link checked: still listed on the company's job board" : "Link checked: no longer on the company's job board (closed)",
  });
}

function foundJobAttributes(board: BoardRef, company: string, p: Posting, s: DiscoverySettings, today: string, via?: string) {
  const provider = PROVIDER_NAMES[board.provider];
  const attributes: Record<string, unknown> = {
    verifiedOpen: `YES — listed on ${company}'s job board (checked ${today})`,
    openToYourRegion: regionVerdict(p.location, s.regionWords, s.otherRegionWords, p.workplace),
    foundOn: via ? `${via}, confirmed on the company's ${provider} job board` : `${provider} job board`,
    genuine: via
      ? `YES — first seen on ${via}, then found on a ${provider} careers page under the name "${company}" listing the same job`
      : `YES — posted on ${company}'s own careers page (${provider})`,
  };
  if (p.location) attributes.postingLocation = p.location;
  if (p.workplace) attributes.workplaceType = p.workplace;
  if (p.employment) attributes.employmentType = p.employment;
  if (p.compensation) attributes.compensation = p.compensation;
  if (p.postedAt) attributes.postedOn = p.postedAt;
  return attributes;
}

async function addFoundJob(sys: Ctx, board: BoardRef, company: string, p: Posting, attributes: Record<string, unknown>, today: string) {
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const { record, created } = await upsertLead(
    sys,
    {
      account: cut(company, 290),
      opportunity: cut(p.title, 480),
      sourceUrl: cut(p.url, 1990),
      sourceBoard: PROVIDER_NAMES[board.provider],
      location: p.location ? cut(p.location, 290) : undefined,
      dateFound: today,
      attributes,
      extra: { boardPosting: postingKey(board, p.id), ...(p.summary ? { postingSummary: p.summary } : {}) },
    },
    DISCOVERY_ORIGIN,
  );
  if (created) {
    await sys.db
      .update(records)
      .set({ sourceVerification: "verified", lastVerifiedAt: today })
      .where(and(eq(records.workspaceId, sys.workspaceId), eq(records.id, record.id)));
  }
  return created;
}

export async function lastDiscovery(ctx: Ctx): Promise<DiscoveryReport | null> {
  return getSetting<DiscoveryReport | null>(ctx, K.last, null);
}

/**
 * The owner's review of a found job: "yes" runs the remaining decisions with the
 * owner's reason (so it becomes Ready if it still passes every rule), "hold"
 * and "no" move it to On hold / Archived.
 */
export async function reviewFoundJob(ctx: Ctx, id: string, choice: "yes" | "hold" | "no"): Promise<RecordRow> {
  if (choice === "hold") return holdRecord(ctx, id, "Reviewed by you: not sure yet", "Decide whether to apply");
  if (choice === "no") return archiveRecord(ctx, id, "Reviewed by you: not for me");
  let r = await getRecord(ctx, id);
  const reason = "Reviewed by you: worth applying";
  if (r.stage === "discovery") r = await decideStage(ctx, id, { stage: "screen", verdict: "keep_possible", reason });
  if (r.stage === "screen") r = await decideStage(ctx, id, { stage: "triage", verdict: "top_priority", reason });
  if (r.stage === "triage") r = await decideStage(ctx, id, { stage: "verify", verdict: "tier_good", reason });
  return r;
}

/** Add the discovery rules if they aren't there yet (never overwrites the owner's edits). */
export async function seedDiscoveryRules(ctx: Ctx) {
  const existing = new Set((await listRules(ctx)).map((r) => r.key));
  for (const rule of DISCOVERY_RULES) if (!existing.has(rule.key)) await createRule(ctx, rule, "seed");
}
