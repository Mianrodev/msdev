import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: 560, margin: "8vh auto 0" }}>
      <h1>We couldn&apos;t find that page</h1>
      <p className="intro">The link may be old, or the item isn&apos;t in your workspace.</p>
      <div className="row">
        <Link className="button primary" href="/opportunities">
          Go to Opportunities
        </Link>
        <Link className="button" href="/opportunities/saved">
          Saved & lists
        </Link>
      </div>
    </div>
  );
}
