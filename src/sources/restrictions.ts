/**
 * "Who can apply" limits written in a job's full description or application form, such as
 * "this role is only open to candidates who live in the US" or "Are you legally authorized to work
 * in the United States?". Read from the whole posting, because these lines usually sit at the end.
 */
const PLACE =
  "(?:the\\s+)?(?:US|U\\.S\\.?A?\\.?|USA|United States(?: of America)?|Canada|UK|U\\.K\\.|United Kingdom|Europe|EU|EMEA|European Union|LATAM|Latin America|North America|Americas|Brazil|Germany|Mexico|Australia|Philippines|Colombia|Argentina|Poland|Spain|France|Netherlands|Ireland|Israel|Singapore|Japan|South Africa|Portugal|Romania|Ukraine|New Zealand)";

/** [why, pattern, also-on-jobs-listed-for-your-country?] — form questions some companies put on every job are the third kind. */
const LIMITS: [string, RegExp, boolean][] = [
  ["must live in another country", new RegExp(`(?:must|need to|needs to|required to|should|will need to|have to)\\s+(?:currently\\s+)?(?:be\\s+)?(?:based|located|reside|residing|live|living|a resident)\\s+(?:in|within|of)\\s+${PLACE}\\b`, "i"), true],
  ["only open to another country", new RegExp(`(?:only|exclusively)\\s+(?:open|available|accepting(?: applications)?|considering(?: candidates)?|hiring|eligible)\\s+(?:to|from|for|in)\\s+(?:candidates?\\s+|applicants?\\s+|residents?\\s+|people\\s+|individuals\\s+|those\\s+)?(?:who\\s+(?:are|live)\\s+)?(?:(?:based|located|living|residing)\\s+)?(?:in|within|of)?\\s*${PLACE}\\b`, "i"), true],
  ["candidates from another country only", new RegExp(`${PLACE}[- ](?:based|located|resident)\\s+(?:candidates|applicants|individuals|residents|talent)\\s+only`, "i"), true],
  ["benefits and employment only for US-based staff", /(?:available|offered|eligible)\s+only\s+(?:to|for)\s+(?:FT\s+|full[- ]time\s+)?(?:US|U\.S\.)[- ]based\s+(?:employees|team members|staff)/i, true],
  ["can't hire outside another country", new RegExp(`(?:cannot|can't|can not|unable to|not able to|do not|don't|won't|will not)\\s+(?:currently\\s+)?(?:hire|consider|accept|employ|sponsor)[^.]{0,60}outside\\s+(?:of\\s+)?${PLACE}\\b`, "i"), true],
  ["US citizenship or security clearance", /U\.?S\.?\s+citizen(?:ship)?\s+(?:only|is required|required)|must\s+be\s+a\s+U\.?S\.?\s+(?:citizen|person)|security clearance|\bITAR\b/i, true],
  ["not open to India", /not (?:open|available|hiring) (?:to|in|for) (?:candidates (?:in|from) )?India|excluding India|except India/i, true],
  ["needs work authorisation in another country", new RegExp(`(?:authori[sz]ed|eligible|legally (?:able|entitled)|right|permission)\\s+to\\s+work\\s+(?:in|within|for)\\s+${PLACE}\\b`, "i"), false],
  ["paid on US payroll (W-2)", /\bW-?2\b/i, false],
];

/**
 * The first "who can apply" limit in the text, as a short quote, or null. `listedForYou` = the job
 * names your country (e.g. "Remote - India"): then form questions that companies ask on every job
 * ("authorized to work in the US?") don't count, but plain limits still do.
 */
export function workRestriction(text: string | null | undefined, listedForYou = false): string | null {
  if (!text) return null;
  for (const [why, re, always] of LIMITS) {
    if (!always && listedForYou) continue;
    const m = re.exec(text);
    if (m) return `${why}: "…${text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 40).replace(/\s+/g, " ").trim()}…"`;
  }
  return null;
}

/** Limits that are often just a form question companies ask on every job: ignored when the job names your country. */
export function formQuestionOnly(limit: string): boolean {
  return LIMITS.some(([why, , always]) => !always && limit.startsWith(`${why}:`));
}
