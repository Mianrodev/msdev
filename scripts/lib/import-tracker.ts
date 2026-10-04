/**
 * One-time migration: "Local Prospect Weekly Tracker.xlsx" → CRM database.
 *
 * Sheet → entity:
 *   RAW LEADS        → records (stage 1/2/2.5/3 verdict + reason pairs; state derived from verdicts)
 *   PRIORITY         → records at Verify / active (qualified prospects)
 *   HOLD             → records with status hold
 *   ARCHIVE          → records with status archived
 *   TARGET ACCOUNTS  → target_accounts (outreach block + watchlist block)
 *   HISTORY          → history entries (reconciliation block + activity-log block)
 *   CONFIG (hidden)  → rules (criteria/exclusions/pipeline/standing/trigger rows)
 *                      + settings (profile, sheet/column maps, migration validation)
 *
 * Records dedupe on (account, opportunity, source/next-step URL) exactly as the
 * app does, so a lead appearing in RAW LEADS and PRIORITY becomes one record
 * whose later sheet sets its current state. Every source row — including
 * headers, section titles and blanks — is accounted for, and every data row is
 * stored verbatim in import_rows linked to what it became.
 */
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { importBatches, importRows, records, type RecordRow } from "../../src/db/schema";
import { dedupKey } from "../../src/core/dedup";
import { assertCan } from "../../src/core/permissions";
import type { RuleInput } from "../../src/core/rules";
import { effortFrom, STAGES, type FitTier, type SourceVerification } from "../../src/core/types";
import { upsertAccount } from "../../src/services/accounts";
import type { Ctx } from "../../src/services/context";
import { logHistory } from "../../src/services/history";
import { findByDedupKey, getRecord, upsertLead, type RecordInput } from "../../src/services/records";
import { createRule, getSetting, listRules, setSetting, updateRule } from "../../src/services/rules";
import { norm, readWorkbook, type Sheet, type SheetRow } from "./workbook";

// ------------------------------------------------------------------ headers

export const HEADERS: Record<string, string[][]> = {
  PRIORITY: [
    [
      "Fit",
      "Account",
      "Opportunity",
      "Source URL",
      "Next Step URL",
      "Location Fit",
      "Type",
      "Value Range",
      "Value Range (Est.)",
      "Value Fit",
      "Stage",
      "Scope",
      "Requirements",
      "Gaps (Hard)",
      "Gaps (Soft)",
      "Fit Rationale",
      "Proof Point",
      "Prepared Brief",
      "Prepared Answers",
      "How To Proceed",
      "Last Verified",
      "Follow-up Status",
      "Response Notes",
      "Notes",
    ],
  ],
  "TARGET ACCOUNTS": [
    [
      "Fit",
      "Account",
      "Contact Name",
      "Contact Profile",
      "Source URL",
      "Stage",
      "Team Size",
      "What They Do",
      "Evidence",
      "Fit Rationale",
      "Problem",
      "Prepared Brief (Short)",
      "Prepared Brief (Long)",
      "Response Notes",
      "Notes",
    ],
  ],
  "RAW LEADS": [
    [
      "Account",
      "Opportunity",
      "Source URL",
      "Source Board",
      "Stage 1 Note",
      "Stage 1 Verdict",
      "Next Step",
      "Location Text",
      "Value Text",
      "Date Found",
      "Raw Status",
      "Stage 2 Screen",
      "Stage 2 Reason",
      "Location Confidence",
      "Value Status",
      "Builder Signal",
      "Hard Gap",
      "Soft Gap",
      "Detail Review Status",
      "Stage 2.5 Screen",
      "Stage 2.5 Reason",
      "Opportunity Type",
      "Builder Intensity",
      "AI Leverage Potential",
      "Leadership Proximity",
      "Engineering Depth",
      "Level Fit",
      "Location Fit Confidence",
      "Value Fit Confidence",
      "Process Plausibility",
      "Main Risk",
      "Stage 3 Status",
      "Stage 3 Reason",
      "Verified Open",
      "Verified Value",
      "Verified Location Fit",
    ],
  ],
  ARCHIVE: [["Account", "Opportunity", "Reason", "Source URL", "Date", "Notes"]],
  HOLD: [["Account", "Opportunity", "Reason On Hold", "Source URL", "Date", "Next Action Needed"]],
  HISTORY: [
    [
      "Fit",
      "Account",
      "Opportunity",
      "Next Step URL",
      "Location Fit",
      "Type",
      "Value Range",
      "Value Range (Est.)",
      "Value Fit",
      "Stage",
      "Scope",
      "Requirements",
      "Gaps (Hard)",
      "Gaps (Soft)",
      "Fit Rationale",
      "Proof Point",
      "Prepared Brief",
      "Prepared Answers",
      "How To Proceed",
      "Last Verified",
      "Follow-up Status",
      "Notes",
      "Final Status",
      "Final Reason",
      "Reverified Date",
    ],
    [
      "Account",
      "Opportunity",
      "Source URL",
      "Location Text",
      "Location Fit",
      "Type",
      "Value Range",
      "Scope",
      "Gaps",
      "Verified Status",
      "Last Verified",
      "Follow-up Status",
      "Last Action Date",
      "Prepared Brief Ref",
      "Prepared Answers Ref",
      "Confirmation",
      "Blocker",
      "Next Action",
      "Follow-up Date",
    ],
  ],
};

const URL_COLUMNS = new Set(["source url", "next step url", "next step", "contact profile"].map(norm));
const RECORD_SHEETS = ["RAW LEADS", "PRIORITY", "HOLD", "ARCHIVE"] as const; // order = later sheet wins

// ------------------------------------------------------------------ helpers

const camel = (h: string) =>
  h
    .replace(/\(([^)]*)\)/g, " $1")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);

const isUrl = (s: string | undefined) => !!s && /^(https?:\/\/|www\.)\S+$/i.test(s.trim());

/** Canonical verdict text: upper-case, dashes/spaces collapsed. */
const canon = (s: string | undefined) => (s ?? "").toUpperCase().replace(/[—–-]/g, " ").replace(/\s+/g, " ").trim();

export function screenVerdict(s?: string): string | null {
  const c = canon(s);
  if (!c) return null;
  if (/^(OBVIOUS )?REJECT/.test(c)) return "reject";
  if (/^KEEP STRONG/.test(c)) return "keep_strong";
  if (/^KEEP STRETCH/.test(c)) return "keep_stretch";
  if (/^KEEP POSSIBLE/.test(c)) return "keep_possible";
  return null;
}

export function triageVerdict(s?: string): string | null {
  const c = canon(s);
  if (!c) return null;
  if (/TOP PRIORITY/.test(c)) return "top_priority";
  if (/SECONDARY/.test(c)) return "secondary";
  if (/^HOLD/.test(c)) return "hold_low_confidence";
  if (/^REMOVE/.test(c)) return "remove";
  return null;
}

export function tierOf(s?: string): FitTier | null {
  const c = canon(s);
  for (const t of ["EXCEPTIONAL", "STRONG", "GOOD", "STRETCH"] as const) {
    if (new RegExp(`(^| )${t}( |$)`).test(c)) return t.toLowerCase() as FitTier;
  }
  return null;
}

export function verifyVerdict(s?: string): string | null {
  const c = canon(s);
  if (!c) return null;
  if (/^CLOSED/.test(c)) return "closed";
  if (/^(REJECT|ARCHIVE)/.test(c)) return "archive";
  if (/^HOLD/.test(c)) return "hold_needs_info";
  const t = tierOf(c);
  if (t && /(READY|PRIORITY|TARGET|TIER)/.test(c)) return `tier_${t}`;
  return null;
}

function sourceVerificationFrom(v?: string): SourceVerification {
  const c = canon(v);
  if (/^YES/.test(c)) return "verified";
  if (/^NO( |$)/.test(c)) return "unreachable";
  return "unverified";
}

const EFFECT: Record<string, "advance" | "hold" | "archive"> = {
  reject: "archive",
  keep_possible: "advance",
  keep_stretch: "advance",
  keep_strong: "advance",
  top_priority: "advance",
  secondary: "advance",
  hold_low_confidence: "hold",
  remove: "archive",
  tier_exceptional: "advance",
  tier_strong: "advance",
  tier_good: "advance",
  tier_stretch: "advance",
  hold_needs_info: "hold",
  archive: "archive",
  closed: "archive",
};

/** Derive stage/status from the recorded verdicts, in pipeline order. */
export function deriveState(v: { screen: string | null; triage: string | null; verify: string | null }) {
  let stage: RecordRow["stage"] = "discovery";
  let status: RecordRow["status"] = "active";
  let decidedBy: string | null = null;
  for (const [st, verdict] of [
    ["screen", v.screen],
    ["triage", v.triage],
    ["verify", v.verify],
  ] as const) {
    if (!verdict) break;
    decidedBy = `${st}:${verdict}`;
    const e = EFFECT[verdict];
    if (e === "advance") stage = st;
    else {
      status = e === "hold" ? "hold" : "archived";
      break;
    }
  }
  return { stage, status, decidedBy };
}

function outreachFrom(s?: string): RecordRow["outreachStatus"] | null {
  const c = canon(s);
  if (!c) return null;
  if (/READY/.test(c)) return "package_ready";
  if (/OFFER/.test(c)) return "offer";
  if (/REJECT|DECLINED/.test(c)) return "rejected";
  if (/INTERVIEW/.test(c)) return "interviewing";
  if (/APPLIED|SUBMITTED|SENT/.test(c)) return "sent_manually";
  if (/RESPON|REPLIED/.test(c)) return "responded";
  if (/CLOSED/.test(c)) return "closed";
  return null;
}

/** Spreadsheet placeholders ("Not checked", "TBD", "-", "?") are not values. */
const PLACEHOLDER = /^(not checked( yet)?|tbd|tba|tbc|pending|none|n\/?a|unknown|-+|—|\?+)$/i;
function pick(values: Record<string, string>, used: Set<string>, ...names: string[]) {
  for (const n of names) {
    if (values[n] !== undefined) {
      used.add(n);
      const v = values[n];
      return typeof v === "string" && PLACEHOLDER.test(v.trim()) ? "" : v;
    }
    used.add(n);
  }
  return undefined;
}

/** Columns not mapped to a first-class field become camelCase attributes (never dropped). */
function leftovers(values: Record<string, string>, used: Set<string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) if (!used.has(k)) out[camel(k)] = v;
  return out;
}

// ------------------------------------------------------------------ record mapping

interface RecordPlan {
  input: RecordInput;
  state?: Partial<RecordRow>;
}

export function mapRecordRow(sheet: string, values: Record<string, string>): RecordPlan {
  const used = new Set<string>();
  const p = (...n: string[]) => pick(values, used, ...n);

  switch (sheet) {
    case "RAW LEADS": {
      const nextStep = p("Next Step");
      const base: RecordInput = {
        account: p("Account"),
        opportunity: p("Opportunity"),
        sourceUrl: p("Source URL"),
        sourceBoard: p("Source Board"),
        location: p("Location Text"),
        dateFound: p("Date Found"),
        gapsHard: p("Hard Gap"),
        gapsSoft: p("Soft Gap"),
        ...(isUrl(nextStep) ? { nextStepUrl: nextStep } : { nextAction: nextStep }),
      };
      const s1v = p("Stage 1 Verdict");
      const s1r = p("Stage 1 Note");
      const s2 = p("Stage 2 Screen");
      const s2r = p("Stage 2 Reason");
      const s25 = p("Stage 2.5 Screen");
      const s25r = p("Stage 2.5 Reason");
      const s3 = p("Stage 3 Status");
      const s3r = p("Stage 3 Reason");
      const open = values["Verified Open"];
      const v = { screen: screenVerdict(s2), triage: triageVerdict(s25), verify: verifyVerdict(s3) };
      const d = deriveState(v);
      const tier = v.verify?.startsWith("tier_") ? (v.verify.slice(5) as FitTier) : null;
      return {
        input: { ...base, attributes: leftovers(values, used) },
        state: {
          discoveryVerdict: s1v ?? null,
          discoveryReason: s1r ?? null,
          screenVerdict: v.screen ?? s2 ?? null,
          screenReason: s2r ?? null,
          triageVerdict: v.triage ?? s25 ?? null,
          triageReason: s25r ?? null,
          verifyVerdict: v.verify ?? s3 ?? null,
          verifyReason: s3r ?? null,
          stage: d.stage,
          status: d.status,
          sourceVerification: sourceVerificationFrom(open),
          ...(tier ? { fitTier: tier } : {}),
          ...(d.status === "hold" ? { holdReason: [s3r, s25r].find(Boolean) ?? d.decidedBy } : {}),
          ...(d.status === "archived" ? { archiveReason: [s3r, s25r, s2r].find(Boolean) ?? d.decidedBy } : {}),
        },
      };
    }
    case "PRIORITY": {
      const fit = p("Fit");
      const tier = tierOf(fit);
      const lastVerified = p("Last Verified");
      const follow = values["Follow-up Status"];
      const input: RecordInput = {
        account: p("Account"),
        opportunity: p("Opportunity"),
        sourceUrl: p("Source URL"),
        nextStepUrl: p("Next Step URL"),
        locationFit: p("Location Fit"),
        valueFit: p("Value Fit"),
        requirements: p("Requirements"),
        gapsHard: p("Gaps (Hard)"),
        gapsSoft: p("Gaps (Soft)"),
        fitRationale: p("Fit Rationale"),
        preparedBrief: p("Prepared Brief"),
        preparedAnswers: p("Prepared Answers"),
        lastVerifiedAt: lastVerified,
        responseNotes: p("Response Notes"),
        notes: p("Notes"),
      };
      // "How To Proceed" sometimes holds an effort rating (MEDIUM, EASY) rather than instructions.
      const proceed = p("How To Proceed");
      const effort = effortFrom(proceed);
      if (!effort) input.nextAction = proceed;
      input.attributes = leftovers(values, used); // Type, Value Range, Stage, Scope, Proof Point, Follow-up Status…
      if (effort) input.attributes.effortToApply = effort;
      if (fit && !tier) input.attributes.fit = fit;
      return {
        input,
        state: {
          stage: "verify",
          status: "active",
          fitTier: tier,
          verifyVerdict: tier ? `tier_${tier}` : null,
          verifyReason: `Listed in PRIORITY as "${fit ?? "?"}"`,
          sourceVerification: lastVerified ? "verified" : "unverified",
          outreachStatus: outreachFrom(follow) ?? "not_started",
        },
      };
    }
    case "HOLD": {
      const input: RecordInput = {
        account: p("Account"),
        opportunity: p("Opportunity"),
        sourceUrl: p("Source URL"),
        nextAction: p("Next Action Needed"),
      };
      const reason = p("Reason On Hold");
      const date = p("Date");
      input.attributes = leftovers(values, used);
      return { input, state: { status: "hold", holdReason: reason ?? "Listed in HOLD", holdSince: date ?? null } };
    }
    case "ARCHIVE": {
      const input: RecordInput = {
        account: p("Account"),
        opportunity: p("Opportunity"),
        sourceUrl: p("Source URL"),
        notes: p("Notes"),
      };
      const reason = p("Reason");
      const date = p("Date");
      input.attributes = leftovers(values, used);
      return {
        input,
        state: { status: "archived", archiveReason: reason ?? "Listed in ARCHIVE", archivedAt: date ?? null },
      };
    }
  }
  throw new Error(`No record mapping for ${sheet}`);
}

// ------------------------------------------------------------------ CONFIG

/** Sections whose rows are process rules/criteria (→ rules). The rest are reference data (→ settings). */
const RULE_SECTIONS = [/search criteria/i, /exclusions|red flags/i, /pipeline/i, /trigger/i];

function stageForConfigRow(key: string): RuleInput["appliesFrom"] {
  if (/stage\s*3|verif|reconcil|dead link|standing/i.test(key)) return "verify";
  if (/stage\s*2\.5|triage/i.test(key)) return "triage";
  return "screen";
}

/**
 * Evaluable criteria derived from CONFIG's prose rules. Each cites its source
 * row; all are editable/disable-able in Settings. Compensation isn't included:
 * the workbook's pay text mixes currencies and monthly/annual periods, so a
 * numeric floor can't be applied without guessing — the CONFIG row stays as a
 * process note and humans judge it at Verify.
 */
export const DERIVED_CRITERIA: RuleInput[] = [
  {
    key: "criteria.location.not_blocked",
    label: "Location not blocked",
    description:
      "From your spreadsheet's rules (location eligibility, on-site roles). If the location check says BLOCKED, the lead is archived.",
    appliesFrom: "screen",
    field: "locationConfidence",
    operator: "excludes_all",
    value: ["BLOCKED"],
    effect: "reject",
  },
  {
    key: "criteria.location.verified_fit",
    label: "Verified location fit is not NO",
    description:
      "From your spreadsheet's rules (location eligibility). At the final check, if the confirmed location fit is NO (on-site, wrong region…), the lead is archived. Unknown or unclear doesn't count against it.",
    appliesFrom: "verify",
    field: "verifiedLocationFit",
    operator: "not_starts_with_any",
    value: ["NO"],
    effect: "reject",
  },
  {
    key: "criteria.open.verified_open",
    label: "Listing still open",
    description: "From your spreadsheet's rules — Dead links. A listing verified as no longer open is closed.",
    appliesFrom: "verify",
    field: "verifiedOpen",
    operator: "not_starts_with_any",
    value: ["NO"],
    effect: "reject",
  },
  {
    key: "criteria.value.not_below_floor",
    label: "Verified value not below floor",
    description:
      "From your spreadsheet's rules — Compensation floor. Rejects only when verification explicitly recorded the value as below floor.",
    appliesFrom: "verify",
    field: "verifiedValue",
    operator: "excludes_all",
    value: ["below floor"],
    effect: "reject",
  },
  {
    key: "criteria.engagement.gig_marketplace",
    label: "Gig/marketplace listings go to Hold",
    description:
      "From your spreadsheet's rules — Employment type / Marketplace/gig listings, plus the owner's instruction to deprioritise AI-training/gig contractor work. Matching accounts are held, not rejected. Add accounts to the list as needed.",
    appliesFrom: "triage",
    field: "account",
    operator: "excludes_all",
    value: ["micro1"],
    effect: "hold",
  },
];

// ------------------------------------------------------------------ run

export interface SheetReport {
  sheet: string;
  physicalRows: number;
  header: number;
  section: number;
  blank: number;
  data: number;
  imported: number;
  outcomes: Record<string, number>;
  sections: Record<string, number>;
  expected?: number;
}

export interface ImportReport {
  batchId: string;
  file: string;
  sheets: SheetReport[];
  hyperlinks: number;
  statusConflicts: { id: string; sheets: string[] }[];
  ok: boolean;
}

export class AlreadyImportedError extends Error {}

export interface WorkbookSource {
  /** File name as uploaded / on disk (for the report only). */
  name: string;
  data: Buffer | ArrayBuffer;
}

export async function importWorkbook(ctx: Ctx, src: WorkbookSource, opts: { force?: boolean } = {}): Promise<ImportReport> {
  const buf = Buffer.isBuffer(src.data) ? src.data : Buffer.from(src.data);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const previous = await getSetting<string[]>(ctx, "import.hashes", []);
  if (previous.includes(sha256) && !opts.force) {
    throw new AlreadyImportedError("This exact workbook was already imported (use --force to import again).");
  }
  const sheets = await readWorkbook(buf, HEADERS, URL_COLUMNS, new Set(["CONFIG"]));
  const batchId = randomUUID();
  const ictx: Ctx = { ...ctx, actor: { kind: "import", batchId } };
  assertCan(ictx.actor, "import.run");

  const report: ImportReport = {
    batchId,
    file: src.name.split(/[\\/]/).pop() ?? src.name,
    sheets: [],
    hyperlinks: sheets.reduce((n, s) => n + s.hyperlinks, 0),
    statusConflicts: [],
    ok: true,
  };

  await ctx.db.transaction(async (tx) => {
    const c: Ctx = { ...ictx, db: tx as unknown as Ctx["db"] };
    await c.db.insert(importBatches).values({ id: batchId, workspaceId: c.workspaceId, fileName: report.file, summary: {} });

    // Source rows are buffered and written in bulk at the end (same transaction).
    const pendingRows: (typeof importRows.$inferInsert)[] = [];
    const rowLog: RowLog = (sheet, r, entityType, entityId, outcome) => {
      pendingRows.push({
        workspaceId: c.workspaceId,
        batchId,
        sheet,
        rowNumber: r.rowNumber,
        raw: { section: r.section, ...r.values },
        entityType,
        entityId,
        outcome,
      });
    };
    // CONFIG reference rows are grouped per section and saved once each.
    const configSettings = new Map<string, Record<string, string>>();

    const statusSetBy = new Map<string, string[]>();
    const bySheet = new Map(sheets.map((s) => [s.name, s]));
    const order = [...RECORD_SHEETS, "TARGET ACCOUNTS", "HISTORY", "CONFIG"];
    const rest = sheets.map((s) => s.name).filter((n) => !order.includes(n));

    for (const name of [...order, ...rest]) {
      const sheet = bySheet.get(name);
      if (!sheet) continue;
      const rep: SheetReport = {
        sheet: name,
        physicalRows: sheet.rows.length,
        header: 0,
        section: 0,
        blank: 0,
        data: 0,
        imported: 0,
        outcomes: {},
        sections: {},
      };
      const bump = (o: string) => {
        rep.outcomes[o] = (rep.outcomes[o] ?? 0) + 1;
        rep.imported++;
      };
      for (const r of sheet.rows) {
        rep[r.kind]++;
        if (r.kind !== "data") continue;
        rep.sections[r.section || "(main)"] = (rep.sections[r.section || "(main)"] ?? 0) + 1;

        if ((RECORD_SHEETS as readonly string[]).includes(name)) {
          await importRecordRow(c, name, r, statusSetBy, rowLog, bump);
        } else if (name === "TARGET ACCOUNTS") {
          await importAccountRow(c, r, rowLog, bump);
        } else if (name === "HISTORY") {
          await importHistoryRow(c, r, rowLog, bump);
        } else if (name === "CONFIG") {
          await importConfigRow(c, r, sheet, rowLog, bump, configSettings);
        } else {
          rowLog(name, r, "unmapped", null, "stored");
          bump("stored (no mapping)");
        }
      }
      report.sheets.push(rep);
    }

    for (const [key, value] of configSettings) {
      const current = await getSetting<Record<string, string>>(c, key, {});
      await setSetting(c, key, { ...current, ...value }, `Imported from CONFIG`);
    }
    for (let i = 0; i < pendingRows.length; i += 500) {
      await c.db.insert(importRows).values(pendingRows.slice(i, i + 500));
    }

    // Derived, evaluable criteria (upsert by key so re-imports don't duplicate).
    const existing = new Map((await listRules(c)).map((r) => [r.key, r]));
    const hctx: Ctx = { ...c, actor: { kind: "human", id: "owner" } }; // rules.edit on the owner's behalf during setup
    for (const rule of DERIVED_CRITERIA) {
      const e = existing.get(rule.key);
      if (e) await updateRule(hctx, e.id, { ...rule, enabled: e.enabled }, "Re-derived from CONFIG on import");
      else await createRule(hctx, rule, "derived:CONFIG");
    }

    // Expected counts, from CONFIG's own "MIGRATION VALIDATION" block.
    const validation = await getSetting<Record<string, string>>(c, "config.migration_validation", {});
    const after = (k: string) => Number(validation[k] ?? NaN);
    const expected: Record<string, number> = {
      PRIORITY: after("After - PRIORITY"),
      "TARGET ACCOUNTS": after("After - TARGET ACCOUNTS (outreach)") + after("After - TARGET ACCOUNTS (watchlist)"),
      "RAW LEADS": after("After - RAW LEADS"),
      ARCHIVE: after("After - ARCHIVE"),
      HOLD: after("After - HOLD"),
      HISTORY: after("After - HISTORY (reconciliation)") + after("After - HISTORY (application log)"),
    };
    for (const s of report.sheets) {
      if (Number.isFinite(expected[s.sheet])) s.expected = expected[s.sheet];
      if (s.imported !== s.data) report.ok = false;
      if (s.expected !== undefined && s.expected !== s.data) report.ok = false;
    }
    report.statusConflicts = [...statusSetBy.entries()]
      .filter(([, v]) => new Set(v.map((x) => x.split(":").pop())).size > 1)
      .map(([id, v]) => ({ id, sheets: v }));

    await c.db
      .update(importBatches)
      .set({ summary: { sha256, ...report } as unknown as Record<string, unknown> })
      .where(eq(importBatches.id, batchId));
    await setSetting(c, "import.hashes", [...previous, sha256], "Record imported workbook fingerprint");
    await logHistory(c, {
      entityType: "import",
      entityId: batchId,
      event: "workbook_import",
      reason: `Uploaded ${report.file}: ` + report.sheets.map((s) => `${s.sheet} ${s.imported} of ${s.data} rows`).join(", "),
      detail: { file: report.file, sha256 },
    });
    if (!report.ok) throw new ImportCountMismatch(report);
  });
  return report;
}

export class ImportCountMismatch extends Error {
  constructor(public report: ImportReport) {
    super("Imported row counts do not match the source workbook — nothing was written.");
  }
}

type RowLog = (sheet: string, r: SheetRow, entityType: string, entityId: string | null, outcome: string) => void;

async function importRecordRow(
  c: Ctx,
  sheet: string,
  r: SheetRow,
  statusSetBy: Map<string, string[]>,
  rowLog: RowLog,
  bump: (o: string) => void,
) {
  const plan = mapRecordRow(sheet, r.values);
  const key = dedupKey({
    account: plan.input.account ?? "UNKNOWN",
    opportunity: plan.input.opportunity ?? "UNKNOWN",
    sourceUrl: plan.input.sourceUrl,
    nextStepUrl: plan.input.nextStepUrl,
  });
  const before = await findByDedupKey(c, key);
  // Notes accumulate across sheets rather than overwrite.
  if (before?.notes && plan.input.notes && !before.notes.includes(plan.input.notes)) {
    plan.input.notes = `${before.notes}\n\n[${sheet}] ${plan.input.notes}`;
  }
  const { record, created } = await upsertLead(c, plan.input, `import:${sheet}`);

  if (plan.state) {
    const patch: Partial<RecordRow> = {};
    for (const [k, v] of Object.entries(plan.state)) {
      if (v === undefined || v === null) continue;
      // Don't regress a record's pipeline stage (e.g. ARCHIVE row for a lead that reached Verify).
      if (k === "stage" && STAGES.indexOf(v as RecordRow["stage"]) < STAGES.indexOf(record.stage)) continue;
      (patch as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(patch).length) {
      await c.db
        .update(records)
        .set({ ...patch, updatedAt: new Date().toISOString() })
        .where(and(eq(records.workspaceId, c.workspaceId), eq(records.id, record.id)));
      const after = await getRecord(c, record.id);
      if (after.stage !== record.stage || after.status !== record.status || created) {
        await logHistory(c, {
          entityType: "record",
          entityId: record.id,
          event: "import.state",
          priorStatus: created ? null : `${record.stage}/${record.status}`,
          newStatus: `${after.stage}/${after.status}`,
          reason: `From your spreadsheet (${sheet} sheet, row ${r.rowNumber})`,
        });
      }
    }
    if (plan.state.status) statusSetBy.set(record.id, [...(statusSetBy.get(record.id) ?? []), `${sheet}:${plan.state.status}`]);
  }
  rowLog(sheet, r, "record", record.id, created ? "created" : "merged");
  bump(created ? "created" : "merged into existing record");
}

async function importAccountRow(c: Ctx, r: SheetRow, rowLog: RowLog, bump: (o: string) => void) {
  const v = r.values;
  const used = new Set<string>();
  const p = (...n: string[]) => pick(v, used, ...n);
  const profile = p("Contact Profile");
  const input = {
    name: p("Account"),
    fit: p("Fit"),
    contactName: p("Contact Name"),
    contactProfileUrl: profile,
    sourceUrl: p("Source URL"),
    description: p("What They Do"),
    evidence: p("Evidence"),
    fitRationale: p("Fit Rationale"),
    preparedBrief: p("Prepared Brief (Short)"),
    preparedBriefLong: p("Prepared Brief (Long)"),
    responseNotes: p("Response Notes"),
    notes: p("Notes"),
    attributes: {
      ...leftovers(v, used), // Stage, Team Size, Problem
      list: /watchlist/i.test(r.section) ? "watchlist" : "outreach",
      ...(r.section ? { section: r.section } : {}),
    },
  };
  const { account, created } = await upsertAccount(c, input, "import:TARGET ACCOUNTS");
  rowLog("TARGET ACCOUNTS", r, "target_account", account.id, created ? "created" : "merged");
  bump(created ? "created" : "merged into existing account");
}

async function importHistoryRow(c: Ctx, r: SheetRow, rowLog: RowLog, bump: (o: string) => void) {
  const v = r.values;
  const url = v["Next Step URL"] ?? v["Source URL"];
  const key = dedupKey({ account: v.Account ?? "UNKNOWN", opportunity: v.Opportunity ?? "UNKNOWN", sourceUrl: url });
  const linked = await findByDedupKey(c, key);
  const block = /activity log/i.test(r.section) ? "activity_log" : "reconciliation";
  await logHistory(c, {
    entityType: "record",
    entityId: linked?.id ?? null,
    event: `import.history.${block}`,
    priorStatus: v["Follow-up Status"] ?? null,
    newStatus: v["Final Status"] ?? v["Verified Status"] ?? null,
    reason: v["Final Reason"] ?? v.Blocker ?? v["Next Action"] ?? `From your spreadsheet (History sheet, row ${r.rowNumber})`,
    occurredAt: v["Reverified Date"] ?? v["Last Action Date"] ?? v["Last Verified"] ?? undefined,
    detail: { source: "HISTORY", row: r.rowNumber, section: r.section || null, snapshot: v },
  });
  rowLog("HISTORY", r, "history", linked?.id ?? null, linked ? "history (linked)" : "history (unlinked)");
  bump(linked ? "history entry linked to record" : "history entry (no matching record)");
}

async function importConfigRow(
  c: Ctx,
  r: SheetRow,
  sheet: Sheet,
  rowLog: RowLog,
  bump: (o: string) => void,
  configSettings: Map<string, Record<string, string>>,
) {
  const key = (r.values.key ?? "").trim();
  const value = (r.values.value ?? "").trim();
  // Section header rows (key only) set the section for following rows.
  const idx = sheet.rows.indexOf(r);
  const sectionOf = () => {
    for (let i = idx; i >= 0; i--) {
      const x = sheet.rows[i];
      if (x.kind === "data" && x.values.key && !x.values.value) return x.values.key;
    }
    return "";
  };
  if (key && !value) {
    rowLog("CONFIG", r, "config_section", null, "section");
    bump("section heading");
    return;
  }
  const section = sectionOf();
  if (RULE_SECTIONS.some((re) => re.test(section))) {
    const ruleKey = `config.${slug(section)}.${slug(key)}`;
    const existing = (await listRules(c)).find((x) => x.key === ruleKey);
    const hctx: Ctx = { ...c, actor: { kind: "human", id: "owner" } };
    const input: RuleInput = {
      key: ruleKey,
      label: key,
      description: value,
      appliesFrom: stageForConfigRow(key),
      field: "",
      operator: "note",
      value: "",
      enabled: true,
    };
    const rule = existing
      ? await updateRule(hctx, existing.id, input, "Re-imported from CONFIG")
      : await createRule(hctx, input, "import:CONFIG");
    rowLog("CONFIG", r, "rule", rule.id, existing ? "rule updated" : "rule");
    bump(existing ? "rule updated" : "rule (process note)");
    return;
  }
  const settingKey = `config.${slug(section) || "misc"}`;
  configSettings.set(settingKey, { ...(configSettings.get(settingKey) ?? {}), [key]: value });
  rowLog("CONFIG", r, "setting", settingKey, "setting");
  bump("setting");
}
