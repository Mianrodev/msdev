import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local embedded Postgres) ships WASM files; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Room for uploading the tracker workbook.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
