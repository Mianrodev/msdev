import { NextResponse, type NextRequest } from "next/server";
import { missingHostedDatabase } from "@/lib/env";
import { authConfigured, authRequired, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Every page, form submission and export requires a signed-in owner. */
const setupPage = (msg: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup needed</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px"><h1 style="font-size:1.3rem">Almost there</h1><p>${msg}</p></body>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (missingHostedDatabase()) {
    return setupPage("No database is connected yet. In Vercel, open this project → <b>Storage</b> → create a <b>Neon</b> database and connect it, then <b>Redeploy</b>.");
  }
  if (pathname === "/login" || !authRequired()) return NextResponse.next();

  if (!authConfigured()) {
    return setupPage("The app is locked because no password has been set. In Vercel, open this project → <b>Settings → Environment Variables</b>, add <b>APP_PASSWORD</b> with the password you want, then <b>Redeploy</b>.");
  }
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (req.method !== "GET") return new NextResponse("Please sign in again.", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
