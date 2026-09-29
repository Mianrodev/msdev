/**
 * The owner's personal details that must never appear in anything shared.
 * Stored as labelled fields (so the Privacy page is a simple form) and
 * flattened into the redaction word list used by shared exports.
 */
import { z } from "zod";
import type { Ctx } from "./context";
import { getSetting, IDENTITY_TERMS_KEY, setSetting } from "./rules";

export const PRIVACY_KEY = "privacy.identity";

export const privacySchema = z.object({
  name: z.string().trim().max(200).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(100).default(""),
  profileUrl: z.string().trim().max(500).default(""),
  city: z.string().trim().max(200).default(""),
  employer: z.string().trim().max(200).default(""),
  other: z.array(z.string().trim().max(200)).default([]),
});
export type PrivacyDetails = z.infer<typeof privacySchema>;

export const PRIVACY_FIELDS: { key: Exclude<keyof PrivacyDetails, "other">; label: string; example: string }[] = [
  { key: "name", label: "Full name", example: "e.g. Jane Smith" },
  { key: "email", label: "Personal email", example: "e.g. jane@example.com" },
  { key: "phone", label: "Phone number", example: "e.g. +1 555 010 0000" },
  { key: "profileUrl", label: "Profile link (e.g. LinkedIn)", example: "e.g. linkedin.com/in/jane-smith" },
  { key: "city", label: "Home city", example: "e.g. Springfield" },
  { key: "employer", label: "Current employer", example: "e.g. Acme Corp" },
];

/** Every word/phrase to hide. Adds useful variants (first name, phone without spaces, profile handle). */
export function termsFrom(d: PrivacyDetails): string[] {
  const t = new Set<string>();
  const add = (s: string) => {
    const v = s.trim();
    if (v.length >= 2) t.add(v);
  };
  for (const f of PRIVACY_FIELDS) add(d[f.key]);
  d.other.forEach(add);
  const first = d.name.split(/\s+/)[0];
  if (first && first.length >= 3) add(first);
  const digits = d.phone.replace(/\D/g, "");
  if (digits.length >= 7) {
    add(digits);
    add(digits.slice(-10));
  }
  const handle = d.profileUrl.replace(/\/+$/, "").split("/").pop();
  if (handle && handle.length >= 4 && handle !== d.profileUrl) add(handle);
  return [...t].sort((a, b) => b.length - a.length);
}

export async function getPrivacy(ctx: Ctx): Promise<PrivacyDetails> {
  const saved = await getSetting<unknown>(ctx, PRIVACY_KEY, null);
  if (saved) return privacySchema.parse(saved);
  // Older setups stored only a word list: show it under "other words".
  const terms = await getSetting<unknown>(ctx, IDENTITY_TERMS_KEY, []);
  return privacySchema.parse({ other: Array.isArray(terms) ? terms.map(String) : [] });
}

export async function savePrivacy(ctx: Ctx, input: PrivacyDetails): Promise<number> {
  const d = privacySchema.parse(input);
  // The details themselves are private: History records only that they changed.
  await setSetting(ctx, PRIVACY_KEY, d, "Privacy details saved");
  const terms = termsFrom(d);
  await setSetting(ctx, IDENTITY_TERMS_KEY, terms, "Protected words updated from Privacy page");
  return terms.length;
}
