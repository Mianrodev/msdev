/**
 * Local Expansion Finder.
 *
 * Compares candidate areas on published location data. Each metric is min–max normalised across the
 * candidates before weighting, so units don't matter and the score is relative to this set only.
 * Missing metrics are left out of an area's score (never treated as zero or as good) and lower its
 * coverage. Competitor counts from incomplete sources are shown but not scored: few results in a
 * search is not evidence of little competition. Foot traffic, demand, rents, revenue and market size
 * are never estimated.
 */
import { z } from "zod";
import { displayValue, valueOf } from "../fields";
import type { ModuleDef, RankContext } from "../module";
import { choice, commonQuery, optNum, optText } from "../query";
import { aggregate, normalize } from "../scoring";
import { includesCi } from "../text";
import type { Field, MatchResult, NormalizedItem, ScoreComponent } from "../types";

export const CUSTOMER_PROFILES = [
  ["general", "No particular customer profile"],
  ["families", "Families with children"],
  ["young_professionals", "Young professionals (25–44)"],
  ["students", "Students"],
  ["retirees", "Retirees (65+)"],
  ["affluent", "Higher-income households"],
] as const;

const weight = () => optNum(0, 5);

export const expansionQuery = z.object({
  ...commonQuery,
  category: optText(120),
  region: optText(120),
  existingArea: optText(120),
  customerProfile: choice(["general", "families", "young_professionals", "students", "retirees", "affluent"] as const, "general"),
  wPopulation: weight(),
  wGrowth: weight(),
  wIncome: weight(),
  wCustomer: weight(),
  wCompetition: weight(),
  wDensity: weight(),
  wDistance: weight(),
});
export type ExpansionQuery = z.infer<typeof expansionQuery>;

export const DEFAULT_WEIGHTS = { wPopulation: 3, wGrowth: 2, wIncome: 2, wCustomer: 3, wCompetition: 3, wDensity: 2, wDistance: 1 } as const;

export interface LatLng {
  lat: number;
  lng: number;
}

const FIELD_LABELS = {
  region: "Region",
  granularity: "Area type",
  location: "Centre point",
  population: "Population",
  populationGrowth: "Population change",
  medianIncome: "Median household income",
  shareFamilies: "Households with children",
  shareAge25to44: "Residents aged 25–44",
  shareStudents: "Students",
  shareOver65: "Residents aged 65+",
  businessDensity: "Business density",
  competitors: "Competitors (same category)",
  commercialVacancy: "Commercial vacancy rate",
} as const;

export const METRIC_KEYS = ["population", "populationGrowth", "medianIncome", "shareFamilies", "shareAge25to44", "shareStudents", "shareOver65", "businessDensity", "competitors", "commercialVacancy"] as const;

/** Facts this product does not estimate. Shown as research gaps on every area. */
export const NOT_AVAILABLE = ["Foot traffic", "Rental costs", "Customer demand", "Revenue forecast", "Market size"] as const;

const PROFILE_METRIC: Record<string, keyof typeof FIELD_LABELS | null> = {
  general: null,
  families: "shareFamilies",
  young_professionals: "shareAge25to44",
  students: "shareStudents",
  retirees: "shareOver65",
  affluent: "medianIncome",
};

const num = (it: NormalizedItem, k: string): number | null => {
  const v = valueOf(it.fields[k]);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatField(key: string, f: Field | undefined): string {
  if (key === "location") return displayValue(f, (v) => `${(v as LatLng).lat.toFixed(3)}, ${(v as LatLng).lng.toFixed(3)}`);
  const unit = f?.meta?.unit;
  const lowerBound = f?.meta?.completeness === "incomplete" ? " (incomplete source — at least this many)" : "";
  return displayValue(f, (v) => {
    if (typeof v !== "number") return String(v);
    if (unit === "%") return `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
    if (unit && /^[A-Z]{3}$/.test(unit)) return new Intl.NumberFormat("en-GB", { style: "currency", currency: unit, maximumFractionDigits: 0 }).format(v);
    return `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}${lowerBound}`;
  });
}

interface Criterion {
  key: string;
  label: string;
  weight: number;
  direction: "higher" | "lower";
  values: (number | null)[];
  /** Why a value is missing for an item, if not simply "not published". */
  why?: (i: number) => string | null;
  describe: (raw: number) => string;
}

function existingCentre(items: NormalizedItem[], q: ExpansionQuery): { centre: LatLng; name: string } | null {
  if (!q.existingArea) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q.existingArea);
  if (m) return { centre: { lat: +m[1], lng: +m[2] }, name: q.existingArea };
  const hit = items.find((it) => includesCi(it.title, q.existingArea!) || includesCi(q.existingArea!, it.title));
  const loc = hit ? (valueOf(hit.fields.location) as LatLng | null) : null;
  return hit && loc ? { centre: loc, name: hit.title } : null;
}

function rankAll(items: NormalizedItem[], q: ExpansionQuery, _ctx: RankContext): MatchResult[] {
  const w = (k: keyof typeof DEFAULT_WEIGHTS) => q[k] ?? DEFAULT_WEIGHTS[k];
  const profileMetric = PROFILE_METRIC[q.customerProfile];
  const existing = existingCentre(items, q);

  const competitionUsable = (it: NormalizedItem) => it.fields.competitors?.state === "known" && it.fields.competitors.meta?.completeness === "complete";
  const criteria: Criterion[] = [
    { key: "population", label: "Population", weight: w("wPopulation"), direction: "higher", values: items.map((it) => num(it, "population")), describe: (v) => v.toLocaleString("en-GB") },
    { key: "growth", label: "Population change", weight: w("wGrowth"), direction: "higher", values: items.map((it) => num(it, "populationGrowth")), describe: (v) => `${v}%` },
    { key: "income", label: "Median household income", weight: w("wIncome"), direction: "higher", values: items.map((it) => num(it, "medianIncome")), describe: (v) => v.toLocaleString("en-GB") },
    {
      key: "customer",
      label: profileMetric ? `Customer profile: ${FIELD_LABELS[profileMetric]}` : "Customer profile",
      weight: profileMetric ? w("wCustomer") : 0,
      direction: "higher",
      values: items.map((it) => (profileMetric ? num(it, profileMetric) : null)),
      describe: (v) => (profileMetric === "medianIncome" ? v.toLocaleString("en-GB") : `${v}%`),
    },
    {
      key: "competition",
      label: "Competitors per 10,000 residents",
      weight: w("wCompetition"),
      direction: "lower",
      values: items.map((it) => {
        const c = num(it, "competitors");
        const p = num(it, "population");
        return competitionUsable(it) && c !== null && p ? (c / p) * 10_000 : null;
      }),
      why: (i) => {
        const f = items[i].fields.competitors;
        if (f?.state === "known" && f.meta?.completeness !== "complete") return "competitor count comes from an incomplete source — not scored";
        if (!num(items[i], "population")) return "population unknown, so competitors per resident can't be calculated";
        return null;
      },
      describe: (v) => v.toFixed(1),
    },
    { key: "density", label: "Business density (activity proxy, not foot traffic)", weight: w("wDensity"), direction: "higher", values: items.map((it) => num(it, "businessDensity")), describe: (v) => `${v} per 1,000 residents` },
    {
      key: "distance",
      label: "Distance from your existing location",
      weight: existing ? w("wDistance") : 0,
      direction: "higher",
      values: items.map((it) => {
        const loc = valueOf(it.fields.location) as LatLng | null;
        return existing && loc ? Math.round(haversineKm(existing.centre, loc) * 10) / 10 : null;
      }),
      describe: (v) => `${v} km`,
    },
  ];
  const norms = criteria.map((c) => normalize(c.values, c.direction));
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);

  return items.map((it, i) => {
    const components: ScoreComponent[] = criteria.map((c, ci) => {
      const raw = c.values[i];
      const n = norms[ci][i];
      return {
        key: c.key,
        label: c.label,
        weight: c.weight,
        score: c.weight > 0 ? n : null,
        detail:
          c.weight === 0
            ? c.key === "distance" && !existing
              ? q.existingArea
                ? `Couldn't place "${q.existingArea}" among the candidate areas`
                : "No existing location given"
              : c.key === "customer" && !profileMetric
                ? "No customer profile selected"
                : "Weight set to 0"
            : raw === null
              ? `Missing — ${c.why?.(i) ?? "not published for this area"}`
              : `${c.describe(raw)} → ${Math.round((n ?? 0) * 100)}/100 relative to the other areas (${c.direction} is better)`,
      };
    });
    const agg = aggregate(components);
    const strengths = components.filter((c) => c.weight > 0 && c.score !== null && c.score >= 0.7).map((c) => `Strong on ${c.label.toLowerCase()} relative to the other candidates.`);
    const tradeoffs = components.filter((c) => c.weight > 0 && c.score !== null && c.score <= 0.3).map((c) => `Weaker on ${c.label.toLowerCase()} relative to the other candidates.`);
    const missing = components.filter((c) => c.weight > 0 && c.score === null);
    const flags: string[] = [];
    if (missing.length) flags.push(`${missing.length} weighted metric${missing.length > 1 ? "s" : ""} missing (${missing.map((m) => m.label).join(", ")}): left out of this area's score.`);
    if (totalWeight > 0 && agg.coverage < 0.6) flags.push(`Comparison incomplete: only ${Math.round(agg.coverage * 100)}% of the weight could be scored for this area.`);
    const comp = it.fields.competitors;
    if (comp?.state === "known" && comp.meta?.completeness !== "complete")
      flags.push("Competitor count is from an incomplete listing search — a low number does not mean low competition.");
    if (comp?.state === "unknown") flags.push("No competitor count available for this category.");
    for (const k of METRIC_KEYS) if (it.fields[k]?.state === "conflict") flags.push(`${FIELD_LABELS[k]}: sources disagree — see evidence.`);
    const gaps = [
      ...METRIC_KEYS.filter((k) => !it.fields[k] || it.fields[k].state === "unknown").map((k) => `${FIELD_LABELS[k]} not available for this area`),
      ...NOT_AVAILABLE.map((n) => `${n}: not estimated (no suitable source)`),
    ];
    return { ...agg, reasons: strengths, tradeoffs, flags, gaps };
  });
}

const col = (key: keyof typeof FIELD_LABELS, inTable = false) => ({
  key,
  label: FIELD_LABELS[key],
  text: (it: NormalizedItem) => formatField(key, it.fields[key]),
  inTable,
});

export const expansion: ModuleDef<ExpansionQuery> = {
  id: "expansion",
  querySchema: expansionQuery as unknown as z.ZodType<ExpansionQuery>,
  filters: [
    { name: "category", label: "Business category", type: "text", group: "Your business", placeholder: "e.g. coffee shop, gym, dental clinic" },
    { name: "region", label: "Target geography", type: "text", group: "Your business", placeholder: "e.g. Riverton metro (demo)" },
    { name: "existingArea", label: "Existing location (optional)", type: "text", group: "Your business", placeholder: "An area name, or lat,lng" },
    { name: "customerProfile", label: "Desired customer profile", type: "select", group: "Your business", options: CUSTOMER_PROFILES },
    { name: "wPopulation", label: "Population", type: "range", group: "Criteria weights (0 = ignore)", min: 0, max: 5, step: 1 },
    { name: "wGrowth", label: "Population growth", type: "range", group: "Criteria weights (0 = ignore)", min: 0, max: 5, step: 1 },
    { name: "wIncome", label: "Household income", type: "range", group: "Criteria weights (0 = ignore)", min: 0, max: 5, step: 1 },
    { name: "wCustomer", label: "Customer-profile fit", type: "range", group: "Criteria weights (0 = ignore)", min: 0, max: 5, step: 1 },
    { name: "wCompetition", label: "Fewer competitors", type: "range", group: "Criteria weights (0 = ignore)", min: 0, max: 5, step: 1 },
    { name: "wDensity", label: "Business density", type: "range", group: "Criteria weights (0 = ignore)", min: 0, max: 5, step: 1 },
    { name: "wDistance", label: "Distance from existing location", type: "range", group: "Criteria weights (0 = ignore)", min: 0, max: 5, step: 1 },
  ],
  statuses: [
    { id: "shortlisted", label: "Shortlisted", tone: "info" },
    { id: "researching", label: "Researching", tone: "info" },
    { id: "site_visit", label: "Site visit planned (by you)", tone: "warn", humanAction: true },
    { id: "preferred", label: "Preferred", tone: "ok" },
    { id: "ruled_out", label: "Ruled out", tone: "neutral" },
  ],
  fieldLabels: FIELD_LABELS,
  keyFields: METRIC_KEYS,
  criticalFields: METRIC_KEYS,
  columns: [col("region"), col("granularity"), col("population", true), col("populationGrowth", true), col("medianIncome", true), col("competitors", true), col("businessDensity", true), col("shareFamilies"), col("shareAge25to44"), col("shareStudents"), col("shareOver65"), col("commercialVacancy"), col("location")],
  compareRows: [col("granularity"), col("population"), col("populationGrowth"), col("medianIncome"), col("shareFamilies"), col("shareAge25to44"), col("shareStudents"), col("shareOver65"), col("businessDensity"), col("competitors"), col("commercialVacancy")],
  rank: rankAll,
  keep: (it, q) => !q.region || includesCi(valueOf(it.fields.region) as string, q.region) || includesCi(q.region, (valueOf(it.fields.region) as string) ?? "\u0000"),
  describeQuery: (q) => [q.category, q.region, q.customerProfile !== "general" && q.customerProfile.replace("_", " ")].filter(Boolean).join(" · ") || "All candidate areas",
  formatField,
};
