// Bindings available to the Worker (see wrangler.jsonc). Secrets and plain variables reach the app as
// process.env.
interface CloudflareEnv {
  DB?: import("@cloudflare/workers-types").D1Database;
  ASSETS?: import("@cloudflare/workers-types").Fetcher;
}
