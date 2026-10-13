/**
 * Demo location sources: a fictional statistics office (demographics) and a fictional business
 * register (business density, competitor counts). Two fictional regions. Includes areas with
 * missing income data, a population figure two sources disagree on, and competitor counts that
 * come from an incomplete listings search (shown, but never read as "low competition").
 */
import { itemKey } from "@/core/opportunities/dedup";
import { combine, known, unknown } from "@/core/opportunities/fields";
import type { ExpansionQuery, LatLng } from "@/core/opportunities/modules/expansion";
import type { Evidence, Field, NormalizedItem } from "@/core/opportunities/types";
import type { Provider } from "../types";
import { DEMO_NOTE, evidenceMaker, simulateFailure } from "./common";

interface DemoArea {
  id: string;
  name: string;
  region: string;
  at: LatLng;
  population: number | null;
  populationAlt?: number;
  growth: number | null;
  income: number | null;
  families: number | null;
  age25to44: number | null;
  students: number | null;
  over65: number | null;
  vacancy: number | null;
  density: number | null;
  /** Competitor counts by category. `listing` = from an incomplete listings search. */
  competitors: Record<string, { n: number; listing?: boolean }>;
}

export const DEMO_REGIONS = ["Riverton metro (demo)", "Lakeshire county (demo)"] as const;

function areas(): DemoArea[] {
  const R = DEMO_REGIONS[0];
  const L = DEMO_REGIONS[1];
  return [
    { id: "RVT-01", name: "Old Town", region: R, at: { lat: 52.408, lng: -1.51 }, population: 18400, growth: 1.2, income: 31200, families: 22, age25to44: 38, students: 9, over65: 14, vacancy: 7.5, density: 41, competitors: { "coffee shop": { n: 14 }, gym: { n: 4 }, bakery: { n: 6 }, "dental clinic": { n: 5 } } },
    { id: "RVT-02", name: "Canal Quarter", region: R, at: { lat: 52.414, lng: -1.488 }, population: 9600, populationAlt: 11200, growth: 6.8, income: 38900, families: 18, age25to44: 47, students: 6, over65: 8, vacancy: 11.2, density: 33, competitors: { "coffee shop": { n: 5 }, gym: { n: 2 }, bakery: { n: 1 } } },
    { id: "RVT-03", name: "Northfield", region: R, at: { lat: 52.44, lng: -1.53 }, population: 24100, growth: 3.1, income: 35400, families: 34, age25to44: 29, students: 4, over65: 17, vacancy: 4.1, density: 12, competitors: { "coffee shop": { n: 2, listing: true }, gym: { n: 3 }, bakery: { n: 2 }, "dental clinic": { n: 3 } } },
    { id: "RVT-04", name: "University Park", region: R, at: { lat: 52.383, lng: -1.56 }, population: 15800, growth: 2.4, income: null, families: 9, age25to44: 24, students: 46, over65: 5, vacancy: 6.0, density: 27, competitors: { "coffee shop": { n: 11 }, gym: { n: 5 }, bakery: { n: 3 } } },
    { id: "RVT-05", name: "Hillcrest", region: R, at: { lat: 52.395, lng: -1.47 }, population: 12300, growth: 0.4, income: 52800, families: 31, age25to44: 26, students: 3, over65: 24, vacancy: 3.2, density: 9, competitors: { "coffee shop": { n: 3 }, gym: { n: 1 }, "dental clinic": { n: 4 } } },
    { id: "RVT-06", name: "Eastgate Retail Park", region: R, at: { lat: 52.41, lng: -1.43 }, population: 4100, growth: 9.5, income: 29800, families: 27, age25to44: 35, students: 5, over65: 11, vacancy: null, density: 58, competitors: { "coffee shop": { n: 6 }, gym: { n: 2 } } },
    { id: "RVT-07", name: "Southmead", region: R, at: { lat: 52.37, lng: -1.5 }, population: 21700, growth: -0.8, income: 27400, families: 36, age25to44: 30, students: 7, over65: 16, vacancy: 9.8, density: null, competitors: {} },
    { id: "RVT-08", name: "Riverside Village", region: R, at: { lat: 52.425, lng: -1.455 }, population: null, growth: null, income: 44100, families: 29, age25to44: 33, students: 2, over65: 19, vacancy: 5.5, density: 15, competitors: { "coffee shop": { n: 1, listing: true } } },
    { id: "LKS-01", name: "Lakeshire Harbour", region: L, at: { lat: 53.27, lng: -9.05 }, population: 14200, growth: 2.2, income: 36500, families: 25, age25to44: 34, students: 12, over65: 15, vacancy: 6.4, density: 30, competitors: { "coffee shop": { n: 9 }, gym: { n: 3 } } },
    { id: "LKS-02", name: "Ballymore", region: L, at: { lat: 53.31, lng: -9.0 }, population: 6900, growth: 4.9, income: 33800, families: 33, age25to44: 31, students: 3, over65: 13, vacancy: 4.0, density: 11, competitors: { "coffee shop": { n: 2 }, gym: { n: 1 } } },
    { id: "LKS-03", name: "Kilcarra", region: L, at: { lat: 53.24, lng: -9.11 }, population: 8800, growth: 1.0, income: null, families: 28, age25to44: 27, students: 5, over65: 21, vacancy: 7.7, density: 14, competitors: { "coffee shop": { n: 4, listing: true } } },
    { id: "LKS-04", name: "Westport Road", region: L, at: { lat: 53.29, lng: -9.14 }, population: 11100, growth: 3.6, income: 39900, families: 30, age25to44: 36, students: 6, over65: 12, vacancy: 8.9, density: 22, competitors: { "coffee shop": { n: 5 }, gym: { n: 2 } } },
  ];
}

const STATS_URL = "https://stats.demo-statistics.example";
const REGISTER_URL = "https://register.demo-business.example";
const PERIOD = "2025 estimates";
const GRANULARITY = "Neighbourhood (demo statistical area)";

function metric(value: number | null, ev: Evidence, unit: string, extra: Record<string, string> = {}): Field<number> {
  if (value === null) return { ...unknown<number>("Not published for this area"), meta: { unit, granularity: GRANULARITY, period: PERIOD, ...extra } };
  return { ...known(value, ev, String(value)), meta: { unit, granularity: GRANULARITY, period: PERIOD, ...extra } };
}

function base(a: DemoArea, providerId: string, sourceUrl: string, now: Date): NormalizedItem {
  return {
    module: "expansion",
    key: itemKey("expansion", { id: a.id }),
    provider: providerId,
    mode: "demo",
    title: a.name,
    subtitle: a.region,
    sourceUrl,
    retrievedAt: now.toISOString(),
    publishedAt: null,
    links: [{ label: "Area profile (demo)", url: sourceUrl, kind: "source" }],
    fields: {},
  };
}

function demographics(a: DemoArea, now: Date): NormalizedItem {
  const ev = evidenceMaker("demo-statistics-office", now);
  const url = `${STATS_URL}/area/${a.id}`;
  const e = (label: string, v: number | null) => ev("published", url, v === null ? null : `${label}: ${v}`, "2025-06-30", `Statistics office — ${label.toLowerCase()}`);
  const pop = metric(a.population, e("Population", a.population), "people");
  const it = base(a, "demo-statistics-office", url, now);
  it.fields = {
    region: known(a.region, e("Region", null)),
    granularity: known(GRANULARITY, e("Area type", null)),
    location: known(a.at, ev("published", url, `${a.at.lat}, ${a.at.lng}`, null, "Area centroid")),
    population:
      a.populationAlt !== undefined
        ? { ...combine(pop, known(a.populationAlt, ev("third_party", `${REGISTER_URL}/area/${a.id}`, `Residents: ${a.populationAlt}`, "2024-12-31", "Business register — residents (2024)"), String(a.populationAlt))), meta: pop.meta }
        : pop,
    populationGrowth: metric(a.growth, e("Population change 2020–2025", a.growth), "%", { period: "2020–2025" }),
    medianIncome: metric(a.income, e("Median household income", a.income), "GBP"),
    shareFamilies: metric(a.families, e("Households with children", a.families), "%"),
    shareAge25to44: metric(a.age25to44, e("Residents aged 25–44", a.age25to44), "%"),
    shareStudents: metric(a.students, e("Full-time students", a.students), "%"),
    shareOver65: metric(a.over65, e("Residents aged 65+", a.over65), "%"),
  };
  return it;
}

function business(a: DemoArea, category: string | undefined, now: Date): NormalizedItem {
  const ev = evidenceMaker("demo-business-register", now);
  const url = `${REGISTER_URL}/area/${a.id}`;
  const it = base(a, "demo-business-register", url, now);
  const cat = (category ?? "").trim().toLowerCase();
  const c = cat ? a.competitors[cat] : undefined;
  const competitors: Field<number> = !cat
    ? { ...unknown("Enter a business category to count competitors"), meta: { unit: "businesses" } }
    : !c
      ? { ...unknown(`No count for “${category}” in this area`), meta: { unit: "businesses", category: cat } }
      : {
          ...known(c.n, ev(c.listing ? "third_party" : "published", c.listing ? `https://listings.demo-maps.example/search?q=${encodeURIComponent(cat)}&area=${a.id}` : url, `${c.n} ${cat} businesses`, c.listing ? null : "2025-09-30", c.listing ? "Listings search (incomplete)" : "Business register count"), String(c.n)),
          meta: { unit: "businesses", category: cat, completeness: c.listing ? "incomplete" : "complete", granularity: GRANULARITY, period: c.listing ? "Search on retrieval date" : "Register at 30 Sep 2025" },
        };
  it.fields = {
    businessDensity: metric(a.density, ev("published", url, a.density === null ? null : `${a.density} registered businesses per 1,000 residents`, "2025-09-30", "Business register — density"), "per 1,000 residents", { period: "Register at 30 Sep 2025" }),
    competitors,
    commercialVacancy: metric(a.vacancy, ev("published", url, a.vacancy === null ? null : `Commercial vacancy: ${a.vacancy}%`, "2025-09-30", "Business register — vacancy"), "%", { period: "Register at 30 Sep 2025" }),
  };
  return it;
}

const common = {
  module: "expansion" as const,
  mode: "demo" as const,
  licence: "Fictional demo data",
  storagePolicy: "Fictional; may be stored and exported freely, always labelled as demo.",
  available: () => ({ ok: true as const }),
};

export const demoStatisticsOffice: Provider<ExpansionQuery> = {
  ...common,
  id: "demo-statistics-office",
  name: "Demo Statistics Office",
  description: `${DEMO_NOTE} Simulates small-area population and household statistics.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "primary");
    return { items: areas().map((a) => demographics(a, io.now)), warnings: [] };
  },
};

export const demoBusinessRegister: Provider<ExpansionQuery> = {
  ...common,
  id: "demo-business-register",
  name: "Demo Business Register",
  description: `${DEMO_NOTE} Simulates a business register (counts by category) plus an incomplete listings search.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "secondary");
    return { items: areas().map((a) => business(a, q.category, io.now)), warnings: [] };
  },
};
