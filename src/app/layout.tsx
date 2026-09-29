import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import "./globals.css";
import { logoutAction } from "./login/actions";
import { NavLinks } from "@/components/client";
import { SESSION_COOKIE } from "@/lib/session";

export const metadata: Metadata = {
  title: "Prospect CRM",
  description: "Track leads from first find to ready-to-apply, with a weekly check that does the sorting for you.",
};

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/records?list=ready", label: "Leads" },
  { href: "/accounts", label: "Companies" },
  { href: "/import", label: "Upload" },
  { href: "/privacy", label: "Privacy" },
  { href: "/settings", label: "Rules" },
  { href: "/history", label: "Activity" },
  { href: "/help", label: "Help" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="topnav" aria-label="Main">
            <Link href="/" className="brand">
              Prospect CRM
            </Link>
            {signedIn && (
              <>
                <NavLinks links={LINKS} />
                <span className="spacer" />
                <form action={logoutAction}>
                  <button type="submit" className="small">
                    Sign out
                  </button>
                </form>
              </>
            )}
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
