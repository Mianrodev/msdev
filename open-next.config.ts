// Build settings for Cloudflare (OpenNext). Every page is per-user and rendered on request, so no
// shared page cache (R2/KV) is configured.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
