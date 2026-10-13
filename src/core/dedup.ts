/** Text and URL normalisation used to recognise the same organisation or page across sources. */

const TRACKING_PARAMS = /^(utm_[a-z]+|gclid|fbclid|mc_[a-z]+|ref|refid|trk|trackingid|src|source)$/i;

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // "Acme (client undisclosed)" is Acme
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|limited|gmbh|plc|pvt|private|corp|co|corporation|company|the)\b\.?/g, " ")
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

