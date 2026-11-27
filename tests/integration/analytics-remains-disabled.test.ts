import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { readReadyUsageRequest } from "@/lib/ready/usage-events";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

describe("PR B2 analytics privacy and activation contract", () => {
  it("uses only the approved Vercel package and the restricted Ready usage boundary", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    const files = sourceRoots.flatMap((directory) =>
      sourceFiles(resolve(root, directory))
    );
    expect(packageJson.dependencies?.["@vercel/analytics"]).toBe("2.0.1");
    const usageSites = new Map<string, string[]>();
    for (const file of files) {
      const path = relative(root, file).replaceAll("\\", "/");
      const source = readFileSync(file, "utf8");
      const tracks = [...source.matchAll(/\b(?:track|trackRef\.current)\s*\(/g)];
      if (tracks.length > 0) {
        expect(path).toBe("components/ready/ReadyAssistant.tsx");
        const events = [...source.matchAll(/\b(?:usage\.track|trackRef\.current)\s*\(\s*\{\s*type:\s*"([a-z_]+)"/g)];
        expect(events).toHaveLength(tracks.length);
        usageSites.set(path, [...new Set(events.map((event) => event[1]))].sort());
      }
      if (/["']\/api\/ready\/usage["']/.test(source)) {
        expect(["lib/ready/use-ready-usage.ts", "lib/route-access.ts"]).toContain(path);
      }
      if (source.includes('"record_ready_usage_event"')) expect(path).toBe("app/api/ready/usage/route.ts");
      if (source.includes("@vercel/analytics")) expect(path).toBe("components/analytics/ConsentAwareVercelAnalytics.tsx");
      expect(source, path).not.toMatch(/sendBeacon\s*\(|\/_vercel\/insights|<script[^>]+(?:analytics|insights)/i);
    }
    expect([...usageSites]).toEqual([["components/ready/ReadyAssistant.tsx", [
      "action_click", "answer_display", "category_select", "engage", "fallback", "helpfulness",
      "manual_open", "question_select", "technical_error",
    ]]]);
  });

  it("requires affirmative Ready consent and a valid reviewer before storing allowlisted events", () => {
    const hook = readFileSync(resolve(root, "lib/ready/use-ready-usage.ts"), "utf8");
    const session = readFileSync(resolve(root, "lib/ready/session.ts"), "utf8");
    const route = readFileSync(resolve(root, "app/api/ready/usage/route.ts"), "utf8");
    expect(hook).toContain("useState(false)");
    expect(hook).toContain("if (!choice.enabled || !choice.epoch)");
    expect(hook).toContain("if (!active || inFlight.current.size >= 24) return");
    expect(session).toContain("if (!production && aliases.length === 0) return null");
    expect(session).toContain("isReadyProductionEnabled() && isReadyEngagementEnabled()");
    expect(session).toContain("if (!await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, false, { refreshClerkAuthority: true })) return null");
    expect(session).toContain("if (!isReadyReviewUser(user, userId, aliases)) return null");
    expect(route).toContain('request.headers.get("origin") !== new URL(request.url).origin');
    expect(route).toContain('legal.status === "satisfied"');
    expect(route).toContain('if (!player) return send({ error: "forbidden" }, 403)');
    expect(route).toContain('if (data === "off") return send({ error: "off" }, 403)');

    const event = {
      kind: "event", epoch: "11111111-1111-4111-8111-111111111111",
      browserId: "22222222-2222-4222-8222-222222222222", eventId: "33333333-3333-4333-8333-333333333333",
      event: { type: "manual_open" },
    };
    expect(readReadyUsageRequest(event)).toEqual(event);
    for (const privateField of ["message", "email", "clerkUserId", "query", "url", "ip", "token"]) {
      expect(readReadyUsageRequest({ ...event, [privateField]: "private" })).toBeNull();
      expect(readReadyUsageRequest({ ...event, event: { ...event.event, [privateField]: "private" } })).toBeNull();
    }
  });

  it("keeps every Analytics credential out of Client Components", () => {
    const clientSources = sourceRoots
      .flatMap((directory) => sourceFiles(resolve(root, directory)))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return /^\s*["']use client["'];/m.test(source);
      })
      .map((path) => ({
        path: relative(root, path),
        source: readFileSync(path, "utf8"),
      }));

    for (const file of clientSources) {
      expect(file.source, file.path).not.toMatch(
        /VERCEL_ANALYTICS_(?:ACCESS_TOKEN|TEAM_ID|PROJECT_ID)/
      );
      expect(file.source, file.path).not.toMatch(
        /NEXT_PUBLIC_[A-Z0-9_]*ANALYTICS/
      );
    }
  });

  it("declares only server-side Production reporting configuration", () => {
    const example = readFileSync(resolve(root, ".env.example"), "utf8");

    expect(example).toContain("VERCEL_ANALYTICS_ACCESS_TOKEN=");
    expect(example).toContain("VERCEL_ANALYTICS_TEAM_ID=");
    expect(example).toContain("VERCEL_ANALYTICS_PROJECT_ID=");
    expect(example).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*ANALYTICS/);
  });
});
