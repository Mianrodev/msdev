/**
 * Storage schema (Postgres via Drizzle). Runs on any Postgres (Neon, Supabase, …) in production and on
 * PGlite (embedded Postgres, no install) for local development and tests.
 *
 * Every business table carries `workspace_id`, and every query is scoped by it. One deployment serves
 * one organisation; its team shares the "default" workspace.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

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

const workspaceId = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id);

/**
 * People who can sign in. The owner's credentials come from the OWNER_EMAIL / OWNER_PASSWORD
 * environment variables (their row only records them); members are added by the owner.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    /** Lower-cased. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    workspaceId: workspaceId(),
    /** scrypt hash; "env" for the owner (checked against OWNER_PASSWORD). */
    passwordHash: text("password_hash").notNull(),
    /** Bumped to sign this person out everywhere (part of every session token). */
    sessionEpoch: integer("session_epoch").notNull().default(0),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    lastSignInAt: text("last_sign_in_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/** Workspace and app settings (company profile, session secret, sign-in throttle counters). */
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

/** Append-only activity log. UPDATE and DELETE are blocked by a trigger (migration 0001). */
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
    occurredAt: text("occurred_at").notNull().default(now),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("history_ws_entity").on(t.workspaceId, t.entityType, t.entityId)],
);

/** Public provider data shared by every workspace (only for providers whose terms allow storage). */
export const sourceCache = pgTable("source_cache", {
  key: text("key").primaryKey(),
  fetchedAt: text("fetched_at").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type HistoryRow = typeof history.$inferSelect;

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
