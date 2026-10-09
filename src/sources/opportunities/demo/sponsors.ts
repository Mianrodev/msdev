/**
 * Demo sponsor sources: a fictional brand directory and a fictional partnerships index. Includes a
 * brand with no public sponsorship evidence, undated and old evidence, disagreeing market lists, a
 * brand with no public contact, and exactly one brand whose own page confirms it accepts requests.
 */
import { itemKey } from "@/core/opportunities/dedup";
import { combine, known, unknown } from "@/core/opportunities/fields";
import type { ContactChannel, PastSponsorship, SponsorQuery } from "@/core/opportunities/modules/sponsors";
import type { Evidence, NormalizedItem } from "@/core/opportunities/types";
import type { Provider } from "../types";
import { DEMO_NOTE, daysFrom, evidenceMaker, isoDay, simulateFailure } from "./common";

interface DemoBrand {
  slug: string;
  name: string;
  industry: string;
  markets: string[];
  marketsAlt?: string[];
  audience: string | null;
  history: { title: string; monthsAgo: number | null; type: string | null; category: string | null; summary: string; via: "brand" | "press" }[];
  contact: ContactChannel | null;
  seeking?: string;
}

function brands(): DemoBrand[] {
  return [
    {
      slug: "trailmark",
      name: "Trailmark Outdoor Co.",
      industry: "Outdoor gear and apparel",
      markets: ["United Kingdom", "Ireland", "Netherlands"],
      audience: "Hikers, trail runners and outdoor families who care about sustainability.",
      history: [
        { title: "Headline sponsor, Peaks Community Trail Run", monthsAgo: 5, type: "cash", category: "community running event", summary: "Funded race medals and a youth category for a 2,000-runner community trail race.", via: "brand" },
        { title: "Kit partner, Northshire Youth Cycling League", monthsAgo: 14, type: "in_kind", category: "youth cycling", summary: "Supplied rain jackets to 300 young riders.", via: "press" },
      ],
      contact: { kind: "partnerships_page", value: "https://trailmark.example/partnerships", label: "Partnerships request form" },
      seeking: "We review community sponsorship requests every quarter. Apply using the form below.",
    },
    {
      slug: "brightleaf",
      name: "Brightleaf Nutrition",
      industry: "Sports nutrition",
      markets: ["United Kingdom"],
      audience: "Amateur endurance athletes and gym-goers aged 20–45.",
      history: [{ title: "Hydration partner, City Riverside 10K", monthsAgo: 3, type: "in_kind", category: "running event", summary: "Provided drinks stations and samples.", via: "brand" }],
      contact: { kind: "email", value: "partnerships@brightleaf.example", label: "Published partnerships inbox" },
    },
    {
      slug: "cobalt",
      name: "Cobalt Mobile",
      industry: "Telecommunications",
      markets: ["United Kingdom"],
      audience: "Young adults and students.",
      history: [{ title: "Title sponsor, Campus Music Week", monthsAgo: 62, type: "naming", category: "music festival", summary: "Naming rights for a student music week.", via: "press" }],
      contact: { kind: "press", value: "https://cobalt.example/newsroom", label: "Press office page" },
    },
    {
      slug: "juniper-rye",
      name: "Juniper & Rye Bakery Group",
      industry: "Food and bakery",
      markets: ["Northshire"],
      audience: null,
      history: [{ title: "Supported the Riverton Food Fair", monthsAgo: null, type: "in_kind", category: "food festival", summary: "Bread and pastries donated for volunteers (date not given on the page).", via: "brand" }],
      contact: null,
    },
    {
      slug: "voltwave",
      name: "Voltwave Energy",
      industry: "Renewable energy",
      markets: ["United Kingdom"],
      marketsAlt: ["United Kingdom", "Ireland"],
      audience: "Homeowners interested in lowering their energy bills and carbon footprint.",
      history: [
        { title: "Media partner, Green Streets Festival", monthsAgo: 8, type: "media", category: "sustainability festival", summary: "Co-produced a podcast series with festival speakers.", via: "press" },
        { title: "Community solar workshop series", monthsAgo: 20, type: "cash", category: "sustainability education", summary: "Funded six free workshops in community centres.", via: "brand" },
      ],
      contact: { kind: "form", value: "https://voltwave.example/contact", label: "General business enquiry form" },
    },
    {
      slug: "pixelnorth",
      name: "Pixelnorth Studios",
      industry: "Video games",
      markets: ["Global"],
      audience: "Gamers aged 16–34, streaming communities.",
      history: [
        { title: "Creator collaboration programme, autumn season", monthsAgo: 2, type: "content", category: "creator partnership", summary: "Sponsored videos with 40 mid-sized streamers.", via: "brand" },
        { title: "Esports community cup", monthsAgo: 11, type: "cash", category: "esports tournament", summary: "Prize pool for an amateur tournament.", via: "press" },
      ],
      contact: { kind: "email", value: "creators@pixelnorth.example", label: "Published creator partnerships inbox" },
    },
    {
      slug: "harbor-mutual",
      name: "Harbor Mutual Insurance",
      industry: "Insurance",
      markets: ["Northshire", "Eastvale", "Riverton"],
      audience: "Local families and small businesses.",
      history: [
        { title: "Naming partner, Harbourside Community Stadium", monthsAgo: 30, type: "naming", category: "community sport", summary: "Ten-year naming rights for a community stadium.", via: "press" },
        { title: "Family fun day sponsor", monthsAgo: 4, type: "cash", category: "family event", summary: "Sponsored a free family day in Eastvale park.", via: "brand" },
      ],
      contact: { kind: "form", value: "https://harbormutual.example/community", label: "Community fund page" },
    },
    {
      slug: "kinetic",
      name: "Kinetic Labs Wearables",
      industry: "Consumer electronics — fitness wearables",
      markets: ["United Kingdom", "Germany"],
      audience: "Fitness enthusiasts and runners.",
      history: [],
      contact: { kind: "press", value: "https://kineticlabs.example/press", label: "Press contact page" },
    },
    {
      slug: "greenway",
      name: "Greenway Bikes",
      industry: "Bicycles and cycling accessories",
      markets: ["United Kingdom"],
      audience: "Commuters and families who cycle.",
      history: [{ title: "Bike repair tent, Riverton Car-Free Day", monthsAgo: 6, type: "in_kind", category: "cycling community event", summary: "Ran free bike repairs at a car-free day.", via: "brand" }],
      contact: { kind: "form", value: "https://greenwaybikes.example/events", label: "Events enquiry form" },
    },
    {
      slug: "lumen-books",
      name: "Lumen Books",
      industry: "Publishing",
      markets: ["United Kingdom", "Ireland"],
      audience: "Readers of literary fiction and non-fiction.",
      history: [{ title: "Partner, Lakeshire Literary Festival", monthsAgo: 13, type: "cash", category: "literary festival", summary: "Funded a debut-author stage.", via: "press" }],
      contact: null,
    },
  ];
}

/** The partnerships index adds evidence for two brands already in the directory. */
const INDEX_EXTRA: Record<string, DemoBrand["history"]> = {
  brightleaf: [{ title: "Official supplier, Northshire Half Marathon", monthsAgo: 16, type: "in_kind", category: "running event", summary: "Energy gels for 4,000 runners.", via: "press" }],
  greenway: [{ title: "Sponsor, Kids' Bike Bus scheme", monthsAgo: 9, type: "cash", category: "school cycling", summary: "Funded hi-vis kit for children cycling to school.", via: "press" }],
};

function normalize(b: DemoBrand, history: DemoBrand["history"], providerId: string, base: string, now: Date): NormalizedItem {
  const ev = evidenceMaker(providerId, now);
  const site = `https://${b.slug}.example`;
  const profile = `${base}/brand/${b.slug}`;
  const pubDate = (m: number | null) => (m === null ? null : isoDay(daysFrom(now, -Math.round(m * 30.44))));
  const past: PastSponsorship[] = history.map((h, i) => ({
    title: h.title,
    date: pubDate(h.monthsAgo),
    type: h.type,
    category: h.category,
    url: h.via === "brand" ? `${site}/news/${i + 1}` : `https://news.demo-press.example/${b.slug}/${i + 1}`,
    summary: h.summary,
  }));
  const histEvidence: Evidence[] = past.map((p, i) =>
    ev(history[i].via === "brand" ? "published" : "third_party", p.url, p.summary, p.date, history[i].via === "brand" ? "Brand's own news page" : "News report"),
  );
  const markets = known(b.markets, ev("published", site, b.markets.join(", "), null, "Brand website"));
  const types = [...new Set(past.map((p) => p.type).filter((t): t is string => !!t))];
  return {
    module: "sponsors",
    key: itemKey("sponsors", { url: site, name: b.name }),
    provider: providerId,
    mode: "demo",
    title: b.name,
    subtitle: b.industry,
    sourceUrl: profile,
    retrievedAt: now.toISOString(),
    publishedAt: null,
    links: [
      { label: "Website (demo)", url: site, kind: "website" },
      { label: "Directory profile (demo)", url: profile, kind: "source" },
    ],
    fields: {
      industry: known(b.industry, ev("published", profile, b.industry, null, "Directory profile")),
      geography: b.marketsAlt ? combine(markets, known(b.marketsAlt, ev("third_party", profile, b.marketsAlt.join(", "), null, "Directory profile"))) : markets,
      website: known(site, ev("published", profile, site, null, "Directory profile")),
      audienceFocus: b.audience ? known(b.audience, ev("published", site, b.audience, null, "Brand website — about page")) : unknown("Not published"),
      pastSponsorships: past.length ? known(past, histEvidence) : unknown("No public evidence found"),
      sponsorshipTypes: types.length ? known(types, histEvidence) : unknown(),
      seekingSponsorship: b.seeking ? known(true, ev("published", b.contact?.value ?? site, b.seeking, null, "Brand's partnerships page")) : unknown("No source confirms this"),
      contactChannel: b.contact ? known(b.contact, ev("published", b.contact.value.startsWith("http") ? b.contact.value : site, b.contact.value, null, "Published by the brand")) : unknown("No public business contact found"),
      sponsorshipBudget: unknown("Not published by the brand"),
    },
  };
}

const common = {
  module: "sponsors" as const,
  mode: "demo" as const,
  licence: "Fictional demo data",
  storagePolicy: "Fictional; may be stored and exported freely, always labelled as demo.",
  available: () => ({ ok: true as const }),
};

export const demoBrandDirectory: Provider<SponsorQuery> = {
  ...common,
  id: "demo-brand-directory",
  name: "Demo Brand Directory",
  description: `${DEMO_NOTE} Simulates a company directory with brand websites and news pages.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "primary");
    return { items: brands().map((b) => normalize(b, b.history, "demo-brand-directory", "https://directory.demo-brands.example", io.now)), warnings: [] };
  },
};

export const demoPartnershipsIndex: Provider<SponsorQuery> = {
  ...common,
  id: "demo-partnerships-index",
  name: "Demo Partnerships Index",
  description: `${DEMO_NOTE} Simulates a database of reported sponsorship deals.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "secondary");
    const list = brands().filter((b) => INDEX_EXTRA[b.slug]);
    return {
      items: list.map((b) => {
        const it = normalize({ ...b, seeking: undefined }, INDEX_EXTRA[b.slug], "demo-partnerships-index", "https://index.demo-partnerships.example", io.now);
        // The index only knows deals and the website; everything else stays with the directory.
        return { ...it, fields: { website: it.fields.website, pastSponsorships: it.fields.pastSponsorships, sponsorshipTypes: it.fields.sponsorshipTypes } };
      }),
      warnings: [],
    };
  },
};
