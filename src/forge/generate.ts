/**
 * Turn an intake into the words for every section of the site.
 *
 * With GEMINI_API_KEY set (a Google AI Studio key), Gemini writes the copy as
 * JSON constrained to the template's schema. Without it, `draftContent` fills
 * the template from the trade preset — plainer, but a complete working page.
 */
import { ApiError, GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL, draftContent, promptFor, responseSchema } from "./copy";
import { SiteContent, type Intake } from "./schema";

export { DEFAULT_MODEL, draftContent, parseReviews, splitList } from "./copy";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

export async function writeWithGemini(i: Intake): Promise<SiteContent> {
  const ai = new GoogleGenAI({ apiKey: apiKey() });
  let text: string | undefined;
  try {
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL, // GEMINI_MODEL overrides, e.g. a cheaper Flash-Lite model
      contents: promptFor(i),
      config: { responseMimeType: "application/json", responseJsonSchema: responseSchema(), maxOutputTokens: 16000 },
    });
    const reason = res.candidates?.[0]?.finishReason;
    if (reason === "MAX_TOKENS") throw new Error("The site copy came back incomplete. Try again.");
    if (reason === "SAFETY" || res.promptFeedback?.blockReason) throw new Error("Gemini declined to write this site. Try rewording the details.");
    text = res.text;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403) throw new Error("Gemini rejected the API key. Check GEMINI_API_KEY.");
      if (e.status === 429) throw new Error("Gemini's rate limit was hit (the free tier allows only a few requests a minute). Wait a minute and try again.");
      throw new Error(`Gemini returned an error (${e.status}). Try again in a moment.`);
    }
    throw e;
  }
  let json: unknown;
  try {
    json = JSON.parse(text ?? "");
  } catch {
    throw new Error("Gemini's reply wasn't valid JSON. Try again.");
  }
  const parsed = SiteContent.safeParse(json);
  if (!parsed.success) throw new Error("Gemini's reply didn't fit the template. Try again.");
  return parsed.data;
}

export function canUseAi(): boolean {
  return !!apiKey();
}

/** Write the site: with Gemini when a key is set, otherwise the plain draft. */
export async function generateContent(i: Intake): Promise<{ content: SiteContent; writtenBy: "ai" | "draft" }> {
  if (!canUseAi()) return { content: draftContent(i), writtenBy: "draft" };
  return { content: await writeWithGemini(i), writtenBy: "ai" };
}
