/**
 * Helpers for the demo providers. Demo records are fictional: organisations, people and figures are
 * invented, and every link uses the reserved `.example` domain so it can never point at a real site.
 * Dates are generated relative to "now" so the demo keeps working (and keeps its mix of open,
 * closing-soon and passed deadlines) whenever it's run.
 */
import type { Evidence, EvidenceKind } from "@/core/opportunities/types";
import type { Simulation } from "@/core/opportunities/query";
import { ProviderError } from "../types";

export const DEMO_NOTE = "Fictional demo data — not a real organisation, notice or figure.";

const DAY = 86_400_000;

export function daysFrom(now: Date, days: number, hourUtc = 12): Date {
  const d = new Date(now.getTime() + days * DAY);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const isoZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (d: Date) => `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const usDate = (d: Date) => `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
export const pad2 = (n: number) => String(n).padStart(2, "0");

export function evidenceMaker(provider: string, now: Date) {
  const retrievedAt = now.toISOString();
  return (kind: EvidenceKind, sourceUrl: string | null, quote: string | null, publishedAt: string | null = null, label?: string): Evidence => ({
    kind,
    provider,
    sourceUrl,
    retrievedAt,
    publishedAt,
    quote,
    ...(label ? { label } : {}),
  });
}

/** Demo-only failure switches, so partial and failed searches can be seen and tested. */
export function simulateFailure(simulate: Simulation | undefined, role: "primary" | "secondary") {
  if (simulate === "all_sources_fail") throw new ProviderError("Simulated outage (demo): this source didn't answer.");
  if (simulate === "one_source_fails" && role === "secondary") throw new ProviderError("Simulated timeout (demo): this source took too long to answer.");
}
