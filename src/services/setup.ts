/** What a new owner has and hasn't done yet — drives the Getting started guide. */
import { eq, sql } from "drizzle-orm";
import { importBatches, pipelineRuns, records, targetAccounts } from "@/db/schema";
import type { Ctx } from "./context";
import { getIdentityTerms, getSetting } from "./rules";
import { hasRecoveryCode } from "@/lib/auth";

export interface SetupStatus {
  records: number;
  accounts: number;
  imports: number;
  runs: number;
  identityTerms: number;
  steps: { key: "password" | "recovery" | "upload" | "words" | "privacy" | "weekly"; done: boolean }[];
  allDone: boolean;
}

/**
 * `person` is whoever owns the space being shown. The owner brings their spreadsheet; a team member
 * starts empty, so their step is choosing what jobs to look for instead.
 */
export async function getSetupStatus(ctx: Ctx, person: { id: string; role: "owner" | "member" }): Promise<SetupStatus> {
  const count = async (table: typeof records | typeof targetAccounts | typeof importBatches | typeof pipelineRuns) => {
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(eq(table.workspaceId, ctx.workspaceId));
    return row?.n ?? 0;
  };
  const [recs, accounts, imports, runs, terms, recovery, words] = await Promise.all([
    count(records),
    count(targetAccounts),
    count(importBatches),
    count(pipelineRuns),
    getIdentityTerms(ctx),
    hasRecoveryCode(ctx.db, person.id),
    getSetting<unknown>(ctx, "discovery.titleWords", null),
  ]);
  const steps: SetupStatus["steps"] = [
    { key: "password", done: true },
    { key: "recovery", done: recovery },
    person.role === "owner" ? { key: "upload", done: imports > 0 || recs > 0 } : { key: "words", done: words !== null },
    { key: "privacy", done: terms.length > 0 },
    { key: "weekly", done: runs > 0 },
  ];
  return { records: recs, accounts, imports, runs, identityTerms: terms.length, steps, allDone: steps.every((s) => s.done) };
}
