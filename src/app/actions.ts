"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { upsertAccount, setAccountStatus, updateAccount } from "@/services/accounts";
import {
  archiveRecord,
  decideStage,
  holdRecord,
  listRecords,
  restoreRecord,
  setFitTier,
  setOutreachStatus,
  setSourceVerification,
  updateRecord,
  upsertLead,
  type RecordInput,
} from "@/services/records";
import { runReconciliation } from "@/services/reconcile";
import { runUpdate } from "@/services/run-update";
import { describeSearch, humanize, OUTREACH_NAMES, SOURCE_NAMES, whereItIs } from "@/components/plain";
import { addBoard, reviewFoundJob, runDiscovery, saveDiscoveryWords, setBoardEnabled } from "@/services/discovery";
import { savePrivacy, PRIVACY_FIELDS, type PrivacyDetails } from "@/services/privacy";
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

/** Turn technical error messages into a plain sentence that says what to do. */
function friendlyError(msg: string): string {
  const words = (t: string) => t.replace(/\b([a-z]+[A-Z][A-Za-z]*)\b/g, (m) => `"${humanize(m)}"`).replace(/UNKNOWN/g, "not known");
  let m: RegExpMatchArray | null;
  if (/A reason is required/i.test(msg)) return "Please type a short reason, then try again.";
  if (/requires confirming/i.test(msg)) return "Please tick the box to confirm you did this yourself, then try again.";
  if ((m = msg.match(/Cannot advance: (.*?)(?:\. Correct| — this criterion)/))) {
    return `This lead can't move forward because it fails one of your rules: ${words(m[1])}. Choose a "not a fit" or "hold" option instead, or correct the details.`;
  }
  if (/unverifiable source goes to Hold/i.test(msg)) {
    return 'Before it can be Ready, check that the link is still open and set "Is the link still open?" to "Checked — still open". Otherwise choose "Needs more information — hold".';
  }
  if ((m = msg.match(/Cannot restore as a prospect: source is (\w+)/))) {
    return 'It can\'t go back to Ready until the link is checked. Set "Is the link still open?" to "Checked — still open" first.';
  }
  if ((m = msg.match(/Cannot restore as a prospect: (.*)/))) return `It can't go back to Ready because it fails your rules: ${words(m[1])}.`;
  if (/already has this account\/opportunity\/URL/i.test(msg)) return "Another lead already has the same company, opportunity and link. Open that one instead.";
  if (/Another target account/i.test(msg)) return "Another company with the same name and website already exists.";
  if (/Next decision is|completed every stage/i.test(msg)) return "This lead has moved on since the page loaded. Refresh the page and try again.";
  if (/restore it to active/i.test(msg)) return 'This lead is on hold or archived. Press "Put it back" first, then decide.';
  if (/Too small|at least 1 character|Invalid string/i.test(msg)) return "Please fill in the required boxes (marked *) and try again.";
  if (/not found/i.test(msg)) return "We couldn't find that item. It may have been changed — refresh the page.";
  return `That didn't work: ${words(msg)}`;
}

/** Run `fn`; redirect back to `path` with ?ok= or ?error=. */
async function act(path: string, fn: () => Promise<string | void>, okPath?: (r: string | void) => string) {
  let target: string;
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    target = okPath ? okPath(r) : withMessage(path, "ok", typeof r === "string" ? r : "Saved");
  } catch (e) {
    target = withMessage(path, "error", friendlyError(e instanceof Error ? e.message : String(e)));
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
      return r.created
        ? "Lead added. The next weekly check will look at it, or you can decide yourself below."
        : "You already had this lead, so it was updated instead of added twice.";
    },
    (msg) => withMessage(`/records/${id}`, "ok", msg as string),
  );
}

export async function updateRecordAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    await updateRecord(ctx, id, recordInput(f), str(f, "reason"));
    return "Changes saved.";
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
    return `Decision saved. This lead is now: ${whereItIs(r)}.`;
  });
}

export async function holdAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    await holdRecord(ctx, id, str(f, "reason"), str(f, "nextAction") || undefined);
    return "Moved to On hold.";
  });
}

export async function archiveAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    await archiveRecord(ctx, id, str(f, "reason"));
    return "Archived. It's kept for your records and you can put it back any time.";
  });
}

export async function restoreAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    const r = await restoreRecord(ctx, id, str(f, "reason") || "Put back by you");
    return `Put back. This lead is now: ${whereItIs(r)}.`;
  });
}

export async function sourceVerificationAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    const v = str(f, "value") as SourceVerification;
    await setSourceVerification(ctx, id, v, str(f, "reason"));
    return `Saved: link is "${SOURCE_NAMES[v]}".`;
  });
}

export async function fitTierAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    await setFitTier(ctx, id, (str(f, "tier") || null) as FitTier | null, str(f, "reason") || "Changed by you");
    return "Fit rating saved.";
  });
}

export async function outreachAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/records/${id}`, async () => {
    const to = str(f, "status") as OutreachStatus;
    await setOutreachStatus(ctx, id, to, {
      // The quick buttons ask "Did you do this yourself?" before submitting.
      humanConfirmed: f.get("confirm") === "on" || f.get("confirmed") === "yes",
      reason: str(f, "reason"),
    });
    return `Saved: ${OUTREACH_NAMES[to]}.`;
  });
}

// ---------------------------------------------------------------- pipeline

export async function runUpdateAction() {
  const ctx = await getCtx();
  await act("/", async () => {
    await runUpdate(ctx);
    return "Weekly check finished — see the result below.";
  });
}

export async function reconcileAction() {
  const ctx = await getCtx();
  await act("/", async () => {
    const r = await runReconciliation(ctx);
    return `Re-checked ${r.prospectsChecked} Ready and ${r.heldChecked} On-hold leads: ${r.held} moved to On hold, ${r.archived} moved to Archived.`;
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
  const operator = (str(f, "operator") || "note") as RuleInput["operator"];
  const rawValue = str(f, "value");
  const list = rawValue
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const value =
    operator === "gte" || operator === "lte"
      ? Number(rawValue.replace(/[^0-9.\-]/g, ""))
      : ["includes_any", "excludes_all", "starts_with_any", "not_starts_with_any"].includes(operator)
        ? list
        : rawValue.trim();
  if ((operator === "gte" || operator === "lte") && (!/\d/.test(rawValue) || !Number.isFinite(value as number))) {
    throw new Error("Please type a number in the words/number box (for example 120000).");
  }
  if (operator !== "note" && !str(f, "field").trim()) throw new Error("Please say which detail this check looks at.");
  const label = str(f, "label").trim();
  // New rules get a code made from their name; existing rules keep theirs.
  const key =
    str(f, "key").trim() ||
    `custom.${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "check"}_${Date.now().toString(36)}`;
  return {
    key,
    label,
    description: str(f, "description"),
    appliesFrom: (str(f, "appliesFrom") || "screen") as RuleInput["appliesFrom"],
    field: str(f, "field").trim(),
    operator,
    value,
    effect: (str(f, "effect") || "reject") as "reject" | "hold",
    enabled: f.get("enabled") === "on",
  };
}

export async function createRuleAction(f: FormData) {
  const ctx = await getCtx();
  await act("/settings", async () => {
    await createRule(ctx, ruleInput(f));
    return "Check added. The next weekly check will use it for every lead.";
  });
}

export async function updateRuleAction(id: string, f: FormData) {
  const ctx = await getCtx();
  await act(`/settings/rules/${id}`, async () => {
    await updateRule(ctx, id, ruleInput(f), str(f, "reason") || "Edited by you");
    return "Check saved. The next weekly check will use the new version.";
  });
}

export async function toggleRuleAction(id: string, enabled: boolean) {
  const ctx = await getCtx();
  await act("/settings", async () => {
    await setRuleEnabled(ctx, id, enabled, enabled ? "Switched on" : "Switched off");
    return enabled ? "Check switched on." : "Check switched off. It won't be used until you switch it back on.";
  });
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

// ---------------------------------------------------------------- privacy

export async function privacyAction(f: FormData) {
  const ctx = await getCtx();
  await act("/privacy", async () => {
    const d: Record<string, unknown> = {};
    for (const field of PRIVACY_FIELDS) d[field.key] = str(f, field.key);
    d.other = str(f, "other")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const n = await savePrivacy(ctx, d as PrivacyDetails);
    return n
      ? `Saved. ${n} words and phrases are now hidden from anything you share or download as a shared copy.`
      : "Saved. Nothing is being hidden yet — fill in at least your name.";
  });
}

// ---------------------------------------------------------------- finding leads

/** Search the job boards, then run the weekly check. Returns to the page it was pressed on. */
export async function findLeadsAction(f: FormData) {
  const ctx = await getCtx();
  const back = str(f, "back") === "/discover" ? "/discover" : "/";
  await act(back, async () => {
    const search = await runDiscovery(ctx);
    await runUpdate(ctx);
    return [
      search.newLeads ? `Search finished — ${search.newLeads} new jobs to review.` : "Search finished — no new matching jobs this time.",
      ...describeSearch(search).slice(2),
    ].join("\n");
  });
}

export async function reviewAction(id: string, f: FormData) {
  const ctx = await getCtx();
  const choice = str(f, "choice") as "yes" | "hold" | "no";
  let nextId: string | undefined;
  await act(
    `/records/${id}`,
    async () => {
      const r = await reviewFoundJob(ctx, id, choice);
      // Take the owner straight to the next job waiting for review.
      nextId = (await listRecords(ctx, { view: "review", sort: "account", dir: "asc", limit: 1 }))[0]?.id;
      return choice === "yes"
        ? `Moved to Ready (${whereItIs(r)}). Open it from the Ready list when you're ready to apply.`
        : choice === "hold"
          ? "Put on hold."
          : "Archived — you won't see this job again.";
    },
    (msg) => withMessage(nextId ? `/records/${nextId}` : "/records?list=review", "ok", `${msg as string}${nextId ? " Here's the next one." : " That was the last one to review."}`),
  );
}

const lines = (f: FormData, k: string) =>
  str(f, k)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

export async function discoveryWordsAction(f: FormData) {
  const ctx = await getCtx();
  await act("/discover", async () => {
    const words = {
      titleWords: lines(f, "titleWords"),
      skipWords: lines(f, "skipWords"),
      regionWords: lines(f, "regionWords"),
      otherRegionWords: lines(f, "otherRegionWords"),
    };
    if (!words.titleWords.length) throw new Error("Please add at least one job title word to look for.");
    await saveDiscoveryWords(ctx, words);
    return "Saved. The next search will use these words.";
  });
}

export async function addBoardAction(f: FormData) {
  const ctx = await getCtx();
  await act("/discover", async () => {
    const b = await addBoard(ctx, str(f, "link"));
    if (!b) {
      throw new Error(
        "That link isn't a job board the app can read yet. Paste a careers link from Lever (jobs.lever.co/…), Greenhouse (job-boards.greenhouse.io/…), Ashby (jobs.ashbyhq.com/…) or Workable (apply.workable.com/…).",
      );
    }
    return `Added. The next search will include this company's jobs.`;
  });
}

export async function toggleBoardAction(key: string, on: boolean) {
  const ctx = await getCtx();
  await act("/discover", async () => {
    await setBoardEnabled(ctx, key, on);
    return on ? "Company switched on." : "Company switched off — its jobs won't be searched.";
  });
}
