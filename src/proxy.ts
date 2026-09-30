import { NextResponse, type NextRequest } from "next/server";
import { missingHostedDatabase } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/session";

const setupPage = (msg: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup needed</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px"><h1 style="font-size:1.3rem">Almost there</h1><p>${msg}</p></body>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );

/**
 * First gate: send visitors without a session cookie to sign in. The cookie's
 * signature is verified on every data access (src/services/request.ts).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (missingHostedDatabase()) {
    return setupPage(
      "No database is connected yet. In Vercel, open this project → <b>Storage</b> → create a <b>Neon</b> database and connect it, then <b>Redeploy</b>.",
    );
  }
  // The weekly scheduler and your AI have no login cookie; those routes check their own caller (see their files).
  // Invite links (/join/…) are how new team members get their first password.
  if (
    pathname === "/login" ||
    pathname === "/api/cron/weekly" ||
    pathname.startsWith("/api/mcp/") ||
    pathname.startsWith("/join/") ||
    req.cookies.has(SESSION_COOKIE)
  )
    return NextResponse.next();
  if (req.method !== "GET") return new NextResponse("Please sign in again.", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
