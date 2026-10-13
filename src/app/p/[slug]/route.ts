/**
 * Public demo website: /p/<slug>. No sign-in — the link itself is the access,
 * so it can be sent to a prospect. Archived demos stop working.
 */
import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { renderPage } from "@/forge/render";
import { getPublicDemo } from "@/forge/store";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/p/[slug]">) {
  const { slug } = await ctx.params;
  const demo = await getPublicDemo(await getDb(), slug);
  if (!demo)
    return new Response("This demo isn't available.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(renderPage(demo), {
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store" },
  });
}
