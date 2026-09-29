/** What a new owner has and hasn't done yet — drives the Getting started guide. */
import { eq, sql } from "drizzle-orm";
import { importBatches, pipelineRuns, records, targetAccounts } from "@/db/schema";
import type { Ctx } from "./context";
import { getIdentityTerms } from "./rules";

export interface SetupStatus {
  records: number;
  accounts: number;
  imports: number;
  runs: number;
  identityTerms: number;
  steps: { key: "password" | "upload" | "privacy" | "weekly"; done: boolean }[];
  allDone: boolean;
}

export async function getSetupStatus(ctx: Ctx): Promise<SetupStatus> {
  const count = async (table: typeof records | typeof targetAccounts | typeof importBatches | typeof pipelineRuns) => {
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(eq(table.workspaceId, ctx.workspaceId));
    return row?.n ?? 0;
  };
  const [recs, accounts, imports, runs, terms] = await Promise.all([
    count(records),
    count(targetAccounts),
    count(importBatches),
    count(pipelineRuns),
    getIdentityTerms(ctx),
  ]);
  const steps: SetupStatus["steps"] = [
    { key: "password", done: true },
    { key: "upload", done: imports > 0 || recs > 0 },
    { key: "privacy", done: terms.length > 0 },
    { key: "weekly", done: runs > 0 },
  ];
  return { records: recs, accounts, imports, runs, identityTerms: terms.length, steps, allDone: steps.every((s) => s.done) };
}
