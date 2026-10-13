import "server-only";
import { headers } from "next/headers";

/**
 * Where demo websites are served. With FORGE_SITES_URL set (the Cloudflare
 * worker in cloudflare/forge-sites), links point there; otherwise at this app.
 */
export async function demoSites(): Promise<{ page: (slug: string) => string; api: string; external: boolean }> {
  const ext = (process.env.FORGE_SITES_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\//.test(ext)) return { page: (s) => `${ext}/${s}`, api: `${ext}/api/`, external: true };
  const base = await appBaseUrl();
  return { page: (s) => `${base}/p/${s}`, api: `${base}/api/forge/`, external: false };
}

/** This app's address as the visitor reached it (for building shareable links). */
export async function appBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
