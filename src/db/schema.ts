/**
 * Storage schema (Postgres via Drizzle). Every table carries `workspace_id` so
 * multi-tenant support is a matter of resolving the workspace from an
 * authenticated user, not a data-layer rewrite.
 *
 * Runs on any Postgres (Neon, Supabase, …) in production and on PGlite
 * (embedded Postgres, no install) for local development and tests.
 *
 * Deletion is blocked at the database level by triggers (see the
 * `append_only` migration): records, target accounts and rules can only be
 * archived/disabled, and history can only be appended to.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

/** ISO-8601 UTC timestamp text, matching what the app writes (new Date().toISOString()). */
const now = sql`(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;
const timestamps = {
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
};

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

/**
 * People who can sign in. The owner (id "owner") runs the default workspace and
 * manages the team; each invited member gets a private workspace of their own.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    /** Lower-cased. The owner may have none (they sign in with the password alone). */
    email: text("email"),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    passwordHash: text("password_hash").notNull(),
    recoveryHash: text("recovery_hash"),
    /** Bumped to sign this person out everywhere (part of every session token). */
    sessionEpoch: integer("session_epoch").notNull().default(0),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    lastSignInAt: text("last_sign_in_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/** One-time invite links. Only a hash of the token is stored. */
export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdBy: text("created_by").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    userId: text("user_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("invites_token_uq").on(t.tokenHash)],
);

/**
 * Public job-board data fetched once and shared by every workspace (nothing private: only what
 * a company's own careers page publishes). Saves downloading the same board twice.
 */
export const sourceCache = pgTable("source_cache", {
  key: text("key").primaryKey(),
  fetchedAt: text("fetched_at").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
});

const workspaceId = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id);

/**
 * One row per discovered item across its whole life. "Lead", "Prospect",
 * "Held lead" and "Archived lead" are views over stage + status, so an item
 * moving between them is a status change (logged to History), never a copy.
 */
export const records = pgTable(
  "records",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    dedupKey: text("dedup_key").notNull(),

    account: text("account").notNull(),
    opportunity: text("opportunity").notNull(),
    sourceUrl: text("source_url"),
    nextStepUrl: text("next_step_url"),
    sourceBoard: text("source_board"),
    location: text("location"),
    dateFound: text("date_found"),

    stage: text("stage", { enum: ["discovery", "screen", "triage", "verify"] })
      .notNull()
      .default("discovery"),
    status: text("status", { enum: ["active", "hold", "archived"] })
      .notNull()
      .default("active"),
    sourceVerification: text("source_verification", { enum: ["unverified", "verified", "unreachable"] })
      .notNull()
      .default("unverified"),

    discoveryVerdict: text("discovery_verdict"),
    discoveryReason: text("discovery_reason"),
    screenVerdict: text("screen_verdict"),
    screenReason: text("screen_reason"),
    screenConfidence: integer("screen_confidence"),
    screenedAt: text("screened_at"),
    triageVerdict: text("triage_verdict"),
    triageReason: text("triage_reason"),
    triageConfidence: integer("triage_confidence"),
    triagedAt: text("triaged_at"),
    verifyVerdict: text("verify_verdict"),
    verifyReason: text("verify_reason"),
    verifyConfidence: integer("verify_confidence"),
    verifiedAt: text("verified_at"),

    fitTier: text("fit_tier", { enum: ["exceptional", "strong", "good", "stretch"] }),
    locationFit: text("location_fit"),
    valueFit: text("value_fit"),
    requirements: text("requirements"),
    gapsHard: text("gaps_hard"),
    gapsSoft: text("gaps_soft"),
    fitRationale: text("fit_rationale"),
    preparedBrief: text("prepared_brief"),
    preparedAnswers: text("prepared_answers"),
    lastVerifiedAt: text("last_verified_at"),
    responseNotes: text("response_notes"),
    outreachStatus: text("outreach_status", {
      enum: ["not_started", "package_ready", "approved", "sent_manually", "responded", "interviewing", "offer", "rejected", "closed"],
    })
      .notNull()
      .default("not_started"),

    // Personal contact details live only in these labelled, restricted fields —
    // never in notes, never part of the display name or the dedup key.
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactProfileUrl: text("contact_profile_url"),
    holdReason: text("hold_reason"),
    nextAction: text("next_action"),
    holdSince: text("hold_since"),
    archiveReason: text("archive_reason"),
    archivedAt: text("archived_at"),
    notes: text("notes"),

    /** Criterion values the rules evaluate, e.g. {"value": 85000, "location": "UNKNOWN"}. */
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    /** Imported columns with no first-class field — kept verbatim so nothing is lost. */
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    origin: text("origin").notNull().default("manual"),
    lastReconciledAt: text("last_reconciled_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("records_ws_dedup").on(t.workspaceId, t.dedupKey),
    index("records_ws_stage_status").on(t.workspaceId, t.stage, t.status),
  ],
);

/** Accounts worth tracking for outreach even without a specific open opportunity. */
export const targetAccounts = pgTable(
  "target_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    dedupKey: text("dedup_key").notNull(),
    name: text("name").notNull(),
    website: text("website"),
    sourceUrl: text("source_url"),
    fit: text("fit"),
    // Personal contact details live only in these labelled, restricted fields —
    // never in notes, never part of the display name or the dedup key.
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactProfileUrl: text("contact_profile_url"),
    description: text("description"),
    evidence: text("evidence"),
    fitRationale: text("fit_rationale"),
    preparedBrief: text("prepared_brief"),
    preparedBriefLong: text("prepared_brief_long"),
    responseNotes: text("response_notes"),
    status: text("status", { enum: ["tracking", "hold", "archived"] })
      .notNull()
      .default("tracking"),
    archiveReason: text("archive_reason"),
    notes: text("notes"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    origin: text("origin").notNull().default("manual"),
    ...timestamps,
  },
  (t) => [uniqueIndex("target_accounts_ws_dedup").on(t.workspaceId, t.dedupKey)],
);

/** Stage criteria and process rules — replaces the workbook's hidden CONFIG sheet. */
export const rules = pgTable(
  "rules",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    appliesFrom: text("applies_from", { enum: ["screen", "triage", "verify"] })
      .notNull()
      .default("screen"),
    field: text("field").notNull().default(""),
    operator: text("operator", {
      enum: ["gte", "lte", "includes_any", "excludes_all", "starts_with_any", "not_starts_with_any", "equals", "note"],
    }).notNull(),
    value: jsonb("value").$type<unknown>(),
    /** What a violation does: "reject" archives; "hold" parks the record in Hold. */
    effect: text("effect", { enum: ["reject", "hold"] })
      .notNull()
      .default("reject"),
    enabled: boolean("enabled").notNull().default(true),
    origin: text("origin").notNull().default("manual"),
    ...timestamps,
  },
  (t) => [uniqueIndex("rules_ws_key").on(t.workspaceId, t.key)],
);

/** Workspace-level settings (e.g. identity terms for redaction). */
export const settings = pgTable(
  "settings",
  {
    workspaceId: workspaceId(),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("settings_ws_key").on(t.workspaceId, t.key)],
);

/** Append-only audit log. UPDATE and DELETE are blocked by triggers. */
export const history = pgTable(
  "history",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: workspaceId(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    event: text("event").notNull(),
    priorStatus: text("prior_status"),
    newStatus: text("new_status"),
    reason: text("reason"),
    actor: text("actor").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    /** Business date of the change (may be historical for imported entries). */
    occurredAt: text("occurred_at").notNull().default(now),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("history_ws_entity").on(t.workspaceId, t.entityType, t.entityId)],
);

/** One row per "Run update" — the weekly pipeline run — with its summary. */
export const pipelineRuns = pgTable("pipeline_runs", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  actor: text("actor").notNull(),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
});

export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  fileName: text("file_name").notNull(),
  /** Per-sheet source row counts and outcomes, for the no-record-loss check. */
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
  createdAt: text("created_at").notNull().default(now),
});

/** Every source row, verbatim, linked to what it became. Guarantees nothing is lost in migration. */
export const importRows = pgTable(
  "import_rows",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: workspaceId(),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id),
    sheet: text("sheet").notNull(),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    outcome: text("outcome").notNull(),
  },
  (t) => [index("import_rows_batch").on(t.batchId, t.sheet)],
);

export type RecordRow = typeof records.$inferSelect;
export type NewRecordRow = typeof records.$inferInsert;
export type TargetAccountRow = typeof targetAccounts.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
export type HistoryRow = typeof history.$inferSelect;

export type UserRow = typeof users.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;

// ---------------------------------------------------------------- opportunity discovery
// Tenders, sponsors, suppliers and expansion areas. Every row is scoped by workspace; demo and live
// records never share a row (mode is part of the identity).

/** One search run: what was asked, which providers answered, and whether the result is complete. */
export const oppSearches = pgTable(
  "opp_searches",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    module: text("module").notNull(),
    mode: text("mode", { enum: ["demo", "live"] }).notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status", { enum: ["complete", "partial", "failed"] }).notNull(),
    providers: jsonb("providers").$type<unknown[]>().notNull().default([]),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    error: text("error"),
    resultCount: integer("result_count").notNull().default(0),
    actor: text("actor").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
  },
  (t) => [index("opp_searches_ws_module").on(t.workspaceId, t.module, t.startedAt)],
);

/** One external record (normalised), with field-level evidence and the user's tracking state. */
export const oppItems = pgTable(
  "opp_items",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    module: text("module").notNull(),
    mode: text("mode", { enum: ["demo", "live"] }).notNull(),
    dedupKey: text("dedup_key").notNull(),
    provider: text("provider").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    sourceUrl: text("source_url"),
    retrievedAt: text("retrieved_at").notNull(),
    publishedAt: text("published_at"),
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}),
    links: jsonb("links").$type<unknown[]>().notNull().default([]),
    /** Optional AI/automatic summary, always labelled with how it was made. */
    enrichment: jsonb("enrichment").$type<Record<string, unknown> | null>(),
    lastMatch: jsonb("last_match").$type<Record<string, unknown> | null>(),
    lastSearchId: text("last_search_id"),
    savedAt: text("saved_at"),
    status: text("status"),
    ...timestamps,
  },
  (t) => [uniqueIndex("opp_items_ws_identity").on(t.workspaceId, t.module, t.mode, t.dedupKey), index("opp_items_ws_saved").on(t.workspaceId, t.module, t.savedAt)],
);

/** Ranked results of one search, with the score breakdown as it was computed then. */
export const oppResults = pgTable(
  "opp_results",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: workspaceId(),
    searchId: text("search_id")
      .notNull()
      .references(() => oppSearches.id),
    itemId: text("item_id")
      .notNull()
      .references(() => oppItems.id),
    rank: integer("rank").notNull(),
    match: jsonb("match").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("opp_results_search").on(t.searchId, t.rank)],
);

export const oppLists = pgTable(
  "opp_lists",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    module: text("module").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("opp_lists_ws_name").on(t.workspaceId, t.module, t.name)],
);

export const oppListItems = pgTable(
  "opp_list_items",
  {
    workspaceId: workspaceId(),
    listId: text("list_id")
      .notNull()
      .references(() => oppLists.id),
    itemId: text("item_id")
      .notNull()
      .references(() => oppItems.id),
    addedAt: text("added_at").notNull().default(now),
  },
  (t) => [uniqueIndex("opp_list_items_uq").on(t.listId, t.itemId)],
);

export const oppNotes = pgTable(
  "opp_notes",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    itemId: text("item_id")
      .notNull()
      .references(() => oppItems.id),
    body: text("body").notNull(),
    actor: text("actor").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("opp_notes_item").on(t.workspaceId, t.itemId)],
);

/** Usage counters per workspace and window (rate limits and live-provider caps). */
export const oppUsage = pgTable(
  "opp_usage",
  {
    workspaceId: workspaceId(),
    bucket: text("bucket").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("opp_usage_uq").on(t.workspaceId, t.bucket)],
);

export type OppSearchRow = typeof oppSearches.$inferSelect;
export type OppItemRow = typeof oppItems.$inferSelect;
export type OppListRow = typeof oppLists.$inferSelect;
export type OppNoteRow = typeof oppNotes.$inferSelect;
