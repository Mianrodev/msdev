/**
 * Site copy from Gemini over plain HTTP (the Gemini API's generateContent),
 * with JSON output constrained to the template's schema. Without a key the
 * site is drafted from the trade template instead.
 */
import { draftContent, promptFor, responseSchema } from "../../../src/forge/copy";
import { SiteContent, type Intake } from "../../../src/forge/schema";
import type { Env } from "./env";

interface GeminiReply {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
}

export async function writeCopy(env: Env, i: Intake): Promise<{ content: SiteContent; writtenBy: "ai" | "draft" }> {
  if (!env.GEMINI_API_KEY) return { content: draftContent(i), writtenBy: "draft" };
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: promptFor(i) }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: responseSchema(), maxOutputTokens: 16000 },
    }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Gemini rejected the API key. Check GEMINI_API_KEY in Cloudflare.");
  if (res.status === 429) throw new Error("Gemini's rate limit was hit (the free tier allows a few requests a minute). Wait a minute and try again.");
  if (!res.ok) throw new Error(`Gemini returned an error (${res.status}). Try again in a moment.`);
  const reply = (await res.json()) as GeminiReply;
  const c = reply.candidates?.[0];
  if (reply.promptFeedback?.blockReason || c?.finishReason === "SAFETY") throw new Error("Gemini declined to write this site. Try rewording the details.");
  if (c?.finishReason === "MAX_TOKENS") throw new Error("The site copy came back incomplete. Try again.");
  const text = c?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Gemini's reply wasn't valid JSON. Try again.");
  }
  const parsed = SiteContent.safeParse(json);
  if (!parsed.success) throw new Error("Gemini's reply didn't fit the template. Try again.");
  return { content: parsed.data, writtenBy: "ai" };
}
