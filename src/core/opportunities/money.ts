/**
 * Money amounts as published ("£250,000", "Up to €80k", "USD 1.2m – 1.5m"). Parsing never invents a
 * currency: a bare number stays currency-unknown. Ranges keep both ends.
 */

export interface Money {
  raw: string;
  currency: string | null;
  min: number | null;
  max: number | null;
  qualifier: "exact" | "range" | "up_to" | "from";
}

const SYMBOLS: Record<string, string> = { "£": "GBP", "€": "EUR", $: "USD", "₹": "INR", "¥": "JPY", "A$": "AUD", "C$": "CAD", "NZ$": "NZD", "S$": "SGD", "US$": "USD" };
const CODES = /\b(GBP|EUR|USD|INR|AUD|CAD|NZD|SGD|JPY|CHF|SEK|NOK|DKK|AED|ZAR)\b/i;

function amount(num: string, suffix: string | undefined): number | null {
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const s = (suffix ?? "").toLowerCase();
  const mult = s === "k" || s === "thousand" ? 1e3 : s === "m" || s === "mn" || s === "million" ? 1e6 : s === "bn" || s === "b" || s === "billion" ? 1e9 : 1;
  return Math.round(n * mult * 100) / 100;
}

export function parseMoney(rawInput: string | number | null | undefined, currencyHint?: string | null): Money | null {
  if (rawInput === null || rawInput === undefined) return null;
  if (typeof rawInput === "number") {
    return Number.isFinite(rawInput) ? { raw: String(rawInput), currency: currencyHint ?? null, min: rawInput, max: rawInput, qualifier: "exact" } : null;
  }
  const raw = rawInput.trim();
  if (!raw) return null;
  let currency: string | null = null;
  const code = CODES.exec(raw);
  if (code) currency = code[1].toUpperCase();
  else {
    for (const [sym, c] of Object.entries(SYMBOLS).sort((a, b) => b[0].length - a[0].length)) {
      if (raw.includes(sym)) {
        currency = c;
        break;
      }
    }
  }
  currency ??= currencyHint ?? null;
  const nums = [...raw.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|bn|b|thousand|million|billion)?\b/gi)]
    .map((m) => amount(m[1], m[2]))
    .filter((n): n is number => n !== null);
  if (!nums.length) return null;
  const upTo = /\b(up to|maximum|max\.?|not to exceed|ceiling)\b/i.test(raw);
  const from = /\b(from|minimum|min\.?|at least)\b/i.test(raw) && nums.length === 1;
  if (nums.length >= 2) {
    // "1.2m – 1.5m" and "£1.2 – 1.5m": a bare first number takes the second one's scale.
    let a = nums[0];
    const b = nums[1];
    if (a < b / 100 && /\d\s*[-–—to]+\s*\d[\d.,]*\s*(k|m|mn|bn)/i.test(raw)) a = a * (b >= 1e9 ? 1e9 : b >= 1e6 ? 1e6 : 1e3);
    return { raw, currency, min: Math.min(a, b), max: Math.max(a, b), qualifier: "range" };
  }
  const n = nums[0];
  if (upTo) return { raw, currency, min: null, max: n, qualifier: "up_to" };
  if (from) return { raw, currency, min: n, max: null, qualifier: "from" };
  return { raw, currency, min: n, max: n, qualifier: "exact" };
}

export function fmtMoney(m: Money | null | undefined): string {
  if (!m) return "Not published";
  const f = (n: number) =>
    m.currency
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: m.currency, maximumFractionDigits: 0 }).format(n)
      : `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n)} (currency not stated)`;
  if (m.qualifier === "range" && m.min !== null && m.max !== null) return `${f(m.min)} – ${f(m.max)}`;
  if (m.qualifier === "up_to" && m.max !== null) return `Up to ${f(m.max)}`;
  if (m.qualifier === "from" && m.min !== null) return `From ${f(m.min)}`;
  return m.min !== null ? f(m.min) : "Not published";
}

/**
 * Does a published amount fit a user's range? Compared only within the same currency — the app
 * doesn't convert currencies (rates change; a converted figure would look published when it isn't).
 * Returns null when it can't tell.
 */
export function moneyFits(m: Money | null, range: { min?: number | null; max?: number | null; currency?: string | null }): boolean | null {
  if (range.min == null && range.max == null) return true;
  if (!m) return null;
  if (range.currency && m.currency && range.currency.toUpperCase() !== m.currency) return null;
  if (range.currency && !m.currency) return null;
  const lo = m.min ?? m.max;
  const hi = m.max ?? m.min;
  if (lo === null || hi === null) return null;
  if (range.min != null && hi < range.min) return false;
  if (range.max != null && lo > range.max) return false;
  return true;
}
