import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // the Docker image runs .next/standalone/server.js
  poweredByHeader: false,
  // a draft file may be 1 MB of UTF-8 (the api's limit); the action's own encoding adds a little on top
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
