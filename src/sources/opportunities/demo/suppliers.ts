/**
 * Demo supplier sources: a fictional supplier directory and a fictional trade-fair catalogue.
 * Includes certifications that are independently verified, claimed with a source, and claimed with
 * no source; unknown supplier types; missing MOQs; and an MOQ the two sources disagree on.
 */
import { itemKey } from "@/core/opportunities/dedup";
import { known, unknown } from "@/core/opportunities/fields";
import type { CertificationClaim, Moq, SupplierQuery } from "@/core/opportunities/modules/suppliers";
import type { NormalizedItem } from "@/core/opportunities/types";
import type { Provider } from "../types";
import { DEMO_NOTE, daysFrom, evidenceMaker, isoDay, simulateFailure } from "./common";

interface DemoSupplier {
  slug: string;
  name: string;
  city: string;
  country: string;
  type: "manufacturer" | "distributor" | "wholesaler" | null;
  products: string[];
  capabilities: string[];
  moq: Moq | null;
  leadTime: string | null;
  pricing: string | null;
  certs: { name: string; verified: boolean; sourced: boolean }[];
  privateLabel: boolean | null;
  customization: boolean | null;
  contact: { label: string; value: string } | null;
  checkedDaysAgo: number;
}

function suppliers(): DemoSupplier[] {
  return [
    {
      slug: "porto-textile",
      name: "Porto Textile Works",
      city: "Porto",
      country: "Portugal",
      type: "manufacturer",
      products: ["Organic cotton tote bags", "Canvas bags", "Cotton drawstring bags"],
      capabilities: ["Cutting and sewing", "Screen printing", "Embroidery"],
      moq: { quantity: 500, unit: "units" },
      leadTime: "30–45 days after sample approval",
      pricing: "From €2.10 per unit at 1,000 units (ex-works)",
      certs: [
        { name: "GOTS", verified: true, sourced: true },
        { name: "ISO 9001", verified: false, sourced: true },
      ],
      privateLabel: true,
      customization: true,
      contact: { label: "Sales enquiry form", value: "https://porto-textile.example/contact" },
      checkedDaysAgo: 4,
    },
    {
      slug: "saigon-bags",
      name: "Saigon Bag Manufacturing",
      city: "Ho Chi Minh City",
      country: "Vietnam",
      type: "manufacturer",
      products: ["Cotton tote bags", "Polyester backpacks", "Non-woven bags"],
      capabilities: ["Cutting and sewing", "Heat transfer printing"],
      moq: { quantity: 3000, unit: "units" },
      leadTime: "About 60 days",
      pricing: null,
      certs: [{ name: "amfori BSCI", verified: false, sourced: false }],
      privateLabel: true,
      customization: null,
      contact: { label: "Published export sales email", value: "export@saigon-bags.example" },
      checkedDaysAgo: 12,
    },
    {
      slug: "europack",
      name: "EuroPack Distributors",
      city: "Rotterdam",
      country: "Netherlands",
      type: "distributor",
      products: ["Paper bags", "Cotton tote bags (blank)", "Packaging tape"],
      capabilities: ["Warehousing", "EU-wide delivery"],
      moq: { quantity: 100, unit: "units" },
      leadTime: "3–5 working days for stock items",
      pricing: "Blank cotton totes €1.85 per unit (100+)",
      certs: [],
      privateLabel: null,
      customization: false,
      contact: { label: "Trade account page", value: "https://europack.example/trade" },
      checkedDaysAgo: 2,
    },
    {
      slug: "anatolia-cotton",
      name: "Anatolia Cotton Mills",
      city: "Denizli",
      country: "Turkey",
      type: "manufacturer",
      products: ["Cotton fabric", "Organic cotton tote bags", "Towels"],
      capabilities: ["Weaving", "Dyeing", "Cutting and sewing"],
      moq: null,
      leadTime: null,
      pricing: null,
      certs: [
        { name: "OEKO-TEX Standard 100", verified: true, sourced: true },
        { name: "GOTS", verified: false, sourced: true },
      ],
      privateLabel: true,
      customization: true,
      contact: { label: "Contact form", value: "https://anatolia-cotton.example/contact" },
      checkedDaysAgo: 20,
    },
    {
      slug: "midlands-promo",
      name: "Midlands Promo Wholesale",
      city: "Leicester",
      country: "United Kingdom",
      type: "wholesaler",
      products: ["Promotional tote bags", "Branded mugs", "Pens"],
      capabilities: ["Pad printing", "Screen printing"],
      moq: { quantity: 50, unit: "units" },
      leadTime: "10 working days",
      pricing: "Printed cotton totes from £3.40 per unit (250+)",
      certs: [{ name: "ISO 9001", verified: false, sourced: false }],
      privateLabel: false,
      customization: true,
      contact: { label: "Sales phone (published)", value: "+44 0000 000000 (demo)" },
      checkedDaysAgo: 6,
    },
    {
      slug: "lisbon-eco-pack",
      name: "Lisbon Eco Packaging",
      city: "Lisbon",
      country: "Portugal",
      type: "manufacturer",
      products: ["Recycled PET bottles", "Recycled PET jars", "Plant-based caps"],
      capabilities: ["Injection moulding", "Blow moulding", "Custom colours"],
      moq: { quantity: 10000, unit: "units" },
      leadTime: "6–8 weeks",
      pricing: null,
      certs: [
        { name: "ISO 14001", verified: true, sourced: true },
        { name: "ISO 9001", verified: true, sourced: true },
      ],
      privateLabel: true,
      customization: true,
      contact: { label: "Contact form", value: "https://lisbon-eco-pack.example/contact" },
      checkedDaysAgo: 9,
    },
    {
      slug: "silk-road-sourcing",
      name: "Silk Road Sourcing Ltd",
      city: "Unknown",
      country: "Hong Kong",
      type: null,
      products: ["Tote bags", "Phone cases", "Promotional products"],
      capabilities: [],
      moq: null,
      leadTime: null,
      pricing: null,
      certs: [],
      privateLabel: null,
      customization: null,
      contact: null,
      checkedDaysAgo: 45,
    },
    {
      slug: "baltic-print-sew",
      name: "Baltic Print & Sew",
      city: "Kaunas",
      country: "Lithuania",
      type: "manufacturer",
      products: ["Cotton tote bags", "T-shirts", "Aprons"],
      capabilities: ["Screen printing", "Digital printing", "Cutting and sewing"],
      moq: { quantity: 300, unit: "units" },
      leadTime: "3–4 weeks",
      pricing: "Quoted on request",
      certs: [{ name: "ISO 9001", verified: true, sourced: true }],
      privateLabel: true,
      customization: true,
      contact: { label: "Contact form", value: "https://baltic-print-sew.example/contact" },
      checkedDaysAgo: 3,
    },
    {
      slug: "chennai-organic",
      name: "Chennai Organic Apparel",
      city: "Chennai",
      country: "India",
      type: "manufacturer",
      products: ["Organic cotton tote bags", "Organic T-shirts"],
      capabilities: ["Cutting and sewing", "Embroidery", "Natural dyeing"],
      moq: { quantity: 1000, unit: "units" },
      leadTime: "45 days",
      pricing: null,
      certs: [
        { name: "GOTS", verified: false, sourced: true },
        { name: "Fairtrade", verified: false, sourced: false },
      ],
      privateLabel: true,
      customization: true,
      contact: { label: "Published sales email", value: "sales@chennai-organic.example" },
      checkedDaysAgo: 15,
    },
    {
      slug: "krakow-moulding",
      name: "Kraków Injection Moulding",
      city: "Kraków",
      country: "Poland",
      type: "manufacturer",
      products: ["Plastic components", "Recycled PET jars", "Closures"],
      capabilities: ["Injection moulding", "Tooling", "Pad printing"],
      moq: { quantity: 5000, unit: "units" },
      leadTime: "4–6 weeks plus tooling",
      pricing: null,
      certs: [{ name: "ISO 9001", verified: true, sourced: true }],
      privateLabel: false,
      customization: true,
      contact: { label: "Contact form", value: "https://krakow-moulding.example/contact" },
      checkedDaysAgo: 7,
    },
  ];
}

function normalize(s: DemoSupplier, providerId: string, base: string, now: Date, sourceLabel: string): NormalizedItem {
  const ev = evidenceMaker(providerId, now);
  const site = `https://${s.slug}.example`;
  const page = `${base}/supplier/${s.slug}`;
  const claim = (quote: string, label = "Supplier's website") => ev("supplier_claim", site, quote, null, label);
  const listed = (quote: string) => ev("supplier_claim", page, quote, null, sourceLabel);
  const checked = isoDay(daysFrom(now, -s.checkedDaysAgo));
  const certs: CertificationClaim[] = s.certs.map((c) => ({
    name: c.name,
    status: c.verified ? "independently_verified" : "supplier_claim",
    sourceUrl: c.verified ? `https://register.demo-certifier.example/${c.name.replace(/\W+/g, "-").toLowerCase()}/${s.slug}` : c.sourced ? `${site}/certificates` : null,
    checkedAt: c.verified ? checked : null,
    ...(c.sourced || c.verified ? {} : { note: "Mentioned with no certificate or registry entry" }),
  }));
  return {
    module: "suppliers",
    key: itemKey("suppliers", { url: site, name: s.name }),
    provider: providerId,
    mode: "demo",
    title: s.name,
    subtitle: `${s.city === "Unknown" ? "" : `${s.city}, `}${s.country}`,
    sourceUrl: page,
    retrievedAt: now.toISOString(),
    publishedAt: null,
    links: [
      { label: "Website (demo)", url: site, kind: "website" },
      { label: `${sourceLabel} (demo)`, url: page, kind: "source" },
    ],
    fields: {
      location: s.city === "Unknown" ? unknown("City not stated") : known(`${s.city}, ${s.country}`, listed(`${s.city}, ${s.country}`)),
      country: known(s.country, listed(s.country)),
      supplierType: s.type ? known(s.type, claim(`We are a ${s.type}.`, "Supplier's about page")) : unknown("Not stated — could be a trading company"),
      products: s.products.length ? known(s.products, claim(s.products.join(", "))) : unknown(),
      capabilities: s.capabilities.length ? known(s.capabilities, claim(s.capabilities.join(", "))) : unknown("Not stated"),
      moq: s.moq ? known(s.moq, claim(`Minimum order: ${s.moq.quantity} ${s.moq.unit}`, "Supplier's website — ordering page"), `${s.moq.quantity} ${s.moq.unit}`) : unknown("Not published"),
      leadTime: s.leadTime ? known(s.leadTime, claim(s.leadTime)) : unknown("Not published"),
      pricing: s.pricing ? known(s.pricing, claim(s.pricing, "Supplier's price list")) : unknown("Not published"),
      certifications: certs.length
        ? known(
            certs,
            certs.map((c) =>
              c.status === "independently_verified"
                ? ev("independently_verified", c.sourceUrl, `${c.name}: certificate valid (registry entry)`, null, "Certification body register (demo)")
                : ev("supplier_claim", c.sourceUrl, `${c.name} certified`, null, c.sourceUrl ? "Supplier's certificates page" : "Supplier's homepage (no certificate shown)"),
            ),
          )
        : unknown("None claimed or found"),
      privateLabel: s.privateLabel === null ? unknown("Not stated") : known(s.privateLabel, claim(s.privateLabel ? "Private label available." : "We do not offer private label.")),
      customization: s.customization === null ? unknown("Not stated") : known(s.customization, claim(s.customization ? "Custom designs and OEM orders welcome." : "Stock items only.")),
      contactChannel: s.contact ? known(s.contact, claim(s.contact.value, "Supplier's contact page")) : unknown("No public business contact found"),
      website: known(site, listed(site)),
      lastChecked: known(checked, ev("computed", null, null, null, "Date this source was last checked")),
    },
  };
}

/** The trade-fair catalogue lists two suppliers; for Porto Textile it states a different MOQ (a conflict). */
const CATALOGUE: Record<string, Partial<DemoSupplier>> = {
  "porto-textile": { moq: { quantity: 1000, unit: "units" } },
  "baltic-print-sew": {},
};

const common = {
  module: "suppliers" as const,
  mode: "demo" as const,
  licence: "Fictional demo data",
  storagePolicy: "Fictional; may be stored and exported freely, always labelled as demo.",
  available: () => ({ ok: true as const }),
};

export const demoSupplierDirectory: Provider<SupplierQuery> = {
  ...common,
  id: "demo-supplier-directory",
  name: "Demo Supplier Directory",
  description: `${DEMO_NOTE} Simulates a B2B supplier directory linking to supplier websites and certifier registers.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "primary");
    return { items: suppliers().map((s) => normalize(s, "demo-supplier-directory", "https://directory.demo-suppliers.example", io.now, "Directory listing")), warnings: [] };
  },
};

export const demoTradeCatalogue: Provider<SupplierQuery> = {
  ...common,
  id: "demo-trade-catalogue",
  name: "Demo Trade Fair Catalogue",
  description: `${DEMO_NOTE} Simulates an exhibitor catalogue with supplier-supplied details.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "secondary");
    const items = suppliers()
      .filter((s) => s.slug in CATALOGUE)
      .map((s) => {
        const it = normalize({ ...s, ...CATALOGUE[s.slug] }, "demo-trade-catalogue", "https://catalogue.demo-tradefair.example", io.now, "Exhibitor catalogue");
        const evCat = evidenceMaker("demo-trade-catalogue", io.now);
        const moq = CATALOGUE[s.slug].moq;
        return {
          ...it,
          fields: {
            website: it.fields.website,
            products: it.fields.products,
            ...(moq ? { moq: known(moq, evCat("supplier_claim", `https://catalogue.demo-tradefair.example/supplier/${s.slug}`, `MOQ ${moq.quantity} ${moq.unit}`, null, "Exhibitor catalogue entry"), `${moq.quantity} ${moq.unit}`) } : {}),
          },
        };
      });
    return { items, warnings: [] };
  },
};
