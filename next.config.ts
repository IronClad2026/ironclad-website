import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keeps one 4 MiB avatar plus validated profile fields and multipart
    // overhead below the hosting payload ceiling. Replay and tournament-banner
    // bytes upload directly to Storage.
    proxyClientMaxBodySize: 4_400_000,
    serverActions: {
      bodySizeLimit: 4_400_000,
    },
  },
};

export default nextConfig;
