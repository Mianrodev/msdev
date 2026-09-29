/**
 * Create/upgrade the local database, make sure the default workspace exists,
 * and sync redaction identity terms from the local (gitignored) identity file.
 * Run automatically by `npm run dev` / `npm start`.
 */
import { DEFAULT_DB_PATH, openDb } from "../src/db/client";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace } from "../src/services/context";
import { seedDefaultRules } from "../src/services/rules";
import { syncIdentityTerms } from "./lib/identity";

const db = openDb();
ensureWorkspace(db);
const ctx = { db, workspaceId: DEFAULT_WORKSPACE_ID, actor: { kind: "human" as const, id: "owner" } };
seedDefaultRules(ctx);
const n = syncIdentityTerms(ctx);
console.log(`Database ready: ${DEFAULT_DB_PATH}${n ? ` (${n} redaction terms loaded)` : ""}`);
