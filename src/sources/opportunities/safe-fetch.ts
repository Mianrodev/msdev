/**
 * The only module in the opportunities product allowed to make network requests (see eslint.config.mjs).
 *
 * Every request is a read-only GET to an https host the calling provider declares up front. Before
 * connecting, the host's addresses are resolved and refused if any is private, loopback, link-local
 * or otherwise internal; redirects are followed only to hosts that pass the same checks (at most 3).
 * Requests time out, bodies are size-capped, and retries are bounded (429/5xx/network errors only).
 * It never sends credentials it wasn't given, never POSTs, and never contacts anyone.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}
export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** True for addresses that must never be reached from the server: private, loopback, link-local, CGNAT, multicast, reserved. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (x === "::" || x === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8");
  }
  return true; // not an IP at all: refuse
}

/** Validate a URL against a provider's allowlist. Throws UnsafeUrlError with a plain reason. */
export function checkUrl(raw: string, allowHosts: readonly string[]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid web address");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError("Only https addresses are fetched");
  if (u.username || u.password) throw new UnsafeUrlError("Addresses with embedded credentials are refused");
  if (u.port && u.port !== "443") throw new UnsafeUrlError("Non-standard ports are refused");
  const host = u.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, ""))) throw new UnsafeUrlError("Raw IP addresses are refused");
  if (!allowHosts.includes(host)) throw new UnsafeUrlError(`${host} is not an allowed host for this provider`);
  return u;
}

export type Lookup = (host: string) => Promise<{ address: string }[]>;
const defaultLookup: Lookup = (host) => dnsLookup(host, { all: true, verbatim: true });

export interface SafeFetchOptions {
  allowHosts: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
  /** Extra attempts after the first, for 429/5xx/network errors only. */
  retries?: number;
  headers?: Record<string, string>;
  lookup?: Lookup;
  fetchImpl?: typeof fetch;
  /** Waits between retries (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_REDIRECTS = 3;

async function assertPublicHost(host: string, lookup: Lookup) {
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host);
  } catch {
    throw new FetchError(`Couldn't find ${host}`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new UnsafeUrlError(`${host} resolves to a private or internal address`);
}

/** GET a URL and return its body text. Throws FetchError / UnsafeUrlError with plain messages. */
export async function safeGetText(url: string, opts: SafeFetchOptions): Promise<{ status: number; text: string; url: string }> {
  const { allowHosts, timeoutMs = 15_000, maxBytes = 8 * 1024 * 1024, retries = 2, lookup = defaultLookup, fetchImpl = fetch } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempt = 0;
  for (;;) {
    try {
      let current = checkUrl(url, allowHosts);
      for (let hop = 0; ; hop++) {
        await assertPublicHost(current.hostname, lookup);
        const res = await fetchImpl(current.toString(), {
          method: "GET",
          headers: { accept: "application/json", "user-agent": "OpportunityDesk/1.0 (read-only research)", ...opts.headers },
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
          await res.body?.cancel();
          if (hop >= MAX_REDIRECTS) throw new FetchError("Too many redirects");
          current = checkUrl(new URL(res.headers.get("location")!, current).toString(), allowHosts);
          continue;
        }
        if (RETRYABLE.has(res.status) && attempt < retries) {
          await res.body?.cancel();
          const after = Number(res.headers.get("retry-after"));
          throw Object.assign(new FetchError(`Answered ${res.status}`, res.status), { retryAfterMs: Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 5_000) : null });
        }
        if (res.status !== 200) {
          await res.body?.cancel();
          throw new FetchError(res.status === 429 ? "The provider asked us to slow down (rate limit). Try again later." : `The provider answered ${res.status}`, res.status);
        }
        const declared = Number(res.headers.get("content-length") ?? 0);
        if (declared > maxBytes) {
          await res.body?.cancel();
          throw new FetchError("The response was larger than allowed");
        }
        const text = await res.text();
        if (text.length > maxBytes) throw new FetchError("The response was larger than allowed");
        return { status: res.status, text, url: current.toString() };
      }
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw e;
      const status = e instanceof FetchError ? e.status : undefined;
      const retryable = status === undefined ? !(e instanceof FetchError) : RETRYABLE.has(status) && "retryAfterMs" in (e as object);
      if (!retryable || attempt >= retries) {
        if (e instanceof FetchError) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        throw new FetchError(/abort|timeout/i.test(msg) ? "The provider took too long to answer" : "Couldn't reach the provider");
      }
      attempt++;
      const wait = (e as { retryAfterMs?: number | null }).retryAfterMs ?? 400 * 2 ** attempt;
      await sleep(wait);
    }
  }
}

export async function safeGetJson(url: string, opts: SafeFetchOptions): Promise<unknown> {
  const { text } = await safeGetText(url, opts);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FetchError("The provider sent something that isn't valid data");
  }
}
