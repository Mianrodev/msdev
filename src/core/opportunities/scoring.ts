/**
 * Score aggregation — deterministic and transparent.
 *
 * Each component scores 0..1 or `null` (inputs unknown). Unknown components are left out of the
 * average rather than counted as zero or as a pass, and `coverage` says how much of the weight could
 * be scored, so a high score built on little data is visibly less reliable than one built on a lot.
 */
import type { MatchResult, ScoreComponent } from "./types";

export function aggregate(components: ScoreComponent[]): Pick<MatchResult, "score" | "coverage" | "components"> {
  const total = components.reduce((s, c) => s + Math.max(0, c.weight), 0);
  const scored = components.filter((c) => c.score !== null && c.weight > 0);
  const scoredWeight = scored.reduce((s, c) => s + c.weight, 0);
  const sum = scored.reduce((s, c) => s + c.weight * clamp01(c.score!), 0);
  return {
    score: scoredWeight > 0 ? Math.round((sum / scoredWeight) * 1000) / 10 : null,
    coverage: total > 0 ? Math.round((scoredWeight / total) * 1000) / 1000 : 0,
    components,
  };
}

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Min–max normalise one metric across candidates to 0..1 so metrics in different units can be
 * combined. `direction: "lower"` means smaller raw values are better. Missing values stay null.
 * When every known value is equal the metric can't tell candidates apart: all get 0.5.
 */
export function normalize(values: (number | null)[], direction: "higher" | "lower" = "higher"): (number | null)[] {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!known.length) return values.map(() => null);
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null;
    if (hi === lo) return 0.5;
    const n = (v - lo) / (hi - lo);
    return direction === "higher" ? n : 1 - n;
  });
}

/** Sort ranked results: excluded last, then score (unknown scores after known), then coverage. */
export function byScore<T extends { match: MatchResult }>(a: T, b: T): number {
  const ea = a.match.excluded ? 1 : 0;
  const eb = b.match.excluded ? 1 : 0;
  if (ea !== eb) return ea - eb;
  const sa = a.match.score ?? -1;
  const sb = b.match.score ?? -1;
  if (sb !== sa) return sb - sa;
  return b.match.coverage - a.match.coverage;
}

export function pct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}
