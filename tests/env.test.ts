import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseUrl, directDatabaseUrl, missingHostedDatabase, onWorkers } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

function only(vars: Record<string, string>) {
  for (const k of Object.keys(process.env)) if (/DATABASE|POSTGRES/.test(k) || k === "VERCEL") delete process.env[k];
  Object.assign(process.env, vars);
}

describe("database URL discovery", () => {
  it("prefers the standard name", () => {
    only({ DATABASE_URL: "postgres://a", STORAGE_DATABASE_URL: "postgres://b" });
    expect(databaseUrl()).toBe("postgres://a");
  });
  it("finds a prefixed name from the Vercel integration", () => {
    only({ STORAGE_DATABASE_URL: "postgresql://b", STORAGE_DATABASE_URL_UNPOOLED: "postgresql://c" });
    expect(databaseUrl()).toBe("postgresql://b");
    expect(directDatabaseUrl()).toBe("postgresql://c");
  });
  it("ignores non-Postgres values and reports a missing hosted database", () => {
    only({ VERCEL: "1", SOME_DATABASE_URL: "mysql://x" });
    expect(databaseUrl()).toBeUndefined();
    expect(missingHostedDatabase()).toBe(true);
  });
  it("on Cloudflare Workers, also reports a missing database", () => {
    only({});
    expect(onWorkers()).toBe(false);
    expect(missingHostedDatabase()).toBe(false);
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    expect(onWorkers()).toBe(true);
    expect(missingHostedDatabase()).toBe(true);
    only({ DATABASE_URL: "postgres://a" });
    expect(missingHostedDatabase()).toBe(false);
  });
});
