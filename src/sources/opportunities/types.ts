/**
 * Provider adapters: the replaceable boundary between data sources and the rest of the product.
 * A provider retrieves records and normalises them into `NormalizedItem`s with field-level
 * evidence. Ranking, storage, enrichment and presentation never see a provider's raw format.
 */
import type { DataMode, ModuleId, NormalizedItem } from "@/core/opportunities/types";

export interface ProviderIO {
  now: Date;
  /** Read-only JSON GET through the safe fetcher, limited to the provider's allowed hosts. */
  getJson: (url: string) => Promise<unknown>;
  /** Shared cache for public data (only used when the provider's terms allow storage). */
  cache: { get: (key: string, maxAgeMs: number) => Promise<unknown | null>; set: (key: string, value: unknown) => Promise<void> };
}

export interface ProviderResult {
  items: NormalizedItem[];
  warnings: string[];
  cached?: boolean;
  /** What this run actually read, in plain words (e.g. "Read 1,240 releases updated since …"). */
  coverage?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  module: ModuleId;
  mode: DataMode;
  description: string;
  homepage?: string;
  /** Licence / terms the data is used under, and the attribution it requires. */
  licence?: string;
  licenceUrl?: string;
  attribution?: string;
  /** Hosts this provider may fetch from. */
  allowHosts?: readonly string[];
  /** Environment variables it needs (names only — values stay server-side). */
  requiresEnv?: readonly string[];
  /** How long a fetched page may be reused, per the provider's terms. 0 = never cache. */
  cacheTtlMs?: number;
  /** Plain statement of what may be stored and redistributed. */
  storagePolicy: string;
  /** What a search with this provider can and can't see — shown before a search and with results. */
  coverage?: () => string;
  /** One short line of the same, always visible before a live search. */
  coverageSummary?: () => string;
}

export interface Provider<Q = Record<string, unknown>> extends ProviderInfo {
  /** Whether it can run now (credentials present, enabled). Never throws. */
  available: () => { ok: true } | { ok: false; reason: string };
  search: (query: Q, io: ProviderIO) => Promise<ProviderResult>;
}

export class ProviderError extends Error {}
