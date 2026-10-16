/** Demos and settings in D1. Demos are archived, not deleted. */
import { Intake, SiteContent, type Demo } from "../../../src/forge/schema";
import type { Env } from "./env";

interface Row {
  slug: string;
  business_name: string;
  intake: string;
  content: string;
  written_by: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Listed {
  slug: string;
  businessName: string;
  industry: string;
  city: string;
  createdAt: string;
}

function toDemo(r: Row): Demo {
  return {
    slug: r.slug,
    intake: Intake.parse(JSON.parse(r.intake)),
    content: SiteContent.parse(JSON.parse(r.content)),
    writtenBy: r.written_by === "draft" ? "draft" : "ai",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** "Vanguard Pipe & Water" → "vanguard-pipe-water-k3f9". The suffix keeps links unique and unguessable. */
export function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const r = crypto.getRandomValues(new Uint8Array(2));
  return `${base || "demo"}-${[...r].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const SLUG = /^[a-z0-9-]{3,64}$/;

export async function getDemo(env: Env, slug: string, activeOnly = true): Promise<Demo | null> {
  if (!SLUG.test(slug)) return null;
  const r = await env.DB.prepare(`SELECT * FROM demos WHERE slug = ?${activeOnly ? " AND status = 'active'" : ""}`)
    .bind(slug)
    .first<Row>();
  return r ? toDemo(r) : null;
}

export async function listDemos(env: Env): Promise<Listed[]> {
  const { results } = await env.DB.prepare(
    "SELECT slug, business_name, intake, content, created_at FROM demos WHERE status = 'active' ORDER BY created_at DESC LIMIT 200",
  ).all<Row>();
  return results.map((r) => {
    const intake = JSON.parse(r.intake) as { city?: string };
    const content = JSON.parse(r.content) as { industry?: string };
    return { slug: r.slug, businessName: r.business_name, industry: content.industry ?? "", city: intake.city ?? "", createdAt: r.created_at };
  });
}

export async function saveDemo(env: Env, d: Demo): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO demos (slug, business_name, intake, content, written_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT (slug) DO UPDATE SET business_name = excluded.business_name, intake = excluded.intake,
       content = excluded.content, written_by = excluded.written_by, updated_at = excluded.updated_at`,
  )
    .bind(d.slug, d.intake.businessName, JSON.stringify(d.intake), JSON.stringify(d.content), d.writtenBy, d.createdAt, d.updatedAt)
    .run();
}

export async function archiveDemo(env: Env, slug: string): Promise<void> {
  await env.DB.prepare("UPDATE demos SET status = 'archived', updated_at = ? WHERE slug = ?").bind(new Date().toISOString(), slug).run();
}

export async function getSetting(env: Env, key: string): Promise<string> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return r?.value ?? "";
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}
