/**
 * Forge Demo public websites on Cloudflare Workers (Free plan).
 *
 *   GET /<slug>       the demo website (full page)
 *   GET /api/<slug>   the same site as JSON, for the GoHighLevel loader snippet
 *
 * It reads the demo straight from the CRM's database (forge_demos) and draws it
 * with the same template as the CRM (src/forge/render.ts). Nothing here needs
 * Next.js, so a request costs a few milliseconds of CPU — well inside the Free
 * plan's 10 ms. Responses are cached for a minute at Cloudflare's edge.
 */
import postgres from "postgres";
import { renderPage, renderSite } from "../../src/forge/render";
import { Intake, SiteContent, type Demo } from "../../src/forge/schema";

interface Env {
  DATABASE_URL: string;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const SLUG = /^[a-z0-9-]{3,64}$/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
const CACHE = "public, max-age=60";

const notFound = (json: boolean) =>
  json
    ? Response.json({ error: "This demo isn't available." }, { status: 404, headers: CORS })
    : new Response("This demo isn't available.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

async function loadDemo(env: Env, ctx: Ctx, slug: string): Promise<Demo | null> {
  // One short-lived connection per request (a Worker can't keep one between requests).
  const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1, fetch_types: false });
  try {
    const rows = await sql`
      select slug, intake, content, written_by, created_at, updated_at
      from forge_demos where slug = ${slug} and status = 'active' limit 1`;
    const r = rows[0];
    if (!r) return null;
    return {
      slug: r.slug,
      intake: Intake.parse(r.intake),
      content: SiteContent.parse(r.content),
      writtenBy: r.written_by === "draft" ? "draft" : "ai",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } finally {
    ctx.waitUntil(sql.end());
  }
}

const worker = {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    const json = path.startsWith("/api/");
    const slug = json ? path.slice(5) : path.slice(1);
    if (!slug) return new Response("Forge Demo", { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (!SLUG.test(slug)) return notFound(json);

    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(req);
    if (hit) return hit;

    const demo = await loadDemo(env, ctx, slug);
    if (!demo) return notFound(json);
    const res = json
      ? Response.json(renderSite(demo), { headers: { ...CORS, "cache-control": CACHE } })
      : new Response(renderPage(demo), {
          headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": CACHE },
        });
    ctx.waitUntil(cache.put(req, res.clone()));
    return res;
  },
};

export default worker;
