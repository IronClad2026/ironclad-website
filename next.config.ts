import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.68.64"],

  experimental: {
    serverActions: {
      bodySizeLimit: "22mb",
    },
  },
};

export default nextConfig;