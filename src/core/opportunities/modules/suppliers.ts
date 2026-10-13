/**
 * Supplier and Manufacturer Finder.
 *
 * Separates what a supplier says about itself from what a third party has verified. Missing facts
 * read "Unknown". A certification is only "verified" with an independent source; the app never
 * labels a supplier trustworthy.
 */
import { z } from "zod";
import { fmtDate } from "../dates";
import { completeness, displayValue, valueOf } from "../fields";
import type { ModuleDef, RankContext } from "../module";
import { choice, commonQuery, flag, list, optNum, optText } from "../query";
import { aggregate } from "../scoring";
import { includesCi, joinText, phraseScore, phrases } from "../text";
import type { Field, MatchResult, NormalizedItem, ScoreComponent } from "../types";

export const SUPPLIER_TYPES = [
  ["any", "Any"],
  ["manufacturer", "Manufacturer"],
  ["distributor", "Distributor"],
  ["wholesaler", "Wholesaler"],
  ["unknown", "Unknown / not stated"],
] as const;

export const supplierQuery = z.object({
  ...commonQuery,
  product: optText(300),
  region: optText(200),
  supplierType: choice(["any", "manufacturer", "distributor", "wholesaler", "unknown"] as const, "any"),
  maxMoq: optNum(0, 1e9),
  capabilities: list(12),
  certifications: list(10),
  privateLabel: flag(),
  customization: flag(),
});
export type SupplierQuery = z.infer<typeof supplierQuery>;

export interface Moq {
  quantity: number;
  unit: string;
}

export interface CertificationClaim {
  name: string;
  /** "independently_verified" only with a third-party source (certifier register, accreditation body). */
  status: "independently_verified" | "supplier_claim";
  sourceUrl: string | null;
  checkedAt: string | null;
  note?: string;
}

const FIELD_LABELS = {
  location: "Location",
  country: "Country",
  supplierType: "Supplier type",
  products: "Products",
  capabilities: "Manufacturing capabilities",
  moq: "Minimum order quantity",
  leadTime: "Lead time",
  pricing: "Published pricing",
  certifications: "Certifications",
  privateLabel: "Private label",
  customization: "Customisation / OEM",
  contactChannel: "Public business contact",
  website: "Website",
  lastChecked: "Last checked",
} as const;

export const SUPPLIER_KEY_FIELDS = ["location", "supplierType", "products", "capabilities", "moq", "leadTime", "pricing", "certifications", "privateLabel", "contactChannel"] as const;

const certs = (it: NormalizedItem): CertificationClaim[] => (valueOf(it.fields.certifications as Field<CertificationClaim[]>) ?? []) as CertificationClaim[];

function moqOf(it: NormalizedItem): { worst: Moq | null; conflict: boolean } {
  const f = it.fields.moq as Field<Moq> | undefined;
  if (!f || f.state === "unknown") return { worst: null, conflict: false };
  if (f.state === "conflict" && f.alternatives) {
    const vals = f.alternatives.map((a) => a.value).filter((v): v is Moq => !!v);
    return { worst: vals.reduce((a, b) => (b.quantity > a.quantity ? b : a)), conflict: true };
  }
  return { worst: f.value, conflict: false };
}

function formatField(key: string, f: Field | undefined): string {
  if (key === "moq") return displayValue(f, (v) => `${(v as Moq).quantity.toLocaleString("en-GB")} ${(v as Moq).unit}`);
  if (key === "certifications")
    return displayValue(f, (v) =>
      (v as CertificationClaim[]).map((c) => `${c.name} (${c.status === "independently_verified" ? "independently verified" : c.sourceUrl ? "claimed by supplier" : "claimed, no source"})`).join("; "),
    );
  if (key === "privateLabel" || key === "customization") return displayValue(f, (v) => (v ? "Offered (claimed by supplier)" : "Not offered"));
  if (key === "lastChecked") return displayValue(f, (v) => fmtDate(String(v)));
  if (key === "contactChannel") return displayValue(f, (v) => `${(v as { label: string }).label}: ${(v as { value: string }).value}`);
  return displayValue(f);
}

/** Certification support: verified 1, claimed with a source 0.5, claimed without a source 0.25, absent 0. */
export function certificationScore(claims: CertificationClaim[], wanted: string[]): { score: number | null; detail: string[] } {
  if (!wanted.length) return { score: null, detail: [] };
  const detail: string[] = [];
  const per = wanted.map((w): number => {
    const c = claims.find((x) => includesCi(x.name, w) || includesCi(w, x.name));
    if (!c) {
      detail.push(`${w}: not found`);
      return 0;
    }
    if (c.status === "independently_verified") {
      detail.push(`${w}: independently verified`);
      return 1;
    }
    detail.push(`${w}: claimed by supplier${c.sourceUrl ? "" : " (no source)"}`);
    return c.sourceUrl ? 0.5 : 0.25;
  });
  return { score: per.reduce((s, v) => s + v, 0) / per.length, detail };
}

function rankOne(it: NormalizedItem, q: SupplierQuery, _ctx: RankContext): MatchResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  const c: ScoreComponent[] = [];
  const prodText = joinText(it.title, valueOf(it.fields.products), valueOf(it.fields.capabilities));

  const prod = q.product ? phraseScore(prodText, phrases(q.product)) : { score: null, hits: [] as string[] };
  c.push({ key: "product", label: "Product / material", weight: 30, score: prod.score, detail: q.product ? `Matched: ${prod.hits.join(", ") || "none"}` : "No product given" });
  if (prod.hits.length) reasons.push(`Lists ${prod.hits.join(", ")}.`);

  const where = joinText(valueOf(it.fields.location), valueOf(it.fields.country));
  let r: number | null = null;
  if (q.region) r = where.trim() ? (phrases(q.region).some((x) => includesCi(where, x)) ? 1 : 0) : null;
  c.push({ key: "region", label: "Country / region", weight: 15, score: r, detail: q.region ? where.trim() || "Location unknown" : "No region given" });

  const type = valueOf(it.fields.supplierType) as string | null;
  let t: number | null = null;
  if (q.supplierType !== "any") t = !type || type === "unknown" ? null : type === q.supplierType ? 1 : 0;
  if (!type || type === "unknown") flags.push("Supplier type not stated.");
  c.push({ key: "type", label: "Supplier type", weight: 10, score: t, detail: type ?? "Unknown" });

  const { worst, conflict } = moqOf(it);
  let m: number | null = null;
  if (q.maxMoq != null) m = worst ? (worst.quantity <= q.maxMoq ? 1 : worst.quantity <= q.maxMoq * 2 ? 0.3 : 0) : null;
  if (!worst) flags.push("Minimum order quantity not published.");
  if (conflict) flags.push("Sources state different minimum order quantities — the higher one is used for comparison.");
  c.push({ key: "moq", label: "Minimum order fit", weight: 15, score: m, detail: worst ? `${worst.quantity.toLocaleString("en-GB")} ${worst.unit}${conflict ? " (highest stated)" : ""}` : "Unknown" });

  const cap = phraseScore(prodText, q.capabilities);
  c.push({ key: "capabilities", label: "Required capabilities", weight: 15, score: cap.score, detail: q.capabilities.length ? `Matched: ${cap.hits.join(", ") || "none"}` : "None required" });

  const cs = certificationScore(certs(it), q.certifications);
  c.push({ key: "certifications", label: "Certifications", weight: 10, score: cs.score, detail: cs.detail.join("; ") || "None required" });
  for (const d of cs.detail) if (/claimed/.test(d)) flags.push(`${d} — not independently verified.`);

  const needs = [q.privateLabel && "privateLabel", q.customization && "customization"].filter(Boolean) as string[];
  let cu: number | null = null;
  if (needs.length) {
    const vals = needs.map((k): number | null => (it.fields[k]?.state === "known" ? (it.fields[k].value ? 1 : 0) : null));
    const knownVals = vals.filter((v): v is number => v !== null);
    cu = knownVals.length ? knownVals.reduce((a, b) => a + b, 0) / knownVals.length : null;
    if (vals.some((v) => v === null)) flags.push("Customisation / private-label availability not stated.");
  }
  c.push({ key: "customization", label: "Customisation / private label", weight: 5, score: cu, detail: needs.length ? needs.join(", ") : "Not required" });

  const comp = completeness(it.fields, SUPPLIER_KEY_FIELDS);
  if (comp.ratio < 0.6) flags.push(`Evidence is thin: ${comp.missing.length} of ${comp.total} key facts are unknown.`);
  const verified = certs(it).filter((x) => x.status === "independently_verified");
  if (verified.length) reasons.push(`${verified.map((v) => v.name).join(", ")} independently verified.`);
  return { ...aggregate(c), reasons, flags: [...new Set(flags)] };
}

const col = (key: keyof typeof FIELD_LABELS, inTable = false) => ({
  key,
  label: FIELD_LABELS[key],
  text: (it: NormalizedItem) => formatField(key, it.fields[key]),
  inTable,
});

export const suppliers: ModuleDef<SupplierQuery> = {
  id: "suppliers",
  querySchema: supplierQuery as unknown as z.ZodType<SupplierQuery>,
  filters: [
    { name: "product", label: "Product or material", type: "text", group: "What", placeholder: "e.g. recycled PET bottles, organic cotton tote bags", wide: true },
    { name: "capabilities", label: "Required capabilities", type: "text", group: "What", placeholder: "e.g. screen printing, injection moulding" },
    { name: "certifications", label: "Certifications", type: "text", group: "What", placeholder: "e.g. ISO 9001, GOTS, BRCGS" },
    { name: "region", label: "Country or region", type: "text", group: "Where", placeholder: "e.g. Portugal, EU, Vietnam" },
    { name: "supplierType", label: "Supplier type", type: "select", group: "Where", options: SUPPLIER_TYPES },
    { name: "maxMoq", label: "Maximum minimum-order quantity", type: "number", group: "Order", min: 0, hint: "Suppliers whose published MOQ is higher score lower." },
    { name: "privateLabel", label: "Needs private label", type: "checkbox", group: "Order" },
    { name: "customization", label: "Needs customisation / OEM", type: "checkbox", group: "Order" },
  ],
  statuses: [
    { id: "saved", label: "Saved", tone: "info" },
    { id: "evaluating", label: "Evaluating", tone: "info" },
    { id: "sample_requested", label: "Sample requested (by you)", tone: "warn", humanAction: true },
    { id: "approved", label: "Approved", tone: "ok" },
    { id: "rejected", label: "Rejected", tone: "neutral" },
  ],
  fieldLabels: FIELD_LABELS,
  keyFields: SUPPLIER_KEY_FIELDS,
  criticalFields: ["certifications", "moq", "pricing", "leadTime", "supplierType"],
  columns: [col("location", true), col("supplierType", true), col("moq", true), col("certifications", true), col("leadTime"), col("pricing"), col("products"), col("capabilities"), col("privateLabel"), col("customization"), col("contactChannel"), col("website"), col("lastChecked")],
  compareRows: [col("location"), col("supplierType"), col("products"), col("capabilities"), col("moq"), col("leadTime"), col("pricing"), col("certifications"), col("privateLabel"), col("customization"), col("contactChannel"), col("lastChecked")],
  rank: (items, q, ctx) => items.map((it) => rankOne(it, q, ctx)),
  keep: (it, q) => {
    if (q.supplierType !== "any" && q.supplierType !== "unknown") {
      const t = valueOf(it.fields.supplierType);
      if (t && t !== "unknown" && t !== q.supplierType) return false;
    }
    if (q.product && !phraseScore(joinText(it.title, valueOf(it.fields.products), valueOf(it.fields.capabilities)), phrases(q.product)).hits.length) return false;
    return true;
  },
  describeQuery: (q) => [q.product, q.region, q.supplierType !== "any" && q.supplierType, q.certifications.join(", ")].filter(Boolean).join(" · ") || "All suppliers",
  formatField,
};
