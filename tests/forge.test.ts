import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { draftContent, generateContent, parseReviews, splitList } from "@/forge/generate";
import { loaderSnippet } from "@/forge/loader";
import { presetFor } from "@/forge/presets";
import { renderPage, renderSite } from "@/forge/render";
import { Intake, SiteContent, type Demo } from "@/forge/schema";
import { createDemo, getPublicDemo, ghlLink, listDemos, makeSlug, regenerateDemo, setDemoStatus } from "@/forge/store";
import { testCtx } from "./helpers";

const demoOf = (intake: Intake): Demo => {
  const now = new Date().toISOString();
  return { slug: "test-0000", intake, content: draftContent(intake), writtenBy: "draft", createdAt: now, updatedAt: now };
};

describe("Forge demo — content", () => {
  it("drafts complete, valid content from just a business name", () => {
    const c = draftContent(Intake.parse({ businessName: "Acme Services" }));
    expect(SiteContent.safeParse(c).success).toBe(true);
    expect(c.services.items.length).toBeGreaterThan(0);
  });

  it("picks the trade from the industry, name or services", () => {
    expect(presetFor("", "Cloud Peak Plumbing", "").industry).toBe("Plumbing");
    expect(presetFor("HVAC", "Smith & Sons", "").industry).toBe("HVAC");
    expect(presetFor("", "Smith & Sons", "roof repair, gutters").industry).toBe("Roofing");
    expect(presetFor("", "Smith & Sons", "").industry).toBe("Home Services");
  });

  it("uses the services, areas and brand colour that were given", () => {
    const c = draftContent(
      Intake.parse({ businessName: "Xo Co", services: "Drain Cleaning, Gas Lines", serviceAreas: "Conway\nAynor", primaryColor: "#112233" }),
    );
    expect(c.services.items.map((s) => s.title)).toEqual(["Drain Cleaning", "Gas Lines"]);
    expect(c.areas.places).toEqual(["Conway", "Aynor"]);
    expect(c.theme.primary).toBe("#112233");
  });

  it("marks reviews as samples unless real ones were given", () => {
    expect(draftContent(Intake.parse({ businessName: "Xo Co" })).reviews.real).toBe(false);
    const c = draftContent(Intake.parse({ businessName: "Xo Co", reviews: '"Great job, fast." — Maria G., Conway\n\nVery tidy work.' }));
    expect(c.reviews.real).toBe(true);
    expect(c.reviews.items[0]).toEqual({ quote: "Great job, fast.", name: "Maria G.", context: "Conway" });
    expect(c.reviews.items[1].name).toBe("Verified customer");
  });

  it("splits lists on commas, semicolons and new lines", () => {
    expect(splitList(" a, b;c\n\n d ")).toEqual(["a", "b", "c", "d"]);
    expect(parseReviews("")).toEqual([]);
  });

  it("sends Gemini a schema the parser and template agree on", async () => {
    const { z } = await import("zod");
    const schema = z.toJSONSchema(SiteContent) as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toEqual(Object.keys(SiteContent.shape));
    expect(JSON.stringify(schema)).not.toContain('"pattern"');
  });

  it("rejects a non-colour and a non-link", () => {
    expect(Intake.safeParse({ businessName: "Xo Co", primaryColor: "blue" }).success).toBe(false);
    expect(Intake.safeParse({ businessName: "Xo Co", logoUrl: "not a link" }).success).toBe(false);
  });

  describe("without an API key", () => {
    const saved = { key: process.env.GEMINI_API_KEY, google: process.env.GOOGLE_API_KEY };
    beforeEach(() => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
    });
    afterEach(() => {
      if (saved.key !== undefined) process.env.GEMINI_API_KEY = saved.key;
      if (saved.google !== undefined) process.env.GOOGLE_API_KEY = saved.google;
    });
    it("drafts the site instead of calling Gemini", async () => {
      const r = await generateContent(Intake.parse({ businessName: "Acme Roofing" }));
      expect(r.writtenBy).toBe("draft");
      expect(r.content.industry).toBe("Roofing");
    });
  });
});

describe("Forge demo — template", () => {
  it("escapes everything typed in", () => {
    const html = renderSite(demoOf(Intake.parse({ businessName: '<script>alert(1)</script> & "Co"', city: "<b>Town</b>" }))).html;
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;");
    expect(html).not.toContain("<b>Town</b>");
  });

  it("ignores colours that aren't #rrggbb", () => {
    const d = demoOf(Intake.parse({ businessName: "Acme" }));
    d.content.theme = { primary: "#abc", dark: "red}</style><script>x</script>" };
    const html = renderSite(d).html;
    expect(html).toContain("--p:#aabbcc");
    expect(html).toContain("--d:#0f172a");
    expect(html).not.toContain("<script>x");
  });

  it("has no scripts, so it can be injected into another page", () => {
    expect(renderSite(demoOf(Intake.parse({ businessName: "Acme" }))).html).not.toMatch(/<script/i);
  });

  it("links the phone number and shows the logo when given", () => {
    const html = renderSite(demoOf(Intake.parse({ businessName: "Acme", phone: "(646) 594-9379", logoUrl: "https://x.test/logo.png" }))).html;
    expect(html).toContain('href="tel:+16465949379"');
    expect(html).toContain('src="https://x.test/logo.png"');
  });

  it("renders a full page with title and noindex", () => {
    const page = renderPage(demoOf(Intake.parse({ businessName: "Acme", city: "Conway" })));
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain("<title>Acme | Home Services in Conway</title>");
    expect(page).toContain('name="robots" content="noindex"');
  });

  it("builds a loader that calls this app's API", () => {
    expect(loaderSnippet("https://crm.example.com/")).toContain('"https://crm.example.com/api/forge/"');
  });
});

describe("Forge demo — storage", () => {
  it("makes readable, unique slugs", () => {
    const a = makeSlug("Vanguard Pipe & Water");
    expect(a).toMatch(/^vanguard-pipe-water-[0-9a-f]{4}$/);
    expect(makeSlug("Vanguard Pipe & Water")).not.toBe(a);
    expect(makeSlug("!!!")).toMatch(/^demo-[0-9a-f]{4}$/);
  });

  it("adds ?d=<slug> to the GoHighLevel page", () => {
    expect(ghlLink("https://site.com/demo?x=1", "acme-1234")).toBe("https://site.com/demo?x=1&d=acme-1234");
    expect(ghlLink("", "acme-1234")).toBe("");
  });

  it("saves, lists, rewrites and archives a demo", async () => {
    const saved = { key: process.env.GEMINI_API_KEY, google: process.env.GOOGLE_API_KEY };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      const ctx = await testCtx();
      const d = await createDemo(ctx, Intake.parse({ businessName: "Acme Plumbing", city: "Conway" }));
      expect(d.writtenBy).toBe("draft");
      expect((await listDemos(ctx)).map((r) => r.slug)).toEqual([d.slug]);
      expect((await getPublicDemo(ctx.db, d.slug))?.intake.city).toBe("Conway");

      const r = await regenerateDemo(ctx, d.slug, Intake.parse({ businessName: "Acme Plumbing", city: "Aynor" }));
      expect(r.slug).toBe(d.slug);
      expect(r.content.areas.places).toEqual(["Aynor"]);

      await setDemoStatus(ctx, d.slug, "archived");
      expect(await getPublicDemo(ctx.db, d.slug)).toBeNull();
      expect(await listDemos(ctx)).toEqual([]);
      expect(await getPublicDemo(ctx.db, "../etc")).toBeNull();
    } finally {
      if (saved.key !== undefined) process.env.GEMINI_API_KEY = saved.key;
      if (saved.google !== undefined) process.env.GOOGLE_API_KEY = saved.google;
    }
  });
});
