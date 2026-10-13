/** Small, deterministic text matching used by every module's ranking. No AI, no fuzzy guessing. */

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or our the their this to was we will with you your services service".split(" "),
);

export function tokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** A light stem so "consulting"/"consultancy"/"consultant" meet. */
export function stem(t: string): string {
  return t.replace(/(ings?|ancy|ency|ants?|ents?|ation|ations|ers?|ies|es|s)$/, "") || t;
}

/** Split a user's comma/newline list into trimmed phrases. */
export function phrases(s: string | string[] | null | undefined): string[] {
  const list = Array.isArray(s) ? s : (s ?? "").split(/[,\n;]+/);
  return [...new Set(list.map((p) => p.trim()).filter(Boolean))];
}

/** Which of the phrases appear in the text (every word of a phrase must appear, by stem). */
export function matchedPhrases(text: string, wanted: string[]): string[] {
  const have = new Set(tokens(text).map(stem));
  return wanted.filter((p) => {
    const ws = tokens(p).map(stem);
    return ws.length > 0 && ws.every((w) => have.has(w));
  });
}

/** Share of the phrases found in the text (0..1), or null when nothing was asked for. */
export function phraseScore(text: string, wanted: string[]): { score: number | null; hits: string[] } {
  if (!wanted.length) return { score: null, hits: [] };
  const hits = matchedPhrases(text, wanted);
  return { score: hits.length / wanted.length, hits };
}

export function includesCi(hay: string | null | undefined, needle: string): boolean {
  return (hay ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}

export function joinText(...parts: unknown[]): string {
  return parts
    .flat()
    .map((p) => (typeof p === "string" ? p : Array.isArray(p) ? p.join(" ") : p == null ? "" : String(p)))
    .join(" \n ");
}
