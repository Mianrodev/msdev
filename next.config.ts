import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Local-only v1: server actions are accepted from localhost only (Next's default origin check).
};

export default nextConfig;
