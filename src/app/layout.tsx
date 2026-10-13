import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { signOutAction } from "./login/actions";
import { activeBrand, brandCss } from "@/brand/brands";
import { currentSession } from "@/services/request";

export function generateMetadata(): Metadata {
  const b = activeBrand();
  return { title: b.productName, description: b.tagline };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const brand = activeBrand();
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
          <main id="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
