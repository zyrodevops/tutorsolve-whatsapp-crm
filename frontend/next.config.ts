import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Produces a self-contained .next/standalone build (server.js + only the
  // node_modules it actually needs) so the Docker image doesn't have to ship
  // the full node_modules tree.
  output: "standalone",

  // Proxy all API and Socket.IO traffic through the Next.js server so that
  // every browser request is same-origin (frontend domain). This means:
  //   - Auth cookies are set/read on the frontend domain → no cross-site
  //     cookie issues regardless of browser SameSite policy.
  //   - Works on Railway (different backend domain) and localhost identically.
  //
  // BACKEND_URL is a SERVER-SIDE env var (no NEXT_PUBLIC_ prefix). It is read
  // at Next.js startup, not baked at build time, so it can be set per-environment
  // in Railway/docker-compose without a rebuild.
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
    return [
      // REST API
      { source: "/api/:path*",    destination: `${backendUrl}/api/:path*` },
      // Socket.IO (HTTP polling + WebSocket upgrade)
      { source: "/socket.io/:path*", destination: `${backendUrl}/socket.io/:path*` },
      // Meta webhook (inbound messages from Meta)
      { source: "/webhook",       destination: `${backendUrl}/webhook` },
    ];
  },
};

export default nextConfig;
