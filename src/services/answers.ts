/**
 * The owner's saved answers: the things every application asks (a short intro,
 * notice period, expected pay, why remote…). Written once, copied onto any lead.
 * Kept in settings, never exported, and logged without their text.
 */
import type { Ctx } from "./context";
import { getSetting, setSetting } from "./rules";

export interface SavedAnswer {
  title: string;
  text: string;
}

const KEY = "answers.library";
const MAX_ANSWERS = 30;
const MAX_TITLE = 120;
const MAX_TEXT = 8000;

/** Headings offered on an empty page, so it's obvious what to write. */
export const STARTER_TITLES = [
  "Short introduction (2–3 sentences)",
  "Why I want to work remotely",
  "Notice period / when I can start",
  "Expected pay",
  "Where I'm based and time zones I can cover",
];

export async function getAnswers(ctx: Ctx): Promise<SavedAnswer[]> {
  const v = await getSetting<unknown>(ctx, KEY, []);
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is SavedAnswer => !!a && typeof a === "object" && typeof a.title === "string" && typeof a.text === "string")
    .filter((a) => a.text.trim());
}

/** Saves the answers that have text; a heading without text is dropped. Returns how many were kept. */
export async function saveAnswers(ctx: Ctx, answers: SavedAnswer[]): Promise<number> {
  const kept = answers
    .map((a) => ({ title: a.title.trim().slice(0, MAX_TITLE), text: a.text.trim() }))
    .filter((a) => a.text);
  if (kept.length > MAX_ANSWERS) throw new Error(`You can keep up to ${MAX_ANSWERS} answers.`);
  const tooLong = kept.find((a) => a.text.length > MAX_TEXT);
  if (tooLong) throw new Error(`"${tooLong.title || "An answer"}" is too long — keep each answer under ${MAX_TEXT} characters.`);
  await setSetting(
    ctx,
    KEY,
    kept.map((a, i) => ({ title: a.title || `Answer ${i + 1}`, text: a.text })),
    "Saved answers updated",
  );
  return kept.length;
}

// ---------------------------------------------------------------- About me

const PROFILE_KEY = "profile.aboutMe";
const MAX_PROFILE = 30_000;

/**
 * The person's own profile in their own words — background, target roles, deal-breakers, pay floor,
 * writing style. Read by their AI (and Claude when helping) to judge fit and write in their voice.
 * Private to their space, never exported, logged without its text.
 */
export async function getProfile(ctx: Ctx): Promise<string> {
  const v = await getSetting<unknown>(ctx, PROFILE_KEY, "");
  return typeof v === "string" ? v : "";
}

export async function saveProfile(ctx: Ctx, text: string): Promise<void> {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (t.length > MAX_PROFILE) throw new Error(`Please keep it under ${MAX_PROFILE.toLocaleString("en-GB")} characters.`);
  await setSetting(ctx, PROFILE_KEY, t, "About me updated");
}
