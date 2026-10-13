/**
 * The contract every discovery module implements. Shared UI, storage, export and comparison work
 * from this; each module keeps its own data model, filters and ranking logic.
 */
import type { z } from "zod";
import type { Field, MatchResult, ModuleId, NormalizedItem } from "./types";

/** The user's company, used to explain matches (mainly for tenders). Stored per workspace. */
export interface CompanyProfile {
  companyName: string;
  description: string;
  services: string[];
  categories: string[];
  regions: string[];
  certifications: string[];
  minContractValue: number | null;
  maxContractValue: number | null;
  currency: string | null;
  /** Days the company needs to prepare a bid; shorter deadlines are flagged. */
  minPrepDays: number;
}

export const EMPTY_PROFILE: CompanyProfile = {
  companyName: "",
  description: "",
  services: [],
  categories: [],
  regions: [],
  certifications: [],
  minContractValue: null,
  maxContractValue: null,
  currency: null,
  minPrepDays: 14,
};

export interface RankContext {
  now: Date;
  profile: CompanyProfile;
}

export type Tone = "neutral" | "info" | "ok" | "warn" | "bad";

export interface StatusDef {
  id: string;
  label: string;
  tone: Tone;
  /** Statuses that record something the user did outside the app (the app never does it). */
  humanAction?: boolean;
}

export interface Column {
  key: string;
  label: string;
  /** Plain text for tables and CSV. */
  text: (item: NormalizedItem) => string;
  /** Whether to show in the compact results table (CSV always has every column). */
  inTable?: boolean;
}

export interface FilterDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "range";
  hint?: string;
  placeholder?: string;
  options?: readonly (readonly [string, string])[];
  /** Group label in the filter panel ("What", "Where", "When", "Money", …). */
  group: string;
  min?: number;
  max?: number;
  step?: number;
  /** Only shown in demo mode (simulation switches). */
  demoOnly?: boolean;
  wide?: boolean;
}

export interface ModuleDef<Q = Record<string, unknown>> {
  id: ModuleId;
  querySchema: z.ZodType<Q>;
  filters: FilterDef[];
  statuses: readonly StatusDef[];
  /** Labels for every field key, in display order. */
  fieldLabels: Record<string, string>;
  /** Fields used for the evidence-completeness indicator. */
  keyFields: readonly string[];
  /** Fields that are consequential and must show original wording + source beside the value. */
  criticalFields: readonly string[];
  columns: Column[];
  compareRows: Column[];
  /** Rank a whole result set (some modules normalise across candidates). Returns one result per item, same order. */
  rank: (items: NormalizedItem[], query: Q, ctx: RankContext) => MatchResult[];
  /** Drop items that definitely fail a hard filter. Items that can't be checked stay (and get flagged by rank). */
  keep: (item: NormalizedItem, query: Q, ctx: RankContext) => boolean;
  /** One-line human summary of the query, for search history. */
  describeQuery: (query: Q) => string;
  formatField: (key: string, field: Field | undefined) => string;
}
