/**
 * Editable interface copy for the opportunity workspace. Every user-facing sentence a reseller is
 * likely to change lives here, keyed by a stable id. A brand overrides any key in its `copy` field
 * (brand/brands.ts); missing keys fall back to these defaults.
 */
import type { ModuleId } from "@/core/opportunities/types";
import { activeBrand, type Brand } from "./brands";

export const DEFAULT_COPY = {
  "workspace.title": "Opportunities",
  "workspace.intro":
    "Search for tenders, sponsors, suppliers and expansion locations in one place. Every fact shows where it came from, unknowns stay unknown, and scores show their working. The app researches only — it never submits bids or contacts anyone.",
  "demo.banner": "Demo data: everything in this search is fictional, made to show how the product handles real-world gaps and conflicts. It is labelled as demo in every export.",
  "demo.badge": "Demo data",
  "live.badge": "Live data",
  "search.button": "Search",
  "search.pending": "Searching sources…",
  "search.empty.title": "No matches",
  "search.empty.body": "Nothing matched every filter. Try fewer keywords, a wider area or a longer deadline range.",
  "search.start.title": "Run a search to see results",
  "search.start.body": "Fill in what you're looking for and press Search. Demo mode works without any accounts or keys.",
  "results.scoreHelp": "Scores compare these results with each other using only the facts that were available. They are research aids, not predictions.",
  "detail.evidenceHelp": "Each value shows how we know it: published by the issuer, claimed by the company, independently verified, or calculated by the app.",
  "detail.noOutreach": "The app never contacts anyone. Use the source links to reach out yourself.",
  "saved.empty": "Nothing saved yet. Save results from a search, or add them to a named list.",
  "module.tenders.name": "Tenders & RFPs",
  "module.tenders.tagline": "Public and private opportunities that match your services.",
  "module.tenders.description": "Find calls for tender and RFPs, read the published requirements in the issuer's own words, and see why each one fits your company profile.",
  "module.sponsors.name": "Sponsors",
  "module.sponsors.tagline": "Brands with public evidence of relevant sponsorships.",
  "module.sponsors.description": "Find brands whose public sponsorships and audience fit your event or project, with dated evidence and their published contact channels.",
  "module.suppliers.name": "Suppliers",
  "module.suppliers.tagline": "Manufacturers, distributors and wholesalers to compare.",
  "module.suppliers.description": "Build a sourcing shortlist. Supplier claims and independently verified facts are kept apart, and anything unpublished is marked unknown.",
  "module.expansion.name": "Locations",
  "module.expansion.tagline": "Compare candidate areas with transparent, weighted scores.",
  "module.expansion.description": "Compare areas on published demographic and business data with your own criteria weights. Missing data is shown, never filled in.",
} as const;

export type CopyKey = keyof typeof DEFAULT_COPY;

export function copyFor(brand: Brand = activeBrand()) {
  const merged: Record<string, string> = { ...DEFAULT_COPY, ...(brand.copy ?? {}) } as Record<string, string>;
  const t = (key: CopyKey) => merged[key] ?? DEFAULT_COPY[key];
  const mod = (id: ModuleId, part: "name" | "tagline" | "description") => t(`module.${id}.${part}` as CopyKey);
  return { t, mod };
}
