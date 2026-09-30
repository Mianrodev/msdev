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
 *
 * New finds then go through the weekly check's automatic first look and wait
 * in "New to review" for the owner's yes / hold / no.
 */
import { and, eq } from "drizzle-orm";
import { records, settings as settingsTable, targetAccounts, type RecordRow } from "@/db/schema";
import { normalizeText } from "@/core/dedup";
import { containsTerm, evaluate, type RuleInput } from "@/core/rules";
import {
  boardKey,
  detectBoard,
  fetchBoard,
  postingKey,
  PROVIDER_NAMES,
  type BoardRef,
  type Fetcher,
  type Posting,
} from "@/sources/job-boards";
import { asSystem, type Ctx } from "./context";
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
  last: "discovery.lastRun",
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
}

const list = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.map(String).filter(Boolean) : fallback);

export async function getDiscoverySettings(ctx: Ctx): Promise<DiscoverySettings> {
  const [t, s, r, o, e, off] = await Promise.all([
    getSetting<unknown>(ctx, K.titleWords, null),
    getSetting<unknown>(ctx, K.skipWords, null),
    getSetting<unknown>(ctx, K.regionWords, null),
    getSetting<unknown>(ctx, K.otherRegionWords, null),
    getSetting<unknown>(ctx, K.extraBoards, []),
    getSetting<unknown>(ctx, K.offBoards, []),
  ]);
  return {
    titleWords: list(t, DEFAULTS.titleWords),
    skipWords: list(s, DEFAULTS.skipWords),
    regionWords: list(r, DEFAULTS.regionWords),
    otherRegionWords: list(o, DEFAULTS.otherRegionWords),
    extraBoards: list(e, []),
    offBoards: list(off, []),
  };
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
  const boards = new Map<string, { ref: BoardRef; names: Map<string, number>; leads: number; hand: boolean }>();
  const see = (link: string | null, name: string | null, countLead: boolean, hand = false) => {
    const b = detectBoard(link);
    if (!b) return;
    const key = boardKey(b);
    const e = boards.get(key) ?? { ref: { provider: b.provider, slug: b.slug, region: b.region }, names: new Map(), leads: 0, hand: false };
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
  return [...boards.entries()]
    .map(([key, e]) => ({
      key,
      ref: e.ref,
      company: [...e.names.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? pretty(e.ref.slug),
      leads: e.leads,
      enabled: !s.offBoards.includes(key),
      addedByHand: e.hand,
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

export async function runDiscovery(
  ctx: Ctx,
  opts: { fetcher?: Fetcher; maxNew?: number; today?: string } = {},
): Promise<DiscoveryReport> {
  const sys = asSystem(ctx, "job-board-search");
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const maxNew = opts.maxNew ?? 200;
  const settings = await getDiscoverySettings(ctx);
  const rules = await activeRules(ctx);
  const boards = (await listBoards(ctx)).filter((b) => b.enabled);

  const results = await pool(boards, 8, async (b) => ({ b, res: await fetchBoard(b.ref, opts.fetcher) }));
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
  };

  // Every posting any existing lead points at (including archived ones — a rejected job isn't re-added).
  const all = await ctx.db.select().from(records).where(eq(records.workspaceId, ctx.workspaceId));
  const byPosting = new Map<string, RecordRow[]>();
  // Same company + same job title = the same job, even if you saved it from LinkedIn or another site,
  // or the company posted it once per city.
  const sameJob = (company: string, title: string) => `${normalizeText(company)}|${normalizeText(title)}`;
  const knownJobs = new Set(all.map((r) => sameJob(r.account, r.opportunity)));
  for (const r of all) {
    for (const link of new Set([r.sourceUrl, r.nextStepUrl])) {
      const d = detectBoard(link);
      if (!d?.postingId) continue;
      const k = postingKey(d, d.postingId);
      byPosting.set(k, [...(byPosting.get(k) ?? []), r]);
    }
  }

  const checked = new Set<string>();
  for (const { b, res } of results) {
    if (!res.ok) {
      report.boardsFailed.push({ company: b.company, error: res.error });
      continue;
    }
    report.boardsChecked++;
    report.jobsSeen += res.postings.length;
    const openIds = new Set(res.postings.map((p) => postingKey(b.ref, p.id)));
    const company = b.company;

    // 1. Link check for existing leads on this board.
    for (const [k, recs] of byPosting) {
      if (!k.startsWith(`${b.key}:`)) continue;
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
    for (const p of res.postings) {
      if (!p.title || !p.url || !titleMatches(p.title, settings)) continue;
      report.jobsMatching++;
      if (byPosting.has(postingKey(b.ref, p.id)) || knownJobs.has(sameJob(company, p.title))) {
        report.alreadyKnown++;
        continue;
      }
      if (report.newLeads >= maxNew) {
        report.capped = true;
        continue;
      }
      // Jobs that clearly fail your first-look rules (on-site, another region…) are counted, not added.
      const attributes = foundJobAttributes(b.ref, company, p, settings, today);
      const firstLook = evaluate(rules, { account: company, opportunity: p.title, location: p.location, sourceBoard: PROVIDER_NAMES[b.ref.provider], ...attributes }, "screen");
      if (firstLook.fails.length) {
        report.filteredOut++;
        continue;
      }
      let created = false;
      try {
        created = await addFoundJob(sys, b.ref, company, p, attributes, today);
      } catch {
        report.skipped++; // one unusual listing never stops the search
        continue;
      }
      if (created) {
        report.newLeads++;
        byPosting.set(postingKey(b.ref, p.id), []);
        knownJobs.add(sameJob(company, p.title));
      } else report.alreadyKnown++;
    }
  }

  report.finishedAt = new Date().toISOString();
  // Internal bookkeeping (the summary shown on the page) — not an owner setting, so no permission or history entry.
  await ctx.db
    .insert(settingsTable)
    .values({ workspaceId: ctx.workspaceId, key: K.last, value: report })
    .onConflictDoUpdate({ target: [settingsTable.workspaceId, settingsTable.key], set: { value: report, updatedAt: report.finishedAt } });
  await logHistory(sys, {
    entityType: "pipeline_run",
    event: "job_board_search",
    reason: `Searched ${report.boardsChecked} company job boards: ${report.newLeads} new leads found, ${report.stillOpen} listings still open, ${report.closed} closed${report.boardsFailed.length ? `, ${report.boardsFailed.length} boards couldn't be read` : ""}`,
    detail: { ...report },
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

function foundJobAttributes(board: BoardRef, company: string, p: Posting, s: DiscoverySettings, today: string) {
  const attributes: Record<string, unknown> = {
    verifiedOpen: `YES — listed on ${company}'s job board (checked ${today})`,
    openToYourRegion: regionVerdict(p.location, s.regionWords, s.otherRegionWords, p.workplace),
    foundOn: `${PROVIDER_NAMES[board.provider]} job board`,
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
      extra: p.summary ? { postingSummary: p.summary } : undefined,
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
