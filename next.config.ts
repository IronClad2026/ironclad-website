import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allows one 10 MiB avatar plus validated profile fields and multipart
      // overhead. Replay and tournament-banner bytes upload directly to Storage.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
