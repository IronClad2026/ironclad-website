import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

const GLOBAL_HEADERS = {
  "content-security-policy":
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=()",
  "referrer-policy": "strict-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

const REPRESENTATIVE_PATHS = [
  "/",
  "/tournaments",
  "/players",
  "/rankings",
  "/rules",
  "/privacy",
  "/terms",
  "/dashboard",
  "/admin",
  "/sign-in",
  "/manifest.webmanifest",
  "/_next/static/chunks/runtime.js",
  "/_next/image?url=%2Fimages%2Fironclad-logo.png&w=256&q=75",
  "/images/ironclad-logo.png",
  "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.1.pdf",
  "/players/not-a-uuid/avatar",
  "/api/internal/transactional-email",
] as const;

const NO_REFERRER_PATHS = [
  "/api/notifications/click",
  "/api/steam/connect",
  "/api/steam/callback",
] as const;

async function responseFromConfig(path: string) {
  return unstable_getResponseFromNextConfig({
    url: new URL(path, "https://www.ironcladtournaments.com").toString(),
    nextConfig,
  });
}

function expectGlobalProtections(
  headers: Headers,
  referrerPolicy: "strict-origin" | "no-referrer" =
    GLOBAL_HEADERS["referrer-policy"]
) {
  for (const [name, value] of Object.entries(GLOBAL_HEADERS)) {
    expect(headers.get(name), name).toBe(
      name === "referrer-policy" ? referrerPolicy : value
    );
  }
}

describe("browser response protection foundation", () => {
  it.each(REPRESENTATIVE_PATHS)(
    "applies the bounded global policy to %s",
    async (path) => {
      expectGlobalProtections((await responseFromConfig(path)).headers);
    }
  );

  it.each(NO_REFERRER_PATHS)(
    "preserves the stronger no-referrer boundary on %s",
    async (path) => {
      expectGlobalProtections(
        (await responseFromConfig(path)).headers,
        "no-referrer"
      );
    }
  );

  it("defines each global protection exactly once without a broad CSP", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const configuredHeaders = await nextConfig.headers!();
    const globalRules = configuredHeaders.filter(
      (rule) => rule.source === "/:path*"
    );

    expect(globalRules).toHaveLength(1);
    const headerKeys = globalRules[0]!.headers.map(({ key }) =>
      key.toLowerCase()
    );
    expect(new Set(headerKeys).size).toBe(headerKeys.length);
    expect(headerKeys.sort()).toEqual(Object.keys(GLOBAL_HEADERS).sort());

    const policy = GLOBAL_HEADERS["content-security-policy"];
    expect(policy).not.toMatch(
      /(?:default|script|style|connect|img|font|worker|frame)-src|form-action/
    );
  });

  it("keeps the service worker root-scoped, uncached, and correctly typed", async () => {
    const response = await responseFromConfig("/sw.js");

    expect(response.headers.get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate"
    );
    expect(response.headers.get("Content-Type")).toBe(
      "application/javascript; charset=utf-8"
    );
    expect(response.headers.get("Service-Worker-Allowed")).toBe("/");
    expectGlobalProtections(response.headers);
  });

  it.each([
    "app/api/steam/connect/route.ts",
    "app/api/steam/callback/route.ts",
  ])("preserves the stronger no-referrer Steam boundary in %s", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");

    expect(source).toContain('headers.set("Referrer-Policy", "no-referrer")');
  });
});
