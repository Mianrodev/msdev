import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page reads live data (force-dynamic), so there's no page cache to store.
export default defineCloudflareConfig({});
