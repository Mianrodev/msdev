/**
 * Load owner identity terms from a local, gitignored JSON file into the
 * workspace's redaction setting. The file never enters the repo or the UI;
 * only a count is logged to History.
 */
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "../../src/services/context";
import { getIdentityTerms, IDENTITY_TERMS_KEY, setSetting } from "../../src/services/rules";

export function syncIdentityTerms(ctx: Ctx, file = process.env.IDENTITY_FILE ?? "data/identity.local.json") {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) return null;
  const json = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
  const terms = new Set<string>();
  for (const [k, v] of Object.entries(json)) {
    if (k.startsWith("_")) continue;
    for (const t of Array.isArray(v) ? v : [v]) {
      if (typeof t === "string" && t.trim().length >= 2) terms.add(t.trim());
    }
  }
  const next = [...terms].sort((a, b) => b.length - a.length); // longest first so full names win
  const current = getIdentityTerms(ctx);
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    setSetting(ctx, IDENTITY_TERMS_KEY, next, `Loaded ${next.length} identity terms from local file`);
  }
  return next.length;
}
