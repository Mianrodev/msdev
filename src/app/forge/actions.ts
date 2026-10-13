"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Intake } from "@/forge/schema";
import { createDemo, regenerateDemo, setDemoStatus, setGhlPageUrl } from "@/forge/store";
import { getCtx } from "@/services/request";

function intakeFrom(f: FormData) {
  const g = (k: string) => String(f.get(k) ?? "");
  const parsed = Intake.safeParse({
    businessName: g("businessName"),
    industry: g("industry"),
    city: g("city"),
    phone: g("phone"),
    services: g("services"),
    serviceAreas: g("serviceAreas"),
    reviews: g("reviews"),
    notes: g("notes"),
    logoUrl: g("logoUrl").trim(),
    heroImageUrl: g("heroImageUrl").trim(),
    primaryColor: g("primaryColor").trim(),
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(". "));
  return parsed.data;
}

const msg = (path: string, kind: "ok" | "error", text: string) => `${path}?${kind}=${encodeURIComponent(text)}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "Something went wrong.";

export async function createDemoAction(f: FormData) {
  let target: string;
  try {
    const demo = await createDemo(await getCtx(), intakeFrom(f));
    revalidatePath("/forge");
    target = msg(`/forge/${demo.slug}`, "ok", "Demo website ready");
  } catch (e) {
    target = msg("/forge", "error", errText(e));
  }
  redirect(target);
}

export async function regenerateDemoAction(f: FormData) {
  const slug = String(f.get("slug") ?? "");
  let target: string;
  try {
    await regenerateDemo(await getCtx(), slug, intakeFrom(f));
    revalidatePath(`/forge/${slug}`);
    target = msg(`/forge/${slug}`, "ok", "Rewritten — same link");
  } catch (e) {
    target = msg(`/forge/${slug}`, "error", errText(e));
  }
  redirect(target);
}

export async function archiveDemoAction(f: FormData) {
  const slug = String(f.get("slug") ?? "");
  const restore = f.get("restore") === "1";
  await setDemoStatus(await getCtx(), slug, restore ? "active" : "archived");
  revalidatePath("/forge");
  redirect(msg(restore ? `/forge/${slug}` : "/forge", "ok", restore ? "Demo is live again" : "Demo archived — its links no longer work"));
}

export async function saveGhlPageAction(f: FormData) {
  const raw = String(f.get("ghlPageUrl") ?? "").trim();
  let target: string;
  try {
    if (raw && !/^https?:\/\//.test(raw)) throw new Error("Paste the full page address, starting with https://");
    if (raw) new URL(raw);
    await setGhlPageUrl(await getCtx(), raw);
    revalidatePath("/forge");
    target = msg("/forge", "ok", raw ? "GoHighLevel page saved" : "GoHighLevel page removed");
  } catch (e) {
    target = msg("/forge", "error", errText(e));
  }
  redirect(target);
}
