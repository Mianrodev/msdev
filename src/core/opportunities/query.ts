/** Validation helpers for search forms: blank inputs become "not set", never zero or an empty filter. */
import { z } from "zod";

type Raw = Record<string, string | string[] | undefined>;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const blankToUndef = (v: unknown) => {
  const x = first(v);
  return typeof x === "string" && x.trim() === "" ? undefined : typeof x === "string" ? x.trim() : x;
};

export const optText = (max = 500) => z.preprocess(blankToUndef, z.string().max(max).optional());
export const optNum = (min = 0, max = 1e13) =>
  z.preprocess((v) => {
    const x = blankToUndef(v);
    return typeof x === "string" ? Number(x.replace(/[,\s]/g, "")) : x;
  }, z.number().min(min).max(max).optional());
export const optDate = () => z.preprocess(blankToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31").optional());
/** Comma/newline separated text, or repeated form fields, as a list of up to `max` phrases. */
export const list = (max = 20) =>
  z.preprocess((v) => {
    const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n;]+/) : [];
    return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, max);
  }, z.array(z.string().max(120)));
export const choice = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess((v) => blankToUndef(v) ?? fallback, z.enum(values));
export const flag = () => z.preprocess((v) => ["on", "true", "yes", "1"].includes(String(first(v) ?? "").toLowerCase()), z.boolean());

/** Demo-only switches that make a provider fail, so the partial-result and error states can be seen. */
export const SIMULATIONS = ["none", "one_source_fails", "all_sources_fail"] as const;
export type Simulation = (typeof SIMULATIONS)[number];

export const commonQuery = {
  mode: choice(["demo", "live"] as const, "demo"),
  simulate: choice(SIMULATIONS, "none"),
};

export function toRaw(f: FormData | URLSearchParams): Raw {
  const out: Raw = {};
  for (const [k, v] of f.entries()) {
    if (typeof v !== "string") continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

/** First validation problem in plain words. */
export function firstIssue(e: z.ZodError): string {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "input"}: ${i.message}` : "Invalid input";
}
