import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Produces a self-contained .next/standalone build (server.js + only the
  // node_modules it actually needs) so the Docker image doesn't have to ship
  // the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
