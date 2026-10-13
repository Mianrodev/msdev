/**
 * The demo website as JSON, for the loader snippet on the GoHighLevel page
 * (which lives on another domain, hence the open CORS). Public, like /p/<slug>.
 */
import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { renderSite } from "@/forge/render";
import { getPublicDemo } from "@/forge/store";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/forge/[slug]">) {
  const { slug } = await ctx.params;
  const demo = await getPublicDemo(await getDb(), slug);
  if (!demo) return Response.json({ error: "This demo isn't available." }, { status: 404, headers: CORS });
  return Response.json(renderSite(demo), { headers: CORS });
}
