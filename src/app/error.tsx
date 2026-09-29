"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card" style={{ maxWidth: 560, margin: "8vh auto 0" }}>
      <h1>Something went wrong</h1>
      <p className="intro">
        That didn&apos;t work, but nothing has been lost. Try again — if it keeps happening, go back to the home page.
      </p>
      <div className="row">
        <button className="primary" onClick={() => reset()}>
          Try again
        </button>
        <Link className="button" href="/">
          Go to Home
        </Link>
      </div>
    </div>
  );
}
