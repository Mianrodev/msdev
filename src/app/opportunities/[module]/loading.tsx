export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <div className="op-skel" style={{ height: "2rem", width: "40%", marginBottom: "1rem" }} />
      <div className="op-search">
        <div className="op-skel" style={{ height: "28rem" }} />
        <div style={{ display: "grid", gap: "1rem" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="op-skel" style={{ height: "9rem" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
