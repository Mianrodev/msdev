/**
 * Saving and finding Forge demos. Demos belong to a workspace for listing and
 * editing; the public preview looks one up by slug alone (that's the link).
 */
import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Db } from "@/db/client";
import { forgeDemos, type ForgeDemoRow } from "@/db/schema";
import { actorLabel } from "@/core/types";
import type { Ctx } from "@/services/context";
import { logHistory } from "@/services/history";
import { getSetting, setSetting } from "@/services/rules";
import { generateContent } from "./generate";
import { Intake, SiteContent, type Demo } from "./schema";

const GHL_PAGE_KEY = "forge.ghlPageUrl";

export function toDemo(r: ForgeDemoRow): Demo {
  return {
    slug: r.slug,
    intake: Intake.parse(r.intake),
    content: SiteContent.parse(r.content),
    writtenBy: r.writtenBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** "Vanguard Pipe & Water" → "vanguard-pipe-water-k3f9". The suffix keeps links unguessable and unique. */
export function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `${base || "demo"}-${randomBytes(3).toString("hex").slice(0, 4)}`;
}

export async function createDemo(ctx: Ctx, input: Intake): Promise<Demo> {
  const intake = Intake.parse(input);
  const { content, writtenBy } = await generateContent(intake);
  const slug = makeSlug(intake.businessName);
  const [row] = await ctx.db
    .insert(forgeDemos)
    .values({
      slug,
      workspaceId: ctx.workspaceId,
      businessName: intake.businessName,
      intake,
      content,
      writtenBy,
      createdBy: actorLabel(ctx.actor),
    })
    .returning();
  await logHistory(ctx, {
    entityType: "forge_demo",
    entityId: slug,
    event: "created",
    reason: `Demo website for ${intake.businessName} (${writtenBy === "claude" ? "written by Claude" : "drafted without AI"})`,
  });
  return toDemo(row);
}

/** Rewrite the copy from the (possibly edited) intake, keeping the same link. */
export async function regenerateDemo(ctx: Ctx, slug: string, input: Intake): Promise<Demo> {
  const intake = Intake.parse(input);
  const { content, writtenBy } = await generateContent(intake);
  const [row] = await ctx.db
    .update(forgeDemos)
    .set({ businessName: intake.businessName, intake, content, writtenBy, updatedAt: new Date().toISOString() })
    .where(and(eq(forgeDemos.workspaceId, ctx.workspaceId), eq(forgeDemos.slug, slug)))
    .returning();
  if (!row) throw new Error("That demo no longer exists.");
  await logHistory(ctx, { entityType: "forge_demo", entityId: slug, event: "updated", reason: "Demo website rewritten" });
  return toDemo(row);
}

export async function setDemoStatus(ctx: Ctx, slug: string, status: "active" | "archived") {
  await ctx.db
    .update(forgeDemos)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(forgeDemos.workspaceId, ctx.workspaceId), eq(forgeDemos.slug, slug)));
  await logHistory(ctx, { entityType: "forge_demo", entityId: slug, event: status === "archived" ? "archived" : "restored" });
}

export async function listDemos(ctx: Ctx, status: "active" | "archived" = "active") {
  return ctx.db
    .select()
    .from(forgeDemos)
    .where(and(eq(forgeDemos.workspaceId, ctx.workspaceId), eq(forgeDemos.status, status)))
    .orderBy(desc(forgeDemos.createdAt));
}

export async function getDemo(ctx: Ctx, slug: string): Promise<Demo | null> {
  const [row] = await ctx.db
    .select()
    .from(forgeDemos)
    .where(and(eq(forgeDemos.workspaceId, ctx.workspaceId), eq(forgeDemos.slug, slug)))
    .limit(1);
  return row ? toDemo(row) : null;
}

/** For the public preview: any active demo, by its link. */
export async function getPublicDemo(db: Db, slug: string): Promise<Demo | null> {
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) return null;
  const [row] = await db
    .select()
    .from(forgeDemos)
    .where(and(eq(forgeDemos.slug, slug), eq(forgeDemos.status, "active")))
    .limit(1);
  return row ? toDemo(row) : null;
}

/** The GoHighLevel page that holds the loader snippet; demo links become `<page>?d=<slug>`. */
export async function getGhlPageUrl(ctx: Ctx): Promise<string> {
  return getSetting<string>(ctx, GHL_PAGE_KEY, "");
}

export async function setGhlPageUrl(ctx: Ctx, url: string) {
  await setSetting(ctx, GHL_PAGE_KEY, url, "Forge Demo GoHighLevel page set");
}

export function ghlLink(pageUrl: string, slug: string): string {
  if (!pageUrl) return "";
  const u = new URL(pageUrl);
  u.searchParams.set("d", slug);
  return u.toString();
}
