/**
 * Tender and RFP Finder.
 *
 * Published requirements (eligibility, documents, deadlines, budgets) are always shown in the
 * issuer's own words beside any normalised value. The app never states that an opportunity is open
 * beyond what the source says plus a deterministic deadline check, and never fills in a budget,
 * deadline or eligibility rule that wasn't published.
 */
import { z } from "zod";
import { checkDeadline, deadlineInRange, fmtDate, type Deadline } from "../dates";
import { displayValue, valueOf } from "../fields";
import { fmtMoney, moneyFits, type Money } from "../money";
import type { ModuleDef, RankContext } from "../module";
import { choice, commonQuery, flag, list, optDate, optNum, optText } from "../query";
import { aggregate } from "../scoring";
import { includesCi, joinText, phraseScore, phrases } from "../text";
import type { Field, MatchResult, NormalizedItem, ScoreComponent } from "../types";

export const TENDER_TYPES = [
  ["any", "Any type"],
  ["services", "Services"],
  ["goods", "Goods / supplies"],
  ["works", "Works / construction"],
  ["framework", "Framework agreement"],
  ["rfp", "RFP / request for proposals"],
  ["rfq", "RFQ / request for quotation"],
] as const;

export const tenderQuery = z.object({
  ...commonQuery,
  keywords: list(15),
  categories: list(10),
  geography: optText(200),
  buyer: optText(200),
  deadlineFrom: optDate(),
  deadlineTo: optDate(),
  budgetMin: optNum(),
  budgetMax: optNum(),
  currency: optText(3),
  type: choice(["any", "services", "goods", "works", "framework", "rfp", "rfq"] as const, "any"),
  includeClosed: flag(),
  hideNoBudget: flag(),
});
export type TenderQuery = z.infer<typeof tenderQuery>;

const FIELD_LABELS = {
  buyer: "Issuing organisation",
  reference: "Notice reference",
  noticeStatus: "Status according to the source",
  opportunityType: "Opportunity type",
  procedure: "Procedure",
  category: "Categories",
  geography: "Location / delivery area",
  summary: "Summary (published)",
  scope: "Scope / lots (published)",
  publishedOn: "Published",
  deadline: "Submission deadline",
  clarificationDeadline: "Clarification deadline",
  budget: "Budget / estimated value",
  eligibility: "Eligibility & selection criteria (published)",
  requiredDocuments: "Required documents",
  submissionMethod: "Submission method",
  attachments: "Attachments",
} as const;

const KEY_FIELDS = ["buyer", "summary", "publishedOn", "deadline", "budget", "eligibility", "requiredDocuments", "submissionMethod", "geography", "category"] as const;

const deadlineOf = (it: NormalizedItem): Deadline | null => valueOf(it.fields.deadline as Field<Deadline>);
const budgetOf = (it: NormalizedItem): Money | null => valueOf(it.fields.budget as Field<Money>);

function asList(f: Field | undefined): string[] {
  const v = valueOf(f);
  return Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
}

function formatField(key: string, f: Field | undefined): string {
  if (key === "deadline" || key === "clarificationDeadline") {
    return displayValue(f, (v) => {
      const d = v as Deadline;
      if (!d.date) return d.raw;
      return `${fmtDate(d.date)}${d.time ? ` ${d.time}` : ""} ${d.timezone ?? "(timezone not stated)"}`.trim();
    });
  }
  if (key === "budget") return displayValue(f, (v) => fmtMoney(v as Money));
  if (key === "publishedOn") return displayValue(f, (v) => fmtDate(String(v)));
  return displayValue(f);
}

/** Certification-like phrases a notice may require. Only these are compared — deterministic, no AI. */
const CERT_PATTERNS: [RegExp, string][] = [
  [/\biso\s*9001\b/i, "ISO 9001"],
  [/\biso\s*14001\b/i, "ISO 14001"],
  [/\biso\s*(?:\/iec\s*)?27001\b/i, "ISO 27001"],
  [/\biso\s*45001\b/i, "ISO 45001"],
  [/\bcyber essentials plus\b/i, "Cyber Essentials Plus"],
  [/\bcyber essentials\b(?!\s+plus)/i, "Cyber Essentials"],
  [/\bsoc\s*2\b/i, "SOC 2"],
  [/\bgdpr\b/i, "GDPR compliance"],
  [/\bsafe ?contractor\b/i, "SafeContractor"],
  [/\bchas\b/i, "CHAS"],
  [/\bconstructionline\b/i, "Constructionline"],
  [/\bfca\b|financial conduct authority/i, "FCA authorisation"],
  [/\bhipaa\b/i, "HIPAA"],
  [/\bfedramp\b/i, "FedRAMP"],
];

export function requiredCertifications(text: string): string[] {
  return CERT_PATTERNS.filter(([re]) => re.test(text)).map(([, name]) => name);
}

function typeMatches(it: NormalizedItem, type: string): boolean | null {
  if (type === "any") return true;
  const t = joinText(valueOf(it.fields.opportunityType), valueOf(it.fields.procedure), it.title).toLowerCase();
  if (!t.trim()) return null;
  const words: Record<string, RegExp> = {
    services: /service/,
    goods: /goods|suppl(y|ies)|equipment|products?/,
    works: /works|construction|build/,
    framework: /framework|dynamic purchasing|dps/,
    rfp: /\brfp\b|request for proposal|proposals?/,
    rfq: /\brfq\b|request for quot|quotation/,
  };
  return words[type]?.test(t) ?? null;
}

function keep(it: NormalizedItem, q: TenderQuery, ctx: { now: Date }): boolean {
  if (q.buyer && !includesCi(valueOf(it.fields.buyer) as string, q.buyer)) return false;
  if (typeMatches(it, q.type) === false) return false;
  if (deadlineInRange(deadlineOf(it), q.deadlineFrom, q.deadlineTo) === false) return false;
  const fits = moneyFits(budgetOf(it), { min: q.budgetMin, max: q.budgetMax, currency: q.currency });
  if (fits === false) return false;
  if (q.hideNoBudget && !budgetOf(it)) return false;
  if (!q.includeClosed && checkDeadline(deadlineOf(it), ctx.now).status === "passed") return false;
  if (q.geography) {
    const where = joinText(asList(it.fields.geography), valueOf(it.fields.buyer)).toLowerCase();
    // Unknown location stays in (flagged by rank); a known location elsewhere is filtered out.
    if (where.trim() && it.fields.geography?.state !== "unknown" && !phrases(q.geography).some((g) => where.includes(g.toLowerCase())))
      return false;
  }
  if (q.keywords.length) {
    const text = joinText(it.title, valueOf(it.fields.summary), valueOf(it.fields.scope), asList(it.fields.category));
    if (!phraseScore(text, q.keywords).hits.length) return false;
  }
  return true;
}

function rankOne(it: NormalizedItem, q: TenderQuery, ctx: RankContext): MatchResult {
  const p = ctx.profile;
  const reasons: string[] = [];
  const flags: string[] = [];
  const text = joinText(it.title, valueOf(it.fields.summary), valueOf(it.fields.scope), asList(it.fields.category));
  const c: ScoreComponent[] = [];

  const kw = phraseScore(text, q.keywords);
  c.push({ key: "keywords", label: "Search keywords", weight: 20, score: kw.score, detail: kw.score === null ? "No keywords given" : `Matched ${kw.hits.length} of ${q.keywords.length}: ${kw.hits.join(", ") || "none"}` });
  if (kw.hits.length) reasons.push(`Mentions ${kw.hits.map((h) => `“${h}”`).join(", ")}.`);

  const svc = phraseScore(text, p.services);
  c.push({ key: "services", label: "Your services (profile)", weight: 25, score: svc.score === null ? null : Math.min(1, svc.hits.length / Math.min(3, p.services.length)), detail: svc.score === null ? "Add services to your company profile to score this" : `Matches your services: ${svc.hits.join(", ") || "none"}` });
  if (svc.hits.length) reasons.push(`Matches your listed services: ${svc.hits.join(", ")}.`);

  const wantedCats = [...q.categories, ...p.categories];
  const cats = asList(it.fields.category);
  const cat = wantedCats.length ? phraseScore(joinText(cats, it.title), wantedCats) : { score: null, hits: [] };
  c.push({ key: "category", label: "Categories", weight: 10, score: cats.length || it.fields.category?.state !== "unknown" ? (cat.score === null ? null : cat.hits.length ? 1 : 0) : null, detail: wantedCats.length ? `Wanted ${wantedCats.join(", ")}; notice lists ${cats.join(", ") || "none"}` : "No categories chosen" });

  const regions = [...phrases(q.geography ?? ""), ...p.regions];
  const where = asList(it.fields.geography);
  let geo: number | null = null;
  if (regions.length && where.length) geo = regions.some((r) => where.some((w) => includesCi(w, r) || includesCi(r, w))) ? 1 : 0;
  if (regions.length && !where.length) flags.push("Location / delivery area not published.");
  c.push({ key: "geography", label: "Geography", weight: 15, score: geo, detail: !regions.length ? "No regions chosen" : where.length ? `Notice: ${where.join(", ")}` : "Not published" });
  if (geo === 1) reasons.push(`Delivery area matches ${regions.join(" / ")}.`);

  const budget = budgetOf(it);
  const range = q.budgetMin != null || q.budgetMax != null ? { min: q.budgetMin, max: q.budgetMax, currency: q.currency } : { min: p.minContractValue, max: p.maxContractValue, currency: p.currency };
  const bf = range.min == null && range.max == null ? null : moneyFits(budget, range);
  if (!budget) flags.push("Budget not published — no value was assumed.");
  else if (bf === null && (range.min != null || range.max != null)) flags.push(`Budget is in ${budget.currency ?? "an unstated currency"}; not compared with your range (no currency conversion).`);
  if (it.fields.budget?.state === "conflict") flags.push("Sources state different budgets — see evidence.");
  c.push({ key: "budget", label: "Budget fit", weight: 10, score: bf === null ? null : bf ? 1 : 0, detail: budget ? `${fmtMoney(budget)} (published)` : "Not published" });

  const dl = checkDeadline(deadlineOf(it), ctx.now);
  let dScore: number | null = null;
  let excluded: string | null = null;
  if (dl.status === "passed") {
    dScore = 0;
    excluded = "Deadline passed";
  } else if (dl.status === "uncertain") {
    dScore = 0.1;
    flags.push("The deadline may already have passed: the notice doesn't give a time or timezone.");
  } else if (dl.daysLeft !== null) {
    dScore = Math.min(1, dl.daysLeft / Math.max(1, p.minPrepDays));
    if (dl.daysLeft < p.minPrepDays) flags.push(`Only ${dl.label.replace(" left", "")} to prepare (you need about ${p.minPrepDays}).`);
  } else flags.push("Deadline not published or unreadable — check the original notice.");
  const d = deadlineOf(it);
  if (d?.notes.length) flags.push(...d.notes.map((n) => `Deadline: ${n}.`));
  c.push({ key: "deadline", label: "Time to prepare", weight: 15, score: dScore, detail: dl.label });

  const status = valueOf(it.fields.noticeStatus) as string | null;
  if (status && /active|open/i.test(status) && dl.status === "passed") flags.push("The source still lists this as open, but its published deadline has passed.");
  if (status && /cancel|closed|withdrawn|complete|award/i.test(status)) {
    excluded ??= `Source status: ${status}`;
    flags.push(`The source lists this as “${status}”.`);
  }

  const elig = joinText(asList(it.fields.eligibility));
  let eScore: number | null = null;
  if (!elig.trim()) flags.push("Eligibility not published in the notice data — read the full notice.");
  else {
    const req = requiredCertifications(elig);
    if (req.length) {
      const have = req.filter((r) => p.certifications.some((h) => includesCi(h, r) || includesCi(r, h)));
      const missing = req.filter((r) => !have.includes(r));
      eScore = have.length / req.length;
      if (missing.length) flags.push(`Notice mentions ${missing.join(", ")} — not in your profile.`);
      if (have.length) reasons.push(`You hold ${have.join(", ")}, which the notice mentions.`);
    }
  }
  c.push({ key: "eligibility", label: "Certifications mentioned", weight: 5, score: eScore, detail: elig.trim() ? (eScore === null ? "No recognised certifications mentioned" : "Compared with your profile's certifications") : "Not published" });

  if (it.fields.requiredDocuments?.state === "unknown") flags.push("Required documents not listed — expect them in the tender pack.");

  const agg = aggregate(c);
  if (!p.services.length) flags.push("Your company profile has no services yet, so matching uses only the search.");
  return { ...agg, reasons, flags: [...new Set(flags)], excluded };
}

const col = (key: keyof typeof FIELD_LABELS, inTable = false) => ({
  key,
  label: FIELD_LABELS[key],
  text: (it: NormalizedItem) => formatField(key, it.fields[key]),
  inTable,
});

export const tenders: ModuleDef<TenderQuery> = {
  id: "tenders",
  querySchema: tenderQuery as unknown as z.ZodType<TenderQuery>,
  filters: [
    { name: "keywords", label: "Keywords", type: "text", group: "What", placeholder: "e.g. website redesign, accessibility audit", hint: "Comma-separated. Every word of a phrase must appear.", wide: true },
    { name: "categories", label: "Service categories", type: "text", group: "What", placeholder: "e.g. IT services, consulting" },
    { name: "type", label: "Opportunity type", type: "select", group: "What", options: TENDER_TYPES },
    { name: "geography", label: "Geography", type: "text", group: "Where", placeholder: "e.g. Scotland, Yorkshire, UK" },
    { name: "buyer", label: "Buyer / issuing organisation", type: "text", group: "Where", placeholder: "e.g. council, NHS" },
    { name: "deadlineFrom", label: "Deadline from", type: "date", group: "When" },
    { name: "deadlineTo", label: "Deadline to", type: "date", group: "When" },
    { name: "includeClosed", label: "Include notices whose deadline has passed", type: "checkbox", group: "When" },
    { name: "budgetMin", label: "Budget from", type: "number", group: "Money", min: 0 },
    { name: "budgetMax", label: "Budget to", type: "number", group: "Money", min: 0 },
    { name: "currency", label: "Currency", type: "select", group: "Money", options: [["", "Any (no comparison across currencies)"], ["GBP", "GBP"], ["EUR", "EUR"], ["USD", "USD"]], hint: "Budgets are only compared within one currency." },
    { name: "hideNoBudget", label: "Hide notices without a published budget", type: "checkbox", group: "Money" },
  ],
  statuses: [
    { id: "saved", label: "Saved", tone: "info" },
    { id: "reviewing", label: "Reviewing", tone: "info" },
    { id: "preparing", label: "Preparing", tone: "warn" },
    { id: "submitted", label: "Submitted (by you)", tone: "ok", humanAction: true },
    { id: "dismissed", label: "Dismissed", tone: "neutral" },
  ],
  fieldLabels: FIELD_LABELS,
  keyFields: KEY_FIELDS,
  criticalFields: ["deadline", "clarificationDeadline", "budget", "eligibility", "requiredDocuments", "submissionMethod", "noticeStatus"],
  columns: [
    col("buyer", true),
    col("deadline", true),
    col("budget", true),
    col("geography", true),
    col("opportunityType", true),
    col("noticeStatus"),
    col("publishedOn"),
    col("category"),
    col("reference"),
    col("submissionMethod"),
    col("eligibility"),
    col("requiredDocuments"),
    col("summary"),
  ],
  compareRows: [
    col("buyer"),
    col("noticeStatus"),
    col("deadline"),
    col("budget"),
    col("geography"),
    col("opportunityType"),
    col("eligibility"),
    col("requiredDocuments"),
    col("submissionMethod"),
    col("publishedOn"),
  ],
  rank: (items, q, ctx) => items.map((it) => rankOne(it, q, ctx)),
  keep,
  describeQuery: (q) =>
    [q.keywords.join(", "), q.categories.join(", "), q.geography, q.buyer && `buyer: ${q.buyer}`, q.type !== "any" && q.type, (q.deadlineFrom || q.deadlineTo) && `deadline ${q.deadlineFrom ?? "…"}–${q.deadlineTo ?? "…"}`]
      .filter(Boolean)
      .join(" · ") || "All opportunities",
  formatField,
};
