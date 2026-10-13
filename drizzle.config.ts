import { defineConfig } from "drizzle-kit";

// Migrations are plain SQL files applied by Wrangler (`wrangler d1 migrations apply`) in Cloudflare and
// by Drizzle's migrator in tests.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
