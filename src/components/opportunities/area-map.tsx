/**
 * Schematic map of candidate areas: positions to scale from their published centre points, no
 * basemap tiles (so no third-party tile terms, keys or tracking). Each pin links to the area's detail
 * page; the comparison table next to it is the accessible equivalent. A designer can swap in a tile
 * map (Leaflet/MapLibre + a licensed tile provider) by replacing this component — it only takes points.
 */
import Link from "next/link";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rank: number;
  score: number | null;
  href: string;
}

const W = 640;
const H = 400;
const PAD = 46;

export function AreaMap({ points, caption }: { points: MapPoint[]; caption: string }) {
  if (!points.length) return null;
  const midLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p.lng * kx);
  const ys = points.map((p) => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  const s = Math.min((W - 2 * PAD) / span, (H - 2 * PAD) / span);
  const ox = (W - (x1 - x0) * s) / 2;
  const oy = (H - (y1 - y0) * s) / 2;
  const pos = (p: MapPoint) => ({ x: ox + (p.lng * kx - x0) * s, y: H - (oy + (p.lat - y0) * s) });
  const kmPerUnit = 111.32; // 1° latitude ≈ 111 km
  const scaleKm = Math.max(1, Math.round(((W - 2 * PAD) / 4 / s) * kmPerUnit));
  const scalePx = (scaleKm / kmPerUnit) * s;
  return (
    <figure className="op-map" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${caption}. ${points.length} areas; pins are numbered by rank. The table lists the same areas.`}>
        <g>
          <line x1={PAD} x2={PAD + scalePx} y1={H - 18} y2={H - 18} stroke="currentColor" strokeWidth="2" opacity=".5" />
          <text x={PAD + scalePx + 6} y={H - 14} fontSize="11" fill="currentColor" opacity=".7">
            {scaleKm} km
          </text>
        </g>
        {[...points].reverse().map((p) => {
          const { x, y } = pos(p);
          const strong = p.score !== null && p.score >= 60;
          return (
            <g key={p.id} className="pin">
              <Link href={p.href}>
                <title>{`#${p.rank} ${p.name} — ${p.score === null ? "not scored" : `score ${Math.round(p.score)}`}`}</title>
                <circle cx={x} cy={y} r={p.rank <= 3 ? 15 : 12} fill={p.score === null ? "var(--muted)" : strong ? "var(--accent)" : "color-mix(in srgb, var(--accent) 55%, var(--muted))"} />
                <text x={x} y={y + 4} textAnchor="middle">
                  {p.rank}
                </text>
                <text className="label" x={x} y={y - 19} textAnchor="middle" fontSize="12">
                  {p.name}
                </text>
              </Link>
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">Schematic: positions to scale, no basemap. Darker pins score higher; grey = not scored.</figcaption>
    </figure>
  );
}
