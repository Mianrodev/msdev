import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { logoutAction } from "./login/actions";
import { NavLinks } from "@/components/client";
import { backToMySpaceAction } from "./team/actions";
import { currentSession } from "@/services/request";
import { activeBrand, brandCss } from "@/brand/brands";

export function generateMetadata(): Metadata {
  const b = activeBrand();
  return {
    title: b.appName,
    description: b.id === "default" ? "Track leads from first find to ready-to-apply, with a weekly check that does the sorting for you." : b.tagline,
  };
}

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/discover", label: "Find leads" },
  { href: "/records?list=ready", label: "Leads" },
  { href: "/answers", label: "My answers" },
  { href: "/accounts", label: "Companies" },
  { href: "/connect", label: "Your AI" },
  { href: "/history", label: "Activity" },
  { href: "/help", label: "Help" },
  { href: "/settings", label: "Settings", also: ["/import", "/privacy", "/account", "/about-me"] },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  const brand = activeBrand();
  const signedIn = !!session;
  const links = session?.user.role === "owner" ? [...LINKS.slice(0, -1), { href: "/team", label: "Team" }, LINKS[LINKS.length - 1]] : LINKS;
  return (
    <html lang="en">
      <head>
        {/* Brand tokens (src/brand/brands.ts) — the default brand reproduces the original look. */}
        <style dangerouslySetInnerHTML={{ __html: brandCss(brand) }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="shell">
          <nav className="topnav" aria-label="Main">
            <Link href="/" className="brand">
              {brand.appName}
            </Link>
            {signedIn && (
              <>
                <NavLinks links={links} />
                <span className="spacer" />
                <form action={logoutAction}>
                  <button type="submit" className="small">
                    Sign out
                  </button>
                </form>
              </>
            )}
          </nav>
          {session?.viewing && (
            <div className="viewing-bar" role="status">
              <span>
                You&apos;re looking at <strong>{session.viewing.name}&apos;s space</strong>. Anything you change here is recorded
                under your name.
              </span>
              <form action={backToMySpaceAction}>
                <button type="submit" className="small">
                  Back to my space
                </button>
              </form>
            </div>
          )}
          <main id="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
