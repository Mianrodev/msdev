import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { signOutAction } from "./login/actions";
import { activeBrand, brandCss } from "@/brand/brands";
import { NoDatabaseError } from "@/db/client";
import { currentSession } from "@/services/request";

export function generateMetadata(): Metadata {
  const b = activeBrand();
  return { title: b.productName, description: b.tagline };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = activeBrand();
  let session: Awaited<ReturnType<typeof currentSession>> = null;
  let noDatabase = false;
  try {
    session = await currentSession();
  } catch (e) {
    if (!(e instanceof NoDatabaseError)) throw e;
    noDatabase = true;
  }
  return (
    <html lang="en">
      <head>
        {/* Brand tokens (src/brand/brands.ts). */}
        <style dangerouslySetInnerHTML={{ __html: brandCss(brand) }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="shell">
          <nav className="topnav" aria-label="Main">
            <Link href="/opportunities" className="brand">
              {brand.productName}
            </Link>
            {session && (
              <>
                <span className="spacer" />
                <Link href="/account">{session.user.role === "owner" ? "Account & team" : "Account"}</Link>
                <form action={signOutAction}>
                  <button type="submit" className="small">
                    Sign out
                  </button>
                </form>
              </>
            )}
          </nav>
          <main id="main">
            {noDatabase ? (
              <section className="card">
                <h1>Almost there</h1>
                <p>
                  No database is connected yet. In Cloudflare, open this Worker → <b>Settings</b> → <b>Bindings</b> → add a <b>D1 database</b> with
                  the variable name <code>DB</code>, then deploy again.
                </p>
              </section>
            ) : (
              children
            )}
          </main>
        </div>
      </body>
    </html>
  );
}
