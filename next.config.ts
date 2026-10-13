import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// `next dev` gets the same bindings as the deployed Worker (a local D1 database under .wrangler/).
initOpenNextCloudflareForDev();
