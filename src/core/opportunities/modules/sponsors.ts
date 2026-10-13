/**
 * Sponsor Finder.
 *
 * Ranks brands by public evidence of relevant sponsorships and audience fit. The app never claims a
 * brand is looking for sponsorships unless a source says so, never invents contacts or budgets, and
 * never sends outreach. Suggested angles are labelled as suggestions.
 */
import { z } from "zod";
import { fmtDate } from "../dates";
import { displayValue, valueOf } from "../fields";
import type { ModuleDef, RankContext } from "../module";
import { choice, commonQuery, list, optNum, optText } from "../query";
import { aggregate } from "../scoring";
import { includesCi, joinText, phraseScore, phrases, stem, tokens } from "../text";
import type { Field, MatchResult, NormalizedItem, ScoreComponent } from "../types";

export const SPONSORSHIP_TYPES = [
  ["any", "Any"],
  ["cash", "Cash sponsorship"],
  ["in_kind", "In-kind / product"],
  ["media", "Media partnership"],
  ["venue", "Venue / hosting"],
  ["naming", "Naming rights"],
  ["content", "Content / creator collaboration"],
] as const;

export const sponsorQuery = z.object({
  ...commonQuery,
  description: optText(2000),
  audience: optText(500),
  location: optText(200),
  industries: list(10),
  categories: list(10),
  sponsorshipType: choice(["any", "cash", "in_kind", "media", "venue", "naming", "content"] as const, "any"),
  audienceSize: optNum(0, 1e10),
  requestedBudget: optNum(0, 1e10),
});
export type SponsorQuery = z.infer<typeof sponsorQuery>;

export interface PastSponsorship {
  title: string;
  date: string | null;
  type: string | null;
  category: string | null;
  url: string | null;
  summary: string | null;
}

export interface ContactChannel {
  kind: "form" | "email" | "partnerships_page" | "press" | "phone";
  value: string;
  label: string;
}

const FIELD_LABELS = {
  industry: "Industry",
  geography: "Markets / geography",
  website: "Website",
  audienceFocus: "Audience the brand targets (published)",
  pastSponsorships: "Public evidence of sponsorships & partnerships",
  sponsorshipTypes: "Sponsorship types seen",
  seekingSponsorship: "Actively inviting sponsorship requests?",
  contactChannel: "Public business contact channel",
  sponsorshipBudget: "Sponsorship budget",
} as const;

const KEY_FIELDS = ["industry", "geography", "website", "audienceFocus", "pastSponsorships", "contactChannel"] as const;

const history = (it: NormalizedItem): PastSponsorship[] => (valueOf(it.fields.pastSponsorships as Field<PastSponsorship[]>) ?? []) as PastSponsorship[];

function formatField(key: string, f: Field | undefined): string {
  if (key === "pastSponsorships")
    return displayValue(f, (v) => (v as PastSponsorship[]).map((p) => `${p.title}${p.date ? ` (${fmtDate(p.date)})` : " (date unknown)"}`).join("; "));
  if (key === "contactChannel") return displayValue(f, (v) => `${(v as ContactChannel).label}: ${(v as ContactChannel).value}`);
  if (key === "seekingSponsorship") {
    if (!f || f.state === "unknown") return "Not confirmed by any source";
    return f.value ? "Yes — confirmed by a source" : "Source says no";
  }
  if (key === "sponsorshipBudget" && (!f || f.state === "unknown")) return "Not published";
  return displayValue(f);
}

/** Recency weight for a piece of sponsorship evidence. Undated evidence counts least. */
export function recencyWeight(date: string | null, now: Date): number {
  if (!date) return 0.2;
  const months = (now.getTime() - Date.parse(date)) / (30.44 * 86_400_000);
  if (months < 0) return 1;
  if (months <= 24) return 1;
  if (months <= 48) return 0.5;
  return 0.25;
}

function rankOne(it: NormalizedItem, q: SponsorQuery, ctx: RankContext): MatchResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  const hist = history(it);
  const brandText = joinText(it.title, valueOf(it.fields.industry), valueOf(it.fields.audienceFocus), hist.map((h) => [h.title, h.category, h.summary]));
  const c: ScoreComponent[] = [];

  // Project/audience fit: share of the distinctive words in the user's description and audience found in the brand's evidence.
  const want = [...new Set(tokens(joinText(q.description, q.audience)).map(stem))].filter((t) => t.length > 3).slice(0, 40);
  const have = new Set(tokens(brandText).map(stem));
  const overlap = want.filter((t) => have.has(t));
  const fit = want.length ? Math.min(1, overlap.length / Math.max(3, Math.min(8, want.length / 2))) : null;
  c.push({ key: "fit", label: "Project & audience fit", weight: 30, score: fit, detail: want.length ? `Shared themes: ${overlap.slice(0, 8).join(", ") || "none"}` : "Describe your project and audience to score this" });
  if (overlap.length >= 2) reasons.push(`Their public activity shares themes with your project: ${overlap.slice(0, 5).join(", ")}.`);

  const cats = [...q.industries, ...q.categories];
  const ind = cats.length ? phraseScore(brandText, cats) : { score: null, hits: [] as string[] };
  c.push({ key: "industry", label: "Industry & categories", weight: 20, score: ind.score === null ? null : ind.hits.length ? Math.min(1, 0.5 + ind.hits.length / (2 * cats.length)) : 0, detail: cats.length ? `Matched: ${ind.hits.join(", ") || "none"}` : "No industries chosen" });
  if (ind.hits.length) reasons.push(`Active in ${ind.hits.join(", ")}.`);

  const geo = (valueOf(it.fields.geography) as string[] | null) ?? [];
  let g: number | null = null;
  if (q.location && geo.length) g = phrases(q.location).some((l) => geo.some((x) => includesCi(x, l) || includesCi(l, x) || /global|worldwide|international/i.test(x))) ? 1 : 0;
  if (q.location && !geo.length) flags.push("Brand's markets not published.");
  c.push({ key: "geography", label: "Geography", weight: 15, score: g, detail: q.location ? (geo.length ? `Markets: ${geo.join(", ")}` : "Not published") : "No location given" });

  let h: number | null = null;
  if (!hist.length) flags.push("No public sponsorship evidence found. That doesn't mean they don't sponsor — only that no source shows it.");
  else {
    const relevantText = joinText(q.description, q.audience, cats);
    const relevant = hist.map((x) => {
      const rel = cats.length || relevantText.trim() ? (phraseScore(joinText(x.title, x.category, x.summary), [...cats, ...tokens(relevantText).slice(0, 12)]).hits.length ? 1 : 0.5) : 1;
      return rel * recencyWeight(x.date, ctx.now);
    });
    h = Math.min(1, relevant.reduce((s, v) => s + v, 0) / 2);
    const recent = hist.filter((x) => recencyWeight(x.date, ctx.now) === 1);
    if (recent.length) reasons.push(`${recent.length} sponsorship${recent.length > 1 ? "s" : ""} in the last two years, e.g. ${recent[0].title}.`);
    if (hist.some((x) => !x.date)) flags.push("Some sponsorship evidence is undated.");
    if (!recent.length) flags.push("All sponsorship evidence is more than two years old.");
  }
  c.push({ key: "history", label: "Relevant sponsorship history", weight: 25, score: h, detail: hist.length ? `${hist.length} piece${hist.length > 1 ? "s" : ""} of public evidence` : "None found" });

  const types = (valueOf(it.fields.sponsorshipTypes) as string[] | null) ?? [];
  let t: number | null = null;
  if (q.sponsorshipType !== "any") t = types.length ? (types.includes(q.sponsorshipType) ? 1 : 0) : null;
  c.push({ key: "type", label: "Sponsorship type", weight: 10, score: t, detail: q.sponsorshipType === "any" ? "Any type" : types.length ? `Seen: ${types.join(", ")}` : "Not known from evidence" });

  if (it.fields.contactChannel?.state !== "known") flags.push("No public business contact channel found.");
  if (it.fields.seekingSponsorship?.state !== "known") flags.push("No source confirms they are currently accepting sponsorship requests.");
  if (q.requestedBudget) flags.push("Your requested budget is yours alone — no source shows this brand's sponsorship budget.");
  return { ...aggregate(c), reasons, flags: [...new Set(flags)] };
}

/** A deterministic suggested angle, built only from the evidence and the user's own inputs. Always labelled a suggestion. */
export function suggestedAngle(it: NormalizedItem, q: SponsorQuery, now: Date = new Date()): string | null {
  const hist = history(it)
    .filter((h) => recencyWeight(h.date, now) >= 0.5)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const audience = q.audience?.trim();
  if (!hist.length && !audience) return null;
  const parts: string[] = [];
  if (hist[0]) parts.push(`Reference their ${hist[0].title}${hist[0].date ? ` (${fmtDate(hist[0].date)})` : ""}`);
  if (audience) parts.push(`show how your audience (${audience.slice(0, 120)}) overlaps with theirs`);
  if (q.sponsorshipType !== "any") parts.push(`propose a ${SPONSORSHIP_TYPES.find(([v]) => v === q.sponsorshipType)?.[1].toLowerCase()} package`);
  return `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase());
}

const col = (key: keyof typeof FIELD_LABELS, inTable = false) => ({
  key,
  label: FIELD_LABELS[key],
  text: (it: NormalizedItem) => formatField(key, it.fields[key]),
  inTable,
});

export const sponsors: ModuleDef<SponsorQuery> = {
  id: "sponsors",
  querySchema: sponsorQuery as unknown as z.ZodType<SponsorQuery>,
  filters: [
    { name: "description", label: "Event or project description", type: "textarea", group: "Your project", placeholder: "e.g. A two-day community cycling festival with family rides and a repair workshop", wide: true },
    { name: "audience", label: "Audience", type: "text", group: "Your project", placeholder: "e.g. families, commuters, 25–45, cycling enthusiasts", wide: true },
    { name: "location", label: "Location", type: "text", group: "Your project", placeholder: "e.g. Manchester, UK" },
    { name: "industries", label: "Sponsor industries", type: "text", group: "Sponsors", placeholder: "e.g. outdoor gear, sports nutrition" },
    { name: "categories", label: "Sponsorship categories", type: "text", group: "Sponsors", placeholder: "e.g. sustainability, community, health" },
    { name: "sponsorshipType", label: "Desired sponsorship type", type: "select", group: "Sponsors", options: SPONSORSHIP_TYPES },
    { name: "audienceSize", label: "Audience size (your estimate)", type: "number", group: "Numbers you supply", min: 0, hint: "Only used in your notes and exports." },
    { name: "requestedBudget", label: "Requested budget", type: "number", group: "Numbers you supply", min: 0, hint: "Yours — never compared with an invented brand budget." },
  ],
  statuses: [
    { id: "shortlisted", label: "Shortlisted", tone: "info" },
    { id: "researching", label: "Researching", tone: "info" },
    { id: "contacted", label: "Contacted (by you)", tone: "warn", humanAction: true },
    { id: "negotiating", label: "Negotiating", tone: "ok", humanAction: true },
    { id: "declined", label: "Declined", tone: "neutral" },
  ],
  fieldLabels: FIELD_LABELS,
  keyFields: KEY_FIELDS,
  criticalFields: ["pastSponsorships", "seekingSponsorship", "contactChannel", "sponsorshipBudget"],
  columns: [col("industry", true), col("geography", true), col("website", true), col("pastSponsorships", true), col("seekingSponsorship"), col("sponsorshipTypes"), col("contactChannel"), col("audienceFocus")],
  compareRows: [col("industry"), col("geography"), col("audienceFocus"), col("pastSponsorships"), col("sponsorshipTypes"), col("seekingSponsorship"), col("contactChannel")],
  rank: (items, q, ctx) => items.map((it) => rankOne(it, q, ctx)),
  keep: (it, q) => {
    if (q.industries.length && !phraseScore(joinText(valueOf(it.fields.industry), valueOf(it.fields.audienceFocus), history(it).map((h) => h.category)), q.industries).hits.length) return false;
    return true;
  },
  describeQuery: (q) => [q.description?.slice(0, 60), q.audience, q.location, q.industries.join(", ")].filter(Boolean).join(" · ") || "All brands",
  formatField,
};
