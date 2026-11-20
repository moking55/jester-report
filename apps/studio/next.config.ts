import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // the Docker image runs .next/standalone/server.js
  poweredByHeader: false,
  // a draft file may be 1 MB of UTF-8 (the api's limit); the action's own encoding adds a little on top
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // the service worker is always fetched fresh, so a new version takes over on the next visit (v1.10)
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
};

export default nextConfig;
