import type { NextConfig } from "next";
import { assertP03PreviewSafety } from "./lib/p03-preview-safety";
import { assertReleasePreviewSafety } from "./lib/release-preview-safety";
import { assertCasterBuildEnvironment } from "./lib/caster/environment";
import { CASTER_INVITATION_FRAME_POLICY } from "./lib/caster/invitation-policy";
import { assertReadyBuildEnvironment } from "./lib/ready/review-access";
import { verifyProductionFeatureCredentials } from "./lib/ironclad-release-verification";

assertReleasePreviewSafety();
assertP03PreviewSafety();
assertCasterBuildEnvironment();
assertReadyBuildEnvironment();

const nextConfig: NextConfig = {
  async headers() {
    await verifyProductionFeatureCredentials();
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "strict-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      {
        source: "/casters/:slug",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; frame-src 'self' https://www.youtube-nocookie.com https://player.twitch.tv https://clips.twitch.tv" },
        ],
      },
      {
        source: "/casters/invitation",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: CASTER_INVITATION_FRAME_POLICY },
        ],
      },
      {
        source: "/api/notifications/click",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
        ],
      },
      {
        source: "/api/steam/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
        ],
      },
    ];
  },
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
