/**
 * Demo tender sources: two fictional notice portals. They deliberately include the awkward cases a
 * real buyer portal produces — unpublished budgets, deadlines without a timezone, an ambiguous date,
 * a notice still marked open after its deadline, a cancelled notice, an amount without a currency,
 * and one notice published on both portals with different budgets (a conflict).
 */
import { parseDeadline } from "@/core/opportunities/dates";
import { itemKey } from "@/core/opportunities/dedup";
import { fromSource, known, unknown } from "@/core/opportunities/fields";
import { parseMoney } from "@/core/opportunities/money";
import type { TenderQuery } from "@/core/opportunities/modules/tenders";
import type { Link, NormalizedItem } from "@/core/opportunities/types";
import type { Provider } from "../types";
import { DEMO_NOTE, daysFrom, evidenceMaker, isoDay, isoZ, longDate, pad2, simulateFailure, usDate } from "./common";

interface DemoNotice {
  id: string;
  title: string;
  buyer: string;
  regions: string[];
  status: string;
  type: string;
  procedure: string;
  categories: string[];
  summary: string;
  scope?: string;
  publishedDaysAgo: number;
  deadline: ((now: Date) => string) | null;
  clarification?: (now: Date) => string;
  budget: string | null;
  eligibility: string[] | null;
  documents: string[] | null;
  submission: string | null;
  attachments?: string[];
}

const PORTAL_A = "https://notices.demo-portal.example";
const PORTAL_B = "https://bulletin.demo-regional.example";

function primaryNotices(): DemoNotice[] {
  return [
    {
      id: "DEMO-2026-0141",
      title: "Website redesign and accessibility improvements",
      buyer: "Harbourside City Council",
      regions: ["Northshire", "United Kingdom"],
      status: "Open",
      type: "Services",
      procedure: "Open procedure",
      categories: ["Website design", "Digital services", "Accessibility"],
      summary:
        "The Council seeks a supplier to redesign its public website, migrate content to a new content management system and bring all pages up to WCAG 2.2 AA.",
      scope: "Lot 1: discovery and design. Lot 2: build and content migration. Lot 3: twelve months of support.",
      publishedDaysAgo: 6,
      deadline: (now) => isoZ(daysFrom(now, 24, 12)),
      clarification: (now) => isoZ(daysFrom(now, 14, 17)),
      budget: "£85,000",
      eligibility: [
        "Suppliers must hold a current Cyber Essentials certificate.",
        "Two references from public-sector clients for comparable work completed in the last three years.",
      ],
      documents: ["Selection questionnaire", "Pricing schedule", "Method statement (max 10 pages)", "Accessibility statement from a previous project"],
      submission: "Electronic submission through the Harbourside e-tendering portal only.",
      attachments: ["Specification.pdf", "Pricing-schedule.xlsx", "Draft-contract.pdf"],
    },
    {
      id: "DEMO-2026-0152",
      title: "Managed IT support services framework",
      buyer: "Eastvale Community Health Trust",
      regions: ["Eastvale", "United Kingdom"],
      status: "Open",
      type: "Services — framework agreement",
      procedure: "Restricted procedure",
      categories: ["IT services", "Managed services", "Service desk"],
      summary: "A four-year framework for service desk, end-user device support and network monitoring across 14 sites.",
      publishedDaysAgo: 11,
      deadline: (now) => `${longDate(daysFrom(now, 31))}, 17:00 GMT`,
      budget: "£400k – £600k per annum",
      eligibility: ["ISO 27001 certification is mandatory.", "Cyber Essentials Plus is required for all suppliers handling patient data."],
      documents: ["Selection questionnaire", "Information security questionnaire", "Financial statements for the last two years"],
      submission: "Through the Trust's procurement portal; no email submissions.",
      attachments: ["ITT-pack.zip"],
    },
    {
      id: "DEMO-2026-0167",
      title: "Community events management and delivery",
      buyer: "Riverton Borough Council",
      regions: ["Riverton", "United Kingdom"],
      status: "Open",
      type: "Services",
      procedure: "Open procedure",
      categories: ["Events management", "Community engagement"],
      summary: "Planning and running six free community events across the borough in the next financial year.",
      publishedDaysAgo: 3,
      deadline: (now) => isoDay(daysFrom(now, 19)), // date only: no time, no timezone
      budget: null,
      eligibility: null,
      documents: null,
      submission: null,
    },
    {
      id: "DEMO-2026-0170",
      title: "Translation and interpreting services",
      buyer: "Lakeshire County Council",
      regions: ["Lakeshire", "Ireland"],
      status: "Open",
      type: "Services",
      procedure: "Open procedure",
      categories: ["Translation", "Interpreting", "Language services"],
      summary: "Written translation into 12 languages and on-demand telephone interpreting.",
      publishedDaysAgo: 9,
      // Day and month both ≤ 12, no month name: deliberately ambiguous.
      deadline: (now) => {
        const d = daysFrom(now, 40);
        const a = Math.min(12, d.getUTCDate());
        const b = Math.min(12, d.getUTCMonth() + 1);
        return `${pad2(a === b ? (a % 12) + 1 : a)}/${pad2(b)}/${d.getUTCFullYear()} 12:00`;
      },
      budget: "Up to €120,000",
      eligibility: ["Translators must hold a recognised professional qualification."],
      documents: ["Tender response form", "Rates card"],
      submission: "Via the national e-tenders platform.",
    },
    {
      id: "DEMO-2026-0108",
      title: "Digital marketing campaign for regional tourism",
      buyer: "Visit Northshire",
      regions: ["Northshire", "United Kingdom"],
      status: "Open", // still marked open by the portal although the deadline has passed
      type: "Services",
      procedure: "Open procedure",
      categories: ["Marketing", "Digital marketing", "Tourism"],
      summary: "A twelve-month paid social and search campaign to promote off-season visits.",
      publishedDaysAgo: 34,
      deadline: (now) => isoZ(daysFrom(now, -3, 12)),
      budget: "£45,000",
      eligibility: ["Evidence of two tourism or hospitality campaigns in the last three years."],
      documents: ["Proposal (max 8 pages)", "Pricing schedule"],
      submission: "Electronic submission via the portal.",
    },
    {
      id: "DEMO-2026-0175",
      title: "Supply of school catering equipment",
      buyer: "Westbrook Academies Trust",
      regions: ["Westbrook", "United Kingdom"],
      status: "Open",
      type: "Goods",
      procedure: "Open procedure",
      categories: ["Catering equipment", "Supplies"],
      summary: "Supply, installation and five-year maintenance of kitchen equipment for nine schools.",
      publishedDaysAgo: 4,
      deadline: (now) => `${isoDay(daysFrom(now, 40))} 12:00 Europe/London`,
      budget: "£250,000",
      eligibility: ["Suppliers must hold ISO 9001 and ISO 14001."],
      documents: ["Selection questionnaire", "Technical submission", "Price schedule"],
      submission: "Through the Trust's e-procurement system.",
    },
    {
      id: "DEMO-2026-0181",
      title: "Data analytics platform — request for proposals",
      buyer: "City of Port Alder",
      regions: ["Port Alder", "United States"],
      status: "Open",
      type: "Services — RFP",
      procedure: "Request for proposals",
      categories: ["Data analytics", "Software", "IT services"],
      summary: "A cloud analytics platform with dashboards for 30 departments, including implementation and training.",
      publishedDaysAgo: 8,
      deadline: (now) => `${usDate(daysFrom(now, 26))} 2:00 PM EST`,
      budget: "USD 750,000",
      eligibility: ["Vendors must provide a current SOC 2 Type II report.", "Proposers must be registered to do business in the State."],
      documents: ["Technical proposal", "Cost proposal (separately sealed)", "Signed addenda acknowledgement"],
      submission: "Electronic upload to the City's bid portal before the deadline.",
      attachments: ["RFP-document.pdf", "Addendum-1.pdf"],
    },
    {
      id: "DEMO-2026-0185",
      title: "Grounds maintenance works — parks and open spaces",
      buyer: "Riverton Borough Council",
      regions: ["Riverton", "United Kingdom"],
      status: "Open",
      type: "Works",
      procedure: "Open procedure",
      categories: ["Grounds maintenance", "Landscaping"],
      summary: "Grass cutting, hedge maintenance and tree works across 42 sites for three years.",
      publishedDaysAgo: 12,
      deadline: (now) => isoZ(daysFrom(now, 10, 11)),
      budget: "£1.2m",
      eligibility: ["Contractors must be CHAS accredited or hold an equivalent SSIP certificate.", "Constructionline Gold membership preferred."],
      documents: ["Health and safety policy", "Method statement", "Pricing schedule"],
      submission: "Through the council's e-tendering portal.",
    },
    {
      id: "DEMO-2026-0190",
      title: "User research and service design discovery",
      buyer: "Office for Example Services",
      regions: ["United Kingdom"],
      status: "Open",
      type: "Services",
      procedure: "Further competition",
      categories: ["User research", "Service design", "Digital services"],
      summary: "An eight-week discovery into how small businesses apply for licences, with recommendations for a new digital service.",
      publishedDaysAgo: 5,
      deadline: (now) => `${longDate(daysFrom(now, 5))} 5pm IST`, // "IST" is ambiguous: not assumed
      budget: "£150,000 – £180,000",
      eligibility: ["Suppliers must hold Cyber Essentials."],
      documents: ["Written proposal", "Case studies (2)", "Rate card"],
      submission: "Via the framework's online marketplace.",
    },
    {
      id: "DEMO-2026-0193",
      title: "Accessibility audit of digital services",
      buyer: "Northshire Fire and Rescue Service",
      regions: ["Northshire", "United Kingdom"],
      status: "Open",
      type: "Services",
      procedure: "Request for quotation",
      categories: ["Accessibility", "Audit", "Digital services"],
      summary: "An audit of the public website and two staff systems against WCAG 2.2 AA, with a prioritised remediation plan.",
      publishedDaysAgo: 2,
      deadline: (now) => isoZ(daysFrom(now, 21, 12)),
      budget: "£30,000",
      eligibility: null,
      documents: ["Quotation", "Example audit report"],
      submission: "By upload to the portal.",
    },
    {
      id: "DEMO-2026-0099",
      title: "Legal advisory services (cancelled)",
      buyer: "Harbourside City Council",
      regions: ["Northshire", "United Kingdom"],
      status: "Cancelled",
      type: "Services",
      procedure: "Open procedure",
      categories: ["Legal services"],
      summary: "This procurement has been cancelled and will not proceed.",
      publishedDaysAgo: 50,
      deadline: (now) => isoZ(daysFrom(now, 15, 12)),
      budget: "£60,000",
      eligibility: null,
      documents: null,
      submission: null,
    },
    {
      id: "DEMO-2026-0198",
      title: "Website hosting and support — request for quotation",
      buyer: "Eastvale Parish Council",
      regions: ["Eastvale", "United Kingdom"],
      status: "Open",
      type: "Services — RFQ",
      procedure: "Request for quotation",
      categories: ["Website hosting", "IT services"],
      summary: "Hosting, security updates and small content changes for a parish website for three years.",
      publishedDaysAgo: 1,
      deadline: (now) => isoZ(daysFrom(now, 16, 12)),
      budget: "50,000", // no currency stated
      eligibility: null,
      documents: ["Quotation"],
      submission: "By email to the clerk is not accepted; use the portal.",
    },
  ];
}

/** The second portal republishes one notice with a different budget, and adds two of its own. */
function secondaryNotices(): DemoNotice[] {
  const all = primaryNotices();
  const dup = { ...all.find((n) => n.id === "DEMO-2026-0193")!, budget: "£35,000", attachments: ["Audit-scope.pdf"] };
  return [
    dup,
    {
      id: "DEMO-RB-2210",
      title: "Brand identity refresh for a library service",
      buyer: "Lakeshire Libraries",
      regions: ["Lakeshire", "Ireland"],
      status: "Open",
      type: "Services",
      procedure: "Request for quotation",
      categories: ["Branding", "Design"],
      summary: "New visual identity, signage templates and a short brand guide for 18 libraries.",
      publishedDaysAgo: 7,
      deadline: (now) => isoZ(daysFrom(now, 18, 15)),
      budget: "€25,000",
      eligibility: ["Portfolio of at least three public-sector identity projects."],
      documents: ["Portfolio", "Quotation"],
      submission: "Via the bulletin's response form.",
    },
    {
      id: "DEMO-RB-2214",
      title: "Cyber security penetration testing",
      buyer: "Westbrook Academies Trust",
      regions: ["Westbrook", "United Kingdom"],
      status: "Open",
      type: "Services",
      procedure: "Request for quotation",
      categories: ["Cyber security", "IT services"],
      summary: "Annual external and internal penetration testing across the Trust's network.",
      publishedDaysAgo: 2,
      deadline: (now) => isoZ(daysFrom(now, 6, 12)),
      budget: "£18,000",
      eligibility: ["CREST or CHECK accredited testers only.", "ISO 27001 preferred."],
      documents: ["Quotation", "Sample report", "Tester accreditation evidence"],
      submission: "Through the bulletin portal.",
    },
  ];
}

function normalize(n: DemoNotice, base: string, providerId: string, now: Date): NormalizedItem {
  const ev = evidenceMaker(providerId, now);
  const url = `${base}/notice/${n.id}`;
  const publishedOn = isoDay(daysFrom(now, -n.publishedDaysAgo));
  const pub = (quote: string | null, label = "Notice") => ev("published", url, quote, publishedOn, label);
  const dlRaw = n.deadline?.(now) ?? null;
  const dl = parseDeadline(dlRaw);
  const clRaw = n.clarification?.(now) ?? null;
  const cl = parseDeadline(clRaw);
  const money = parseMoney(n.budget);
  const links: Link[] = [
    { label: "Original notice (demo)", url, kind: "notice" },
    ...(n.attachments ?? []).map((a) => ({ label: `${a} (demo)`, url: `${base}/files/${n.id}/${a}`, kind: "attachment" as const })),
  ];
  return {
    module: "tenders",
    key: itemKey("tenders", { id: n.id }),
    provider: providerId,
    mode: "demo",
    title: n.title,
    subtitle: n.buyer,
    sourceUrl: url,
    retrievedAt: now.toISOString(),
    publishedAt: publishedOn,
    links,
    fields: {
      buyer: known(n.buyer, pub(n.buyer)),
      reference: known(n.id, pub(n.id)),
      noticeStatus: known(n.status, pub(`Status: ${n.status}`), n.status, `As listed by the source on ${isoDay(now)}`),
      opportunityType: known(n.type, pub(n.type)),
      procedure: known(n.procedure, pub(n.procedure)),
      category: known(n.categories, pub(n.categories.join(", "))),
      geography: fromSource(n.regions, pub(n.regions.join(", "))),
      summary: known(n.summary, pub(n.summary)),
      scope: n.scope ? known(n.scope, pub(n.scope)) : unknown("No lot or scope breakdown published"),
      publishedOn: known(publishedOn, pub(publishedOn)),
      deadline: dl ? known(dl, pub(dl.raw), dl.raw, dl.notes.join("; ") || undefined) : unknown("Deadline not published"),
      clarificationDeadline: cl ? known(cl, pub(cl.raw), cl.raw, cl.notes.join("; ") || undefined) : unknown(),
      budget: money ? known(money, pub(money.raw), money.raw, "Estimated value as published — not a guaranteed amount") : unknown("Budget not published"),
      eligibility: n.eligibility ? known(n.eligibility, pub(n.eligibility.join(" "))) : unknown("Not published in the notice data"),
      requiredDocuments: n.documents ? known(n.documents, pub(n.documents.join("; "))) : unknown("Not listed"),
      submissionMethod: n.submission ? known(n.submission, pub(n.submission)) : unknown("Not stated"),
      attachments: n.attachments?.length ? known(n.attachments, pub(n.attachments.join(", "), "Attachments list")) : unknown("No attachments listed"),
    },
  };
}

const common = {
  module: "tenders" as const,
  mode: "demo" as const,
  licence: "Fictional demo data",
  storagePolicy: "Fictional; may be stored and exported freely, always labelled as demo.",
  available: () => ({ ok: true as const }),
};

export const demoTenderPortal: Provider<TenderQuery> = {
  ...common,
  id: "demo-tender-portal",
  name: "Demo Public Notice Portal",
  description: `${DEMO_NOTE} Simulates a national buyer portal.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "primary");
    return { items: primaryNotices().map((n) => normalize(n, PORTAL_A, "demo-tender-portal", io.now)), warnings: [] };
  },
};

export const demoTenderBulletin: Provider<TenderQuery> = {
  ...common,
  id: "demo-tender-bulletin",
  name: "Demo Regional Tender Bulletin",
  description: `${DEMO_NOTE} Simulates a regional bulletin that republishes some national notices.`,
  search: async (q, io) => {
    simulateFailure(q.simulate, "secondary");
    return { items: secondaryNotices().map((n) => normalize(n, PORTAL_B, "demo-tender-bulletin", io.now)), warnings: [] };
  },
};
