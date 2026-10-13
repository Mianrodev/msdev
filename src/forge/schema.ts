/**
 * Forge Demo: what a demo website is made of.
 *
 * `Intake` is what a person types in (only the business name is required).
 * `SiteContent` is the full set of words for every section of the template —
 * written by Gemini from the intake, or drafted from it without AI when no
 * API key is set. The template (render.ts) only ever reads `SiteContent`, so
 * a site can be regenerated or hand-edited without touching the design.
 */
import { z } from "zod";

/** Icons the template can draw. The AI picks one per service / reason. */
export const ICONS = [
  "wrench",
  "drop",
  "flame",
  "snowflake",
  "bolt",
  "home",
  "shield",
  "clock",
  "star",
  "leaf",
  "hammer",
  "spray",
  "truck",
  "phone",
  "check",
  "dollar",
  "users",
  "search",
] as const;
export const Icon = z.enum(ICONS);
export type IconName = z.infer<typeof Icon>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1d6fb8");

export const Intake = z.object({
  businessName: z.string().trim().min(2, "Enter the business name").max(120),
  industry: z.string().trim().max(80).default(""),
  city: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(40).default(""),
  /** Comma- or line-separated. */
  services: z.string().trim().max(2000).default(""),
  serviceAreas: z.string().trim().max(1000).default(""),
  /** Real reviews to quote, one per paragraph. Without these the page shows clearly-marked sample reviews. */
  reviews: z.string().trim().max(4000).default(""),
  /** Anything else true about the business: years in business, licence, owner's name, offers… */
  notes: z.string().trim().max(4000).default(""),
  logoUrl: z.union([z.literal(""), z.url()]).default(""),
  heroImageUrl: z.union([z.literal(""), z.url()]).default(""),
  primaryColor: z.union([z.literal(""), hex]).default(""),
});
export type Intake = z.infer<typeof Intake>;

const item = z.object({ title: z.string(), description: z.string() });

export const SiteContent = z.object({
  /** e.g. "Plumbing", "HVAC", "Roofing". */
  industry: z.string(),
  /** What one tradesperson is called, e.g. "plumber", "roofer". */
  tradeNoun: z.string(),
  seo: z.object({ title: z.string(), description: z.string() }),
  /** #rrggbb colours. Kept as plain strings so one odd value can't sink a whole site; render.ts falls back to defaults. */
  theme: z.object({
    primary: z.string().describe("Main brand colour for buttons and accents, as #rrggbb"),
    dark: z.string().describe("Near-black colour for the hero and footer background, as #rrggbb"),
  }),
  topBar: z.object({ location: z.string(), highlight: z.string() }),
  hero: z.object({
    badge: z.string(),
    headlineLead: z.string(),
    headlineAccent: z.string(),
    subheadline: z.string(),
    primaryCta: z.string(),
    secondaryCta: z.string(),
  }),
  trustBadges: z.array(z.string()),
  emergency: z.object({ headline: z.string(), items: z.array(z.string()) }),
  services: z.object({
    headline: z.string(),
    intro: z.string(),
    items: z.array(z.object({ title: z.string(), description: z.string(), icon: Icon })),
  }),
  painPoints: z.object({
    headline: z.string(),
    intro: z.string(),
    items: z.array(z.string()),
    resolution: z.string(),
  }),
  whyUs: z.object({
    headline: z.string(),
    intro: z.string(),
    items: z.array(z.object({ title: z.string(), description: z.string(), icon: Icon })),
  }),
  process: z.object({ headline: z.string(), intro: z.string(), steps: z.array(item) }),
  areas: z.object({ headline: z.string(), intro: z.string(), places: z.array(z.string()) }),
  reviews: z.object({
    headline: z.string(),
    intro: z.string(),
    /** True only when the quotes come from real reviews supplied in the intake. */
    real: z.boolean(),
    items: z.array(z.object({ quote: z.string(), name: z.string(), context: z.string() })),
  }),
  offers: z.object({
    headline: z.string(),
    intro: z.string(),
    items: z.array(z.object({ tag: z.string(), title: z.string(), subtitle: z.string(), fineprint: z.string() })),
  }),
  about: z.object({ headline: z.string(), paragraphs: z.array(z.string()) }),
  faq: z.object({ headline: z.string(), items: z.array(z.object({ question: z.string(), answer: z.string() })) }),
  finalCta: z.object({ headline: z.string(), text: z.string() }),
  contact: z.object({ headline: z.string(), intro: z.string(), serviceOptions: z.array(z.string()) }),
});
export type SiteContent = z.infer<typeof SiteContent>;

/** A stored demo: who it's for, the words on the page, and how they were written. */
export interface Demo {
  slug: string;
  intake: Intake;
  content: SiteContent;
  /** "ai" when Gemini wrote the copy; "draft" when it was filled in without AI. */
  writtenBy: "ai" | "draft";
  createdAt: string;
  updatedAt: string;
}
