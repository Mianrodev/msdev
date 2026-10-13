/**
 * Turn an intake into the words for every section of the site.
 *
 * With GEMINI_API_KEY set (a Google AI Studio key), Gemini writes the copy as
 * JSON constrained to the template's schema. Without it, `draftContent` fills
 * the template from the trade preset — plainer, but a complete working page.
 */
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { presetFor, type Preset } from "./presets";
import { ICONS, SiteContent, type Intake } from "./schema";

/** Override with GEMINI_MODEL, e.g. to a cheaper Flash-Lite model. */
export const DEFAULT_MODEL = "gemini-3.8-flash";

export function splitList(s: string): string[] {
  return s
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Real reviews: paragraphs separated by blank lines, optionally ending "— Name, context". */
export function parseReviews(s: string): { quote: string; name: string; context: string }[] {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^([\s\S]*?)\s*[—–-]{1,2}\s*([^\n—–-][^\n]*)$/);
      const quote = (m ? m[1] : p).replace(/^["“]|["”]$/g, "").trim();
      const [name = "Verified customer", ...rest] = (m ? m[2] : "").split(",").map((x) => x.trim());
      return { quote, name: name || "Verified customer", context: rest.join(", ") };
    });
}

const place = (i: Intake) => i.city || "your area";

export function draftContent(i: Intake): SiteContent {
  const p = presetFor(i.industry, i.businessName, i.services);
  const name = i.businessName;
  const where = place(i);
  const services = splitList(i.services);
  const items = services.length
    ? services.slice(0, 9).map((title, n) => {
        const known = p.services.find((s) => s.title.toLowerCase() === title.toLowerCase());
        return {
          title,
          description: known?.description ?? `Professional ${title.toLowerCase()} from ${name}, done right the first time.`,
          icon: known?.icon ?? p.services[n % p.services.length].icon,
        };
      })
    : p.services;
  const areas = splitList(i.serviceAreas);
  const realReviews = parseReviews(i.reviews);
  const phoneText = i.phone ? ` Call ${i.phone}.` : "";
  return {
    industry: p.industry,
    tradeNoun: p.tradeNoun,
    seo: {
      title: `${name} | ${p.industry} in ${where}`,
      description: `${name} provides reliable ${p.industry.toLowerCase()} services in ${where}. Upfront pricing and work done right.${phoneText}`,
    },
    theme: { primary: i.primaryColor || p.primary, dark: p.dark },
    topBar: { location: `Serving ${where} & surrounding areas`, highlight: p.emergency ? "Emergency service available" : "Free estimates" },
    hero: {
      badge: p.emergency ? "Fast, local response" : `Trusted local ${p.tradeNoun}s`,
      headlineLead: `${p.industry} done right in`,
      headlineAccent: `${where}.`,
      subheadline: `${name} delivers dependable ${p.industry.toLowerCase()} for homes and businesses — clear pricing, careful work and people who show up when they say they will.`,
      primaryCta: "Request Service",
      secondaryCta: "Explore Services",
    },
    trustBadges: ["Licensed & insured", "Upfront pricing", "Local team", "Satisfaction guaranteed"],
    emergency: {
      headline: p.emergency ? `${p.industry} emergency? Call now for fast help in ${where}.` : `Need help soon? We can usually book you in this week in ${where}.`,
      items: p.painPoints.slice(0, 5),
    },
    services: {
      headline: `Complete ${p.industry} Solutions`,
      intro: `Whatever the job, ${name} handles it with care and clear communication from start to finish.`,
      items,
    },
    painPoints: {
      headline: `Tired of ${p.industry.toLowerCase()} problems?`,
      intro: "We know how stressful it is when things go wrong. You shouldn't have to deal with:",
      items: p.painPoints,
      resolution: `${name} fixes it properly — one call solves it.`,
    },
    whyUs: {
      headline: `Why ${where} chooses ${name}`,
      intro: "Straightforward service you can count on.",
      items: [
        { title: "Upfront Pricing", description: "You approve the price before any work begins.", icon: "dollar" },
        { title: "On-Time Arrival", description: "We respect your time and show up when we say we will.", icon: "clock" },
        { title: "Licensed & Insured", description: "Qualified professionals you can trust in your home.", icon: "shield" },
        { title: "Clean Work", description: "We protect your home and leave it tidy.", icon: "spray" },
      ],
    },
    process: {
      headline: "How it works",
      intro: "Getting help is simple.",
      steps: [
        { title: "Call or book online", description: "Tell us what's going on and pick a time that suits you." },
        { title: "We inspect & quote", description: "We find the cause and give you a clear price first." },
        { title: "We get it done", description: "The work is completed properly and cleaned up after." },
      ],
    },
    areas: {
      headline: `Proudly serving ${where} and nearby`,
      intro: "If you're in our service area, we're ready to help.",
      places: areas.length ? areas : i.city ? [i.city] : [],
    },
    reviews: {
      headline: "What customers say",
      intro: realReviews.length ? `Real reviews from ${name} customers.` : "Sample reviews — your real Google reviews appear here at launch.",
      real: realReviews.length > 0,
      items: realReviews.length
        ? realReviews.slice(0, 6)
        : [
            { quote: "They arrived on time, explained everything and fixed the problem the same day. Fair price and very professional.", name: "Sample review", context: where },
            { quote: "Clean, courteous and honest. They gave a clear quote up front and stuck to it.", name: "Sample review", context: where },
            { quote: "Easy to book and great communication from start to finish. We'll be calling them again.", name: "Sample review", context: where },
          ],
    },
    offers: {
      headline: "Current offers",
      intro: "Ask about these when you book.",
      items: [
        { tag: "Limited time", title: "$50 Off", subtitle: "Any repair over $250", fineprint: "Cannot be combined with other offers." },
        { tag: "Popular", title: "Free Estimate", subtitle: "On new installations", fineprint: "Mention this offer when you call." },
      ],
    },
    about: {
      headline: `Your local ${p.tradeNoun}s in ${where}`,
      paragraphs: [
        `${name} is a local ${p.industry.toLowerCase()} company serving ${where} and the surrounding area.`,
        "We built our reputation on honest pricing, quality workmanship and treating every home like our own.",
        ...(i.notes ? [i.notes] : []),
      ],
    },
    faq: {
      headline: "Frequently asked questions",
      items: [
        { question: "Do you provide upfront pricing?", answer: "Yes. You get a clear price before any work begins." },
        { question: "Are you licensed and insured?", answer: "Yes — ask us for details when you book." },
        { question: "What areas do you serve?", answer: `We serve ${where} and nearby communities.` },
        { question: "How quickly can you come out?", answer: "We offer prompt scheduling and will give you a real arrival time when you call." },
      ],
    },
    finalCta: {
      headline: `Need a ${p.tradeNoun} today?`,
      text: `Contact ${name} now for fast, reliable service in ${where}.`,
    },
    contact: {
      headline: "Request service",
      intro: "Send us a message and we'll get back to you quickly.",
      serviceOptions: [...items.map((s) => s.title).slice(0, 6), "Other"],
    },
  };
}

function prompt(i: Intake, p: Preset): string {
  const facts = Object.entries({
    "Business name": i.businessName,
    Industry: i.industry || `(not given — likely ${p.industry})`,
    City: i.city,
    Phone: i.phone,
    Services: i.services,
    "Service areas": i.serviceAreas,
    "Other facts": i.notes,
    "Brand colour": i.primaryColor,
  })
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const reviews = parseReviews(i.reviews);
  return `Write the copy for a one-page demo website for a local home-services business. A sales rep will show it to the owner on a call, so it should feel made for them: specific to their trade and town, confident, warm and easy to read.

Facts you were given:
${facts}

${reviews.length ? `Real customer reviews (quote these, lightly trimmed if long — don't invent others; set reviews.real = true):\n${reviews.map((r) => `- "${r.quote}" — ${r.name}${r.context ? `, ${r.context}` : ""}`).join("\n")}` : `No real reviews were given. Write 3 short, believable sample reviews, set every reviewer name to "Sample review", put a service or neighbourhood in context, set reviews.real = false, and make reviews.intro say these are samples that will be replaced by the business's real Google reviews.`}

Trade hints (adjust freely): typical services — ${p.services.map((s) => s.title).join(", ")}. Typical customer frustrations — ${p.painPoints.join("; ")}.

Rules:
- Only state facts you were given. Never invent licence numbers, years in business, review counts, star ratings, awards, staff names, prices you weren't told or guarantees. Offers may use common, modest examples (e.g. "$50 off any repair") with fine print.
- If a city is given, use it naturally in headings. For service areas, use the ones given; if none, list the city plus 5–8 real nearby towns or neighbourhoods.
- hero.headlineLead + hero.headlineAccent read as one headline; the accent (2–4 words) is shown in the brand colour.
- services: 6 items (up to 9 if more were given), each with a one-sentence description and the best-fitting icon.
- painPoints: 6 short items in the customer's words. whyUs: 4–8 reasons. process: 3–4 steps. faq: 5 questions with direct, short answers. trustBadges: 4 short phrases.
- emergency: if the trade has urgent call-outs, a "call now" line with 4–6 urgent problems; otherwise a "book this week" line with common reasons to call.
- theme.primary: the brand colour if given, else a colour that suits the trade; theme.dark: a near-black that pairs with it. Both as #rrggbb.
- contact.serviceOptions: the services plus "Other".
- Plain, natural American English. No emoji. Keep sentences short.
- Icons available: ${ICONS.join(", ")}.`;
}

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

/** The schema Gemini must fill, as plain JSON Schema (without the $schema marker). */
function responseSchema(): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(SiteContent) as Record<string, unknown>;
  void _drop;
  return schema;
}

export async function writeWithGemini(i: Intake): Promise<SiteContent> {
  const p = presetFor(i.industry, i.businessName, i.services);
  const ai = new GoogleGenAI({ apiKey: apiKey() });
  let text: string | undefined;
  try {
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: prompt(i, p),
      config: { responseMimeType: "application/json", responseJsonSchema: responseSchema(), maxOutputTokens: 16000 },
    });
    const reason = res.candidates?.[0]?.finishReason;
    if (reason === "MAX_TOKENS") throw new Error("The site copy came back incomplete. Try again.");
    if (reason === "SAFETY" || res.promptFeedback?.blockReason) throw new Error("Gemini declined to write this site. Try rewording the details.");
    text = res.text;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403) throw new Error("Gemini rejected the API key. Check GEMINI_API_KEY.");
      if (e.status === 429) throw new Error("Gemini's rate limit was hit (the free tier allows only a few requests a minute). Wait a minute and try again.");
      throw new Error(`Gemini returned an error (${e.status}). Try again in a moment.`);
    }
    throw e;
  }
  let json: unknown;
  try {
    json = JSON.parse(text ?? "");
  } catch {
    throw new Error("Gemini's reply wasn't valid JSON. Try again.");
  }
  const parsed = SiteContent.safeParse(json);
  if (!parsed.success) throw new Error("Gemini's reply didn't fit the template. Try again.");
  return parsed.data;
}

export function canUseAi(): boolean {
  return !!apiKey();
}

/** Write the site: with Gemini when a key is set, otherwise the plain draft. */
export async function generateContent(i: Intake): Promise<{ content: SiteContent; writtenBy: "ai" | "draft" }> {
  if (!canUseAi()) return { content: draftContent(i), writtenBy: "draft" };
  return { content: await writeWithGemini(i), writtenBy: "ai" };
}
