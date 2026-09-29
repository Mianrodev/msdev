import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: 560, margin: "8vh auto 0" }}>
      <h1>We couldn&apos;t find that page</h1>
      <p className="intro">The link may be old, or the item may have moved. Nothing is ever deleted, so try searching your leads.</p>
      <div className="row">
        <Link className="button primary" href="/">
          Go to Home
        </Link>
        <Link className="button" href="/records?list=all">
          Search all leads
        </Link>
      </div>
    </div>
  );
}
