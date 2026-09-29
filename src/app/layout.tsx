import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prospect CRM",
  description: "Lead and prospect pipeline: discovery → screen → triage → verify.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="topnav">
            <Link href="/" className="brand">
              Prospect CRM
            </Link>
            <Link href="/records?view=leads">Leads</Link>
            <Link href="/records?view=prospects">Prospects</Link>
            <Link href="/records?view=hold">Hold</Link>
            <Link href="/records?view=archive">Archive</Link>
            <Link href="/accounts">Target accounts</Link>
            <Link href="/history">History</Link>
            <Link href="/settings">Rules &amp; settings</Link>
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
