import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets several local dev servers run side by side (each with its own build directory).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  agentRules: false,
};

export default nextConfig;
