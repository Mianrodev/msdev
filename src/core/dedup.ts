/**
 * Deduplication identity: (account, opportunity, source/next-step URL).
 * A repeat updates the existing record in place; it never creates a duplicate.
 */

const TRACKING_PARAMS = /^(utm_[a-z]+|gclid|fbclid|mc_[a-z]+|ref|refid|trk|trackingid|src|source)$/i;

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|corp|co|corporation|company|the)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Scheme, www., fragment, trailing slash and tracking params don't change identity. */
export function normalizeUrl(u: string | null | undefined): string {
  const raw = (u ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    const params = [...url.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? `?${new URLSearchParams(params).toString()}` : "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${qs}`;
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

export interface DedupInput {
  account?: string | null;
  opportunity?: string | null;
  sourceUrl?: string | null;
  nextStepUrl?: string | null;
}

/** The URL part prefers the source URL, falling back to the next-step URL. */
export function dedupKey(r: DedupInput): string {
  const url = normalizeUrl(r.sourceUrl) || normalizeUrl(r.nextStepUrl);
  return [normalizeText(r.account), normalizeText(r.opportunity), url].join("|");
}

export function targetAccountKey(name: string | null | undefined, website?: string | null): string {
  const host = normalizeUrl(website).split("/")[0] ?? "";
  return [normalizeText(name), host].join("|");
}
