/** The workspace's company profile, used to explain tender matches. Stored in workspace settings. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { EMPTY_PROFILE, type CompanyProfile } from "@/core/opportunities/module";
import { list, optNum, optText } from "@/core/opportunities/query";
import { settings } from "@/db/schema";
import type { Ctx } from "../context";
import { logHistory } from "../history";

const KEY = "opportunities.profile";

export const profileSchema = z.object({
  companyName: optText(200),
  description: optText(2000),
  services: list(20),
  categories: list(20),
  regions: list(20),
  certifications: list(20),
  minContractValue: optNum(),
  maxContractValue: optNum(),
  currency: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : undefined), z.string().regex(/^[A-Z]{3}$/).optional()),
  minPrepDays: optNum(0, 365),
});

export async function getProfile(ctx: Ctx): Promise<CompanyProfile> {
  const [row] = await ctx.db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, ctx.workspaceId), eq(settings.key, KEY)))
    .limit(1);
  const v = (row?.value ?? {}) as Partial<CompanyProfile>;
  return { ...EMPTY_PROFILE, ...v };
}

export async function saveProfile(ctx: Ctx, raw: Record<string, string | string[] | undefined>): Promise<CompanyProfile> {
  const p = profileSchema.parse(raw);
  const value: CompanyProfile = {
    companyName: p.companyName ?? "",
    description: p.description ?? "",
    services: p.services,
    categories: p.categories,
    regions: p.regions,
    certifications: p.certifications,
    minContractValue: p.minContractValue ?? null,
    maxContractValue: p.maxContractValue ?? null,
    currency: p.currency ?? null,
    minPrepDays: p.minPrepDays ?? EMPTY_PROFILE.minPrepDays,
  };
  await ctx.db
    .insert(settings)
    .values({ workspaceId: ctx.workspaceId, key: KEY, value })
    .onConflictDoUpdate({ target: [settings.workspaceId, settings.key], set: { value, updatedAt: new Date().toISOString() } });
  await logHistory(ctx, { entityType: "setting", entityId: KEY, event: "updated", reason: "Company profile for opportunity matching updated" });
  return value;
}
