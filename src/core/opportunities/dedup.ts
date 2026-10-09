/**
 * Provider-independent identity for external records, so the same tender or company found by two
 * providers (or two searches) is one item. Built from stable facts only — never from scores or text
 * that a provider might reword.
 */
import { normalizeText, normalizeUrl } from "@/core/dedup";
import { combine } from "./fields";
import type { Field, ModuleId, NormalizedItem } from "./types";

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Website host without "www." — the most stable identity for a company. */
export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function itemKey(module: ModuleId, parts: { id?: string | null; name?: string | null; url?: string | null; extra?: string | null }): string {
  switch (module) {
    case "tenders":
      // A notice's own identifier (e.g. an OCDS ocid) beats its URL; the URL beats title+buyer.
      if (parts.id) return `tender:id:${clean(parts.id)}`;
      if (parts.url) return `tender:url:${normalizeUrl(parts.url)}`;
      return `tender:t:${clean(parts.name)}|${clean(parts.extra)}`;
    case "sponsors":
    case "suppliers": {
      const host = hostOf(parts.url);
      return host ? `${module}:host:${host}` : `${module}:name:${normalizeText(parts.name)}|${clean(parts.extra)}`;
    }
    case "expansion":
      return `area:${clean(parts.id ?? parts.name)}|${clean(parts.extra)}`;
  }
}

/**
 * Merge items with the same key (e.g. two providers returning one tender). List fields are unioned;
 * single values that disagree become conflicts (each value keeps its own evidence) — never silently
 * overwritten.
 */
export function dedupe(items: NormalizedItem[]): NormalizedItem[] {
  const byKey = new Map<string, NormalizedItem>();
  for (const it of items) {
    const prev = byKey.get(it.key);
    if (!prev) {
      byKey.set(it.key, it);
      continue;
    }
    const fields = { ...prev.fields };
    for (const [k, f] of Object.entries(it.fields)) fields[k] = fields[k] ? mergeField(fields[k], f) : f;
    const links = [...prev.links];
    for (const l of it.links) if (!links.some((x) => x.url === l.url)) links.push(l);
    byKey.set(it.key, { ...prev, fields, links, provider: prev.provider === it.provider ? prev.provider : `${prev.provider}+${it.provider}` });
  }
  return [...byKey.values()];
}

function mergeField(a: Field, b: Field): Field {
  if (a.state === "known" && b.state === "known" && Array.isArray(a.value) && Array.isArray(b.value)) {
    const seen = new Set(a.value.map((v) => JSON.stringify(v)));
    const extra = b.value.filter((v) => !seen.has(JSON.stringify(v)));
    return { ...a, value: [...a.value, ...extra], evidence: [...a.evidence, ...b.evidence] };
  }
  const merged = combine(a, b);
  return a.meta || b.meta ? { ...merged, meta: { ...b.meta, ...a.meta } } : merged;
}
