import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

describe("analytics privacy referrer foundation", () => {
  it("limits every normal site response to an origin-only referrer", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const configuredHeaders = await nextConfig.headers!();

    expect(configuredHeaders).toContainEqual({
      source: "/:path*",
      headers: [
        {
          key: "Referrer-Policy",
          value: "strict-origin",
        },
      ],
    });
  });

  it.each([
    "app/api/steam/connect/route.ts",
    "app/api/steam/callback/route.ts",
  ])("preserves the stronger no-referrer Steam boundary in %s", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");

    expect(source).toContain('headers.set("Referrer-Policy", "no-referrer")');
  });
});
