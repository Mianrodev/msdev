/**
 * Forge Demo on Cloudflare Workers (Free plan): build a demo website from a
 * business name, share it, and show it on a GoHighLevel page.
 *
 * Public:   GET /s/<slug>          the demo website
 *           GET /api/s/<slug>      the same as JSON (open CORS) for the GoHighLevel loader
 * Team:     /, /demos/<slug>, /settings (signed in with the team password)
 */
import { renderPage, renderSite } from "../../../src/forge/render";
import { loaderSnippet } from "../../../src/forge/loader";
import { Intake, type Demo } from "../../../src/forge/schema";
import { checkPassword, sessionCookie, signedIn, signOutCookie } from "./auth";
import { archiveDemo, getDemo, getSetting, listDemos, makeSlug, saveDemo, setSetting } from "./db";
import type { Ctx, Env } from "./env";
import { writeCopy } from "./gemini";
import { demoPage, homePage, loginPage, settingsPage } from "./ui";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
const GHL_KEY = "ghlPageUrl";

const redirect = (to: string, extra: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, ...extra } });
const withMsg = (path: string, kind: "ok" | "error", text: string) => `${path}?${kind}=${encodeURIComponent(text)}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "Something went wrong.";

function intakeFrom(f: FormData): Intake {
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const parsed = Intake.safeParse({
    businessName: g("businessName"),
    industry: g("industry"),
    city: g("city"),
    phone: g("phone"),
    services: g("services"),
    serviceAreas: g("serviceAreas"),
    reviews: g("reviews"),
    notes: g("notes"),
    logoUrl: g("logoUrl"),
    heroImageUrl: g("heroImageUrl"),
    primaryColor: g("primaryColor"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(". "));
  return parsed.data;
}

function ghlLink(pageUrl: string, slug: string): string {
  if (!pageUrl) return "";
  try {
    const u = new URL(pageUrl);
    u.searchParams.set("d", slug);
    return u.toString();
  } catch {
    return "";
  }
}

async function publicSite(req: Request, env: Env, ctx: Ctx, slug: string, json: boolean): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(req);
  if (hit) return hit;
  const demo = await getDemo(env, slug);
  if (!demo)
    return json
      ? Response.json({ error: "This demo isn't available." }, { status: 404, headers: CORS })
      : new Response("This demo isn't available.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const res = json
    ? Response.json(renderSite(demo), { headers: { ...CORS, "cache-control": "public, max-age=30" } })
    : new Response(renderPage(demo), {
        headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "public, max-age=30" },
      });
  ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}

async function handle(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const q = (k: string) => url.searchParams.get(k) ?? undefined;
  const origin = url.origin;
  const site = (slug: string) => `${origin}/s/${slug}`;

  // Public demo websites.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  let m = path.match(/^\/s\/([a-z0-9-]+)$/);
  if (m && req.method === "GET") return publicSite(req, env, ctx, m[1], false);
  m = path.match(/^\/api\/s\/([a-z0-9-]+)$/);
  if (m && req.method === "GET") return publicSite(req, env, ctx, m[1], true);

  // Sign-in.
  if (path === "/login" && req.method === "POST") {
    const f = await req.formData();
    if (await checkPassword(env, String(f.get("password") ?? ""))) return redirect("/", { "set-cookie": await sessionCookie(env) });
    return loginPage("That password isn't right.", !env.FORGE_PASSWORD);
  }
  if (path === "/logout" && req.method === "POST") return redirect("/login", { "set-cookie": signOutCookie });
  if (!(await signedIn(req, env))) return path === "/login" || req.method === "GET" ? loginPage(undefined, !env.FORGE_PASSWORD) : redirect("/login");
  if (path === "/login") return redirect("/");

  const aiOn = !!env.GEMINI_API_KEY;

  if (path === "/" && req.method === "GET") return homePage(await listDemos(env), site, aiOn, q("error"), q("ok"));

  if (path === "/demos" && req.method === "POST") {
    try {
      const intake = intakeFrom(await req.formData());
      const { content, writtenBy } = await writeCopy(env, intake);
      const now = new Date().toISOString();
      const demo: Demo = { slug: makeSlug(intake.businessName), intake, content, writtenBy, createdAt: now, updatedAt: now };
      await saveDemo(env, demo);
      return redirect(withMsg(`/demos/${demo.slug}`, "ok", "Demo website ready"));
    } catch (e) {
      return redirect(withMsg("/", "error", errText(e)));
    }
  }

  m = path.match(/^\/demos\/([a-z0-9-]+)(\/rewrite|\/archive)?$/);
  if (m) {
    const [, slug, action] = m;
    const demo = await getDemo(env, slug);
    if (!demo) return redirect(withMsg("/", "error", "That demo doesn't exist or was archived."));
    if (!action && req.method === "GET") {
      const ghl = ghlLink(await getSetting(env, GHL_KEY), slug);
      return demoPage(demo, { site: site(slug), ghl }, aiOn, q("ok"), q("error"));
    }
    if (action === "/rewrite" && req.method === "POST") {
      try {
        const intake = intakeFrom(await req.formData());
        const { content, writtenBy } = await writeCopy(env, intake);
        await saveDemo(env, { ...demo, intake, content, writtenBy, updatedAt: new Date().toISOString() });
        return redirect(withMsg(`/demos/${slug}`, "ok", "Rewritten (same links). The public page refreshes within 30 seconds."));
      } catch (e) {
        return redirect(withMsg(`/demos/${slug}`, "error", errText(e)));
      }
    }
    if (action === "/archive" && req.method === "POST") {
      await archiveDemo(env, slug);
      return redirect(withMsg("/", "ok", `Archived ${demo.intake.businessName}. Its links stop working within 30 seconds.`));
    }
  }

  if (path === "/settings" && req.method === "GET")
    return settingsPage(await getSetting(env, GHL_KEY), loaderSnippet(`${origin}/api/s/`), q("ok"), q("error"));
  if (path === "/settings" && req.method === "POST") {
    const raw = String((await req.formData()).get("ghlPageUrl") ?? "").trim();
    if (raw && !/^https?:\/\/[^\s]+$/.test(raw)) return redirect(withMsg("/settings", "error", "Paste the full page address, starting with https://"));
    await setSetting(env, GHL_KEY, raw);
    return redirect(withMsg("/settings", "ok", raw ? "GoHighLevel page saved" : "GoHighLevel page removed"));
  }

  return new Response("Not found", { status: 404 });
}

const worker = {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    try {
      return await handle(req, env, ctx);
    } catch (e) {
      console.error(e);
      return new Response("Something went wrong. Please try again.", { status: 500 });
    }
  },
};

export default worker;
