/**
 * Shared vocabulary for the opportunity-discovery product (tenders, sponsors, suppliers, locations).
 *
 * Every fact about an external record is a `Field`: a normalised value, the source's own wording,
 * whether it is known / unknown / in conflict, and the evidence behind it. Nothing here guesses —
 * a value nobody published stays `unknown`, and two sources that disagree stay a `conflict`.
 */

export const MODULE_IDS = ["tenders", "sponsors", "suppliers", "expansion"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export function isModuleId(v: unknown): v is ModuleId {
  return typeof v === "string" && (MODULE_IDS as readonly string[]).includes(v);
}

/** Demo data is fictional and always labelled; live data comes from a real provider. They never mix. */
export type DataMode = "demo" | "live";

/**
 * How much weight a piece of evidence carries:
 *  - published:              stated by the issuing organisation in the original notice/page
 *  - supplier_claim:         the company says it about itself (website, catalogue, profile)
 *  - independently_verified: confirmed by a third party that checks it (a registry, a certifier's list)
 *  - third_party:            reported by someone else (news, a partner's page) — not a verification
 *  - computed:               calculated by this app with deterministic rules from other fields
 *  - ai_summary:             written by an AI model from the sources — never authoritative
 *  - user_input:             typed by the user
 */
export const EVIDENCE_KINDS = [
  "published",
  "supplier_claim",
  "independently_verified",
  "third_party",
  "computed",
  "ai_summary",
  "user_input",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  published: "Published by the issuer",
  supplier_claim: "Claimed by the company",
  independently_verified: "Independently verified",
  third_party: "Reported by a third party",
  computed: "Calculated by the app",
  ai_summary: "AI summary",
  user_input: "Entered by you",
};

/** Provenance of one claim: where it came from and when. */
export interface Evidence {
  kind: EvidenceKind;
  provider: string;
  sourceUrl: string | null;
  /** When this app retrieved it (ISO). */
  retrievedAt: string;
  /** When the source published it, if the source says (ISO date or datetime). */
  publishedAt: string | null;
  /** The source's own words, kept verbatim for consequential claims. */
  quote: string | null;
  /** Optional label, e.g. "Notice", "Attachment: Specification.pdf", "Registry entry". */
  label?: string;
}

export type FieldState = "known" | "unknown" | "conflict";

export interface Field<T = unknown> {
  state: FieldState;
  /** Normalised value (null when unknown; the first/preferred value when in conflict). */
  value: T | null;
  /** The source's wording of the value, verbatim. */
  raw: string | null;
  evidence: Evidence[];
  /** When state is "conflict": every competing value with its own evidence. */
  alternatives?: { value: T | null; raw: string | null; evidence: Evidence[] }[];
  /** Short note shown next to the value, e.g. "timezone not stated". */
  note?: string;
  /** Extra facts about the value itself, e.g. {unit, granularity, period, completeness} for a location metric. */
  meta?: Record<string, string>;
}

export type Fields = Record<string, Field>;

export interface Link {
  label: string;
  url: string;
  kind: "notice" | "attachment" | "website" | "contact" | "source" | "submission" | "other";
}

/**
 * One normalised record as a provider hands it over — before ranking or storage.
 * `key` is the provider-independent dedup key (see core/opportunities/dedup.ts).
 */
export interface NormalizedItem {
  module: ModuleId;
  key: string;
  provider: string;
  mode: DataMode;
  title: string;
  subtitle: string | null;
  sourceUrl: string | null;
  retrievedAt: string;
  publishedAt: string | null;
  fields: Fields;
  links: Link[];
}

/** One part of a score. `score` is 0..1, or null when the inputs aren't known (it then counts for nothing). */
export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  detail: string;
}

export interface MatchResult {
  /** 0–100 over the components that could be scored, or null when none could. */
  score: number | null;
  /** Share of the total weight that could be scored (0..1). Low coverage = a less reliable comparison. */
  coverage: number;
  components: ScoreComponent[];
  /** Plain sentences: why it matched. */
  reasons: string[];
  /** Things to check: missing data, conflicts, deadlines passed, unverified claims. */
  flags: string[];
  /** True when the item is excluded by a hard filter but kept visible (e.g. deadline passed). */
  excluded?: string | null;
  /** Weaker points relative to the other candidates (location comparisons). */
  tradeoffs?: string[];
  /** Facts nobody has published that would change the picture. */
  gaps?: string[];
}

export type SearchStatus = "complete" | "partial" | "failed";

export interface ProviderRun {
  provider: string;
  name: string;
  ok: boolean;
  count: number;
  error?: string;
  /** e.g. "Only the 300 most recently updated notices were checked." */
  warnings?: string[];
  cached?: boolean;
  ms?: number;
}
