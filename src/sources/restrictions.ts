/**
 * "Who can apply" limits written in a job's full description or application form, such as
 * "this role is only open to candidates who live in the US" or "Are you legally authorized to work
 * in the United States?". Read from the whole posting, because these lines usually sit at the end.
 */
const PLACE =
  "(?:the\\s+)?(?:US|U\\.S\\.?A?\\.?|USA|United States(?: of America)?|America|Canada|UK|U\\.K\\.|United Kingdom|Britain|England|Europe|EU|EMEA|European Union|LATAM|Latin America|North America|Americas|Brazil|Germany|Mexico|Australia|Philippines|Colombia|Argentina|Poland|Spain|France|Netherlands|Ireland|Israel|Singapore|Japan|South Africa|Portugal|Romania|Ukraine|New Zealand|Nigeria|Kenya|Egypt|Pakistan|Bangladesh|Vietnam|Indonesia|Malaysia|Thailand|China|Turkey|UAE|Dubai)";
/** Several places in a row: "the US, Canada or the UK". */
const PLACES = `${PLACE}(?:\\s*(?:,|/|and|or|&)\\s*${PLACE})*`;

/** [why, pattern, counts-even-when-the-job-names-your-country?] — form questions some companies put on every job are the "false" kind. */
const LIMITS: [string, RegExp, boolean][] = [
  [
    "must live in another country",
    new RegExp(
      `(?:must|need to|needs to|required to|should|will need to|have to|are required to)\\s+(?:currently\\s+)?(?:be\\s+)?(?:based|located|reside|residing|live|living|a resident|physically located)\\s+(?:in|within|of)\\s+${PLACES}\\b`,
      "i",
    ),
    true,
  ],
  [
    "only open to another country",
    new RegExp(
      `(?:only|exclusively)\\s+(?:open|available|accepting(?: applications)?|considering(?: candidates)?|hiring|eligible|able to hire|recruiting)\\s+(?:to|from|for|in|within)\\s+(?:candidates?\\s+|applicants?\\s+|residents?\\s+|people\\s+|individuals\\s+|those\\s+)?(?:who\\s+(?:are|live)\\s+)?(?:(?:based|located|living|residing)\\s+)?(?:in|within|of)?\\s*${PLACES}\\b`,
      "i",
    ),
    true,
  ],
  [
    "open to another country only",
    new RegExp(
      `(?:open|available|hiring|hire|hires|recruit(?:s|ing)?|accepting(?: applications)?|eligible)\\s+(?:only\\s+)?(?:to|for|in|from|within)\\s+(?:candidates?\\s+|applicants?\\s+|residents?\\s+|people\\s+|those\\s+)?(?:(?:based|located|living|residing)\\s+)?(?:in|within)?\\s*${PLACES}\\s+only\\b`,
      "i",
    ),
    true,
  ],
  [
    "candidates from another country only",
    new RegExp(
      `${PLACE}[- ](?:based|located|resident)\\s+(?:candidates|applicants|individuals|residents|talent|employees|team members|staff)\\s+only`,
      "i",
    ),
    true,
  ],
  [
    "residents or citizens of another country only",
    new RegExp(`${PLACES}\\s+(?:residents?|citizens?|nationals?)\\s+only\\b`, "i"),
    true,
  ],
  [
    "a role based in another country",
    new RegExp(
      `(?:this|the)\\s+(?:role|position|job|opportunity)\\s+is\\s+(?:a\\s+)?(?:fully\\s+)?(?:remote\\s+)?${PLACE}[- ]based\\b|${PLACE}[- ]based\\s+(?:remote\\s+)?(?:role|position|job|opportunity|team|employees?|hire|contractors?)\\b`,
      "i",
    ),
    true,
  ],
  [
    "remote only within another country",
    new RegExp(
      `\\bremote\\s*(?:\\(|[-–—:,]\\s*|\\s+(?:in|within|from)\\s+)${PLACES}\\s*\\)?\\s*(?:only)?(?=[\\s.,;:)\\]]|$)`,
      "i",
    ),
    true,
  ],
  [
    "location given as another country",
    new RegExp(
      `(?:^|\\n|\\.|;)\\s*(?:work\\s+)?(?:location|eligible locations?|hiring (?:locations?|regions?|countr(?:y|ies))|countr(?:y|ies))\\s*:\\s*(?:remote\\s*[-–—,(]*\\s*)?${PLACES}\\s*\\)?\\s*(?:only)?(?=[\\s.,;)\\]]|$)`,
      "i",
    ),
    true,
  ],
  [
    "benefits and employment only for staff based in another country",
    new RegExp(
      `(?:available|offered|eligible|applies|apply)\\s+only\\s+(?:to|for)\\s+(?:FT\\s+|full[- ]time\\s+)?${PLACE}[- ]based\\s+(?:employees|team members|staff|hires|candidates)`,
      "i",
    ),
    true,
  ],
  [
    "can't hire outside another country",
    new RegExp(
      `(?:cannot|can't|can not|unable to|not able to|do not|don't|won't|will not|are not able to)\\s+(?:currently\\s+)?(?:hire|consider|accept|employ|sponsor|support)[^.]{0,60}outside\\s+(?:of\\s+)?${PLACES}\\b`,
      "i",
    ),
    true,
  ],
  [
    "hiring only in another country",
    new RegExp(
      `\\b(?:we|company)\\s+(?:can|are able to|are|will)\\s+(?:currently\\s+)?only\\s+(?:able to\\s+)?(?:hire|employ|consider)\\s+(?:candidates\\s+|people\\s+|employees\\s+|applicants\\s+)?(?:who are\\s+)?(?:based\\s+|located\\s+|living\\s+)?(?:in|from|within)\\s+${PLACES}\\b`,
      "i",
    ),
    true,
  ],
  [
    "US citizenship or security clearance",
    /U\.?S\.?\s+citizen(?:ship)?\s+(?:only|is required|required)|must\s+be\s+a\s+U\.?S\.?\s+(?:citizen|person)|security clearance|\bITAR\b/i,
    true,
  ],
  [
    "not open to India",
    /not (?:open|available|hiring) (?:to|in|for) (?:candidates (?:in|from) )?India|excluding India|except India/i,
    true,
  ],
  [
    "needs work authorisation in another country",
    new RegExp(
      `(?:authori[sz]ed|eligible|legally (?:able|entitled)|right|permission|permitted)\\s+to\\s+work\\s+(?:in|within|for)\\s+${PLACES}\\b`,
      "i",
    ),
    false,
  ],
  ["paid on US payroll (W-2)", /\bW-?2\b/i, false],
];

const SENTENCE = /(?<=[.!?])\s+|\n+|\s*[•·▪●]\s*/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The first "who can apply" limit in the text, as a short quote, or null.
 * - `listedForYou`: the job itself names your country ("Remote - India"): then form questions that
 *   companies ask on every job ("authorized to work in the US?") don't count, but plain limits still do.
 * - `yourWords`: your region words ("India", "APAC"…): a sentence that also names one of them is not a
 *   limit against you ("Open to candidates in the US, Canada and India").
 */
export function workRestriction(text: string | null | undefined, listedForYou = false, yourWords: string[] = []): string | null {
  if (!text) return null;
  const mine = yourWords.map((w) => w.trim()).filter((w) => w && !/^(anywhere|worldwide|global|international|remote)$/i.test(w));
  const namesYou = (s: string) => mine.some((w) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, "iu").test(s));
  const sentences = text.split(SENTENCE);
  for (const [why, re, always] of LIMITS) {
    if (!always && listedForYou) continue;
    for (const sentence of sentences) {
      const m = re.exec(sentence);
      if (!m || namesYou(sentence)) continue;
      const quote = sentence
        .slice(Math.max(0, m.index - 60), m.index + m[0].length + 40)
        .replace(/\s+/g, " ")
        .trim();
      return `${why}: "…${quote}…"`;
    }
  }
  return null;
}

/** Limits that are often just a form question companies ask on every job: ignored when the job names your country. */
export function formQuestionOnly(limit: string): boolean {
  return LIMITS.some(([why, , always]) => !always && limit.startsWith(`${why}:`));
}

/** Postings by recruiters and agencies: the real employer is unknown, so the job can't be checked against the company. */
const AGENCY_WORDS =
  /\b(client undisclosed|undisclosed client|confidential client|our client|on behalf of (?:a|our|its|the) client|for (?:a|our) client|staffing|recruitment (?:agency|firm|partner|services)|recruiting (?:agency|firm|partner)|talent (?:solutions|partners?|marketplace|agency)|placement (?:agency|firm)|hiring partner|hiring for (?:a|our) client)\b/i;

/** Why this looks like a recruiter's posting rather than the employer's own, or null. */
export function recruiterSign(company: string, text: string | null | undefined): string | null {
  const c = AGENCY_WORDS.exec(company);
  if (c) return `the company name says "${c[0]}"`;
  const t = AGENCY_WORDS.exec((text ?? "").slice(0, 3000));
  return t ? `the posting says "${t[0]}"` : null;
}
