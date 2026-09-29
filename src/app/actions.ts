"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { upsertAccount, setAccountStatus, updateAccount } from "@/services/accounts";
import {
  archiveRecord,
  decideStage,
  holdRecord,
  restoreRecord,
  setFitTier,
  setOutreachStatus,
  setSourceVerification,
  updateRecord,
  upsertLead,
  type RecordInput,
} from "@/services/records";
import { runReconciliation } from "@/services/reconcile";
import { runUpdate, formatSummary } from "@/services/run-update";
import { createRule, IDENTITY_TERMS_KEY, setRuleEnabled, setSetting, updateRule } from "@/services/rules";
import { getCtx } from "@/services/request";
import type { RuleInput } from "@/core/rules";
import type { DecisionStage, FitTier, OutreachStatus, SourceVerification } from "@/core/types";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

function withMessage(path: string, key: "ok" | "error", msg: string) {
  const u = new URL(path, "http://x");
  u.searchParams.set(key, msg.slice(0, 500));
  return `${u.pathname}${u.search}`;
}

/** Run `fn`; redirect back to `path` with ?ok= or ?error=. */
async function act(path: string, fn: () => Promise<string | void>, okPath?: (r: string | void) => string) {
  let target: string;
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    target = okPath ? okPath(r) : withMessage(path, "ok", typeof r === "string" ? r : "Saved");
  } catch (e) {
    target = withMessage(path, "error", e instanceof Error ? e.message : String(e));
  }
  redirect(target);
}

/** Record fields from a form. Attributes come as `attr:<name>` inputs plus one optional new pair. */
function recordInput(f: FormData): RecordInput {
  const fields = [
    "account",
    "opportunity",
    "sourceUrl",
    "nextStepUrl",
    "sourceBoard",
    "location",
    "dateFound",
    "locationFit",
    "valueFit",
    "requirements",
    "gapsHard",
    "gapsSoft",
    "fitRationale",
    "preparedBrief",
    "preparedAnswers",
    "responseNotes",
    "lastVerifiedAt",
    "contactName",
    "contactEmail",
    "contactPhone",
    "contactProfileUrl",
    "nextAction",
    "notes",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of fields) if (f.has(k)) out[k] = str(f, k);
  if (f.has("attrs")) {
    const attributes: Record<string, unknown> = {};
    for (const [k, v] of f.entries()) {
      if (k.startsWith("attr:") && typeof v === "string") attributes[k.slice(5)] = v;
    }
    const nk = str(f, "newAttrKey").trim();
    if (nk) attributes[nk] = str(f, "newAttrValue");
    out.attributes = attributes;
  }
  return out as RecordInput;
}

// ---------------------------------------------------------------- records

export async function createLeadAction(f: FormData) {
  const ctx = await getCtx();
  let id = "";
  await act("/records/new", async () => {
      const r = await upsertLead(ctx, recordInput(f));
      id = r.record.id;
      return r.created ? "Lead created" : "Already existed — updated in place";
    },
    (msg) => withMessage(`/records/${id}`, "ok", msg as string),
  );
}

export async function updateRecordAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    await updateRecord(ctx, id, recordInput(f), str(f, "reason"));
    return "Saved";
  });
}

export async function decideAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    const conf = str(f, "confidence").trim();
    const r = await decideStage(ctx, id, {
      stage: str(f, "stage") as DecisionStage,
      verdict: str(f, "verdict"),
      reason: str(f, "reason"),
      confidence: conf ? Number(conf) : null,
    });
    return `Decision recorded — now ${r.stage} / ${r.status}`;
  });
}

export async function holdAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => void await holdRecord(ctx, id, str(f, "reason"), str(f, "nextAction") || undefined));
}

export async function archiveAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => void await archiveRecord(ctx, id, str(f, "reason")));
}

export async function restoreAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => void await restoreRecord(ctx, id, str(f, "reason")));
}

export async function sourceVerificationAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () =>
    void await setSourceVerification(ctx, id, str(f, "value") as SourceVerification, str(f, "reason")),
  );
}

export async function fitTierAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () =>
    void await setFitTier(ctx, id, (str(f, "tier") || null) as FitTier | null, str(f, "reason")),
  );
}

export async function outreachAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () =>
    void await setOutreachStatus(ctx, id, str(f, "status") as OutreachStatus, {
      humanConfirmed: f.get("confirm") === "on",
      reason: str(f, "reason"),
    }),
  );
}

// ---------------------------------------------------------------- pipeline

export async function runUpdateAction() {
  const ctx = await getCtx();
  await act("/", async () => formatSummary(await runUpdate(ctx)));
}

export async function reconcileAction() {
  const ctx = await getCtx();
  await act("/", async () => {
    const r = await runReconciliation(ctx);
    return `Reconciled ${r.prospectsChecked} prospects + ${r.heldChecked} held: kept ${r.kept}, to Hold ${r.held}, to Archive ${r.archived}`;
  });
}

// ---------------------------------------------------------------- accounts

const accountFields = [
  "name",
  "website",
  "sourceUrl",
  "fit",
  "contactName",
  "contactEmail",
  "contactPhone",
  "contactProfileUrl",
  "description",
  "evidence",
  "fitRationale",
  "preparedBrief",
  "preparedBriefLong",
  "responseNotes",
  "notes",
] as const;

function accountInput(f: FormData) {
  const out: Record<string, string> = {};
  for (const k of accountFields) if (f.has(k)) out[k] = str(f, k);
  return out;
}

export async function createAccountAction(f: FormData) {
  const ctx = await getCtx();
  let id = "";
  await act("/accounts/new", async () => {
      const r = await upsertAccount(ctx, accountInput(f));
      id = r.account.id;
      return r.created ? "Target account created" : "Already existed — updated in place";
    },
    (msg) => withMessage(`/accounts/${id}`, "ok", msg as string),
  );
}

export async function updateAccountAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/accounts/${id}`, async () => void await updateAccount(ctx, id, accountInput(f), str(f, "reason")));
}

export async function accountStatusAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/accounts/${id}`, async () =>
    void await setAccountStatus(ctx, id, str(f, "status") as "tracking" | "hold" | "archived", str(f, "reason")),
  );
}

// ---------------------------------------------------------------- rules & settings

function ruleInput(f: FormData): RuleInput {
  const operator = str(f, "operator") as RuleInput["operator"];
  const rawValue = str(f, "value");
  const value =
    operator === "gte" || operator === "lte"
      ? Number(rawValue.replace(/[, ]/g, ""))
      : ["includes_any", "excludes_all", "starts_with_any", "not_starts_with_any"].includes(operator)
        ? rawValue
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : rawValue;
  return {
    key: str(f, "key"),
    label: str(f, "label"),
    description: str(f, "description"),
    appliesFrom: str(f, "appliesFrom") as RuleInput["appliesFrom"],
    field: str(f, "field"),
    operator,
    value,
    effect: (str(f, "effect") || "reject") as "reject" | "hold",
    enabled: f.get("enabled") === "on",
  };
}

export async function createRuleAction(f: FormData) {
  const ctx = await getCtx();
  await act("/settings", async () => void await createRule(ctx, ruleInput(f)));
}

export async function updateRuleAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/settings/rules/${id}`, async () => void await updateRule(ctx, id, ruleInput(f), str(f, "reason")));
}

export async function toggleRuleAction(id: string, enabled: boolean) {
  const ctx = await getCtx();
  await act("/settings", async () => void await setRuleEnabled(ctx, id, enabled, enabled ? "Enabled" : "Disabled"));
}

export async function identityTermsAction(f: FormData) {
  const ctx = await getCtx();
  await act("/settings", async () => {
    const terms = str(f, "terms")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    await setSetting(ctx, IDENTITY_TERMS_KEY, terms, "Identity terms updated in Settings");
    return `${terms.length} identity terms saved`;
  });
}
