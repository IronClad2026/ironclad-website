import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const readyAssistantPath = join(root, "components", "ready", "ReadyAssistant.tsx");
const approvedReadyCalls = new Set([
  'usage.track({ type: "manual_open" })',
  'usage.track({ type: "engage" })',
  'usage.track({ type: "category_select", categoryId: category.id })',
  'usage.track({ type: "question_select", questionId: request.id, categoryId })',
  'usage.track({ type: "action_click", actionId, categoryId: view.categoryId, questionId: view.questionId })',
  'usage.track({ type: "helpfulness", questionId, answerInstanceId, helpful })',
].map((call) => call.replace(/\s+/g, "")));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

describe("PR B2 analytics privacy and activation contract", () => {
  it("preserves the Vercel-only platform policy with a bounded Ready reviewer exception", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    const files = sourceRoots.flatMap((directory) =>
      sourceFiles(resolve(root, directory))
    );
    expect(packageJson.dependencies?.["@vercel/analytics"]).toBe("2.0.1");
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const filename = relative(root, path);
      expect(source, filename).not.toMatch(/sendBeacon\s*\(/);
      expect(source, filename).not.toMatch(/\/_vercel\/insights/);
      expect(source, filename).not.toMatch(/<script[^>]+(?:analytics|insights)/i);

      let trackingSource = source;
      if (path === readyAssistantPath) {
        expect(source).toMatch(/import\s+\{\s*useReadyUsage\s*\}\s+from\s+"@\/lib\/ready\/use-ready-usage"/);
        expect(source).toMatch(/\bconst\s+usage\s*=\s*useReadyUsage\(signedIn\)/);
        trackingSource = source.replace(/\busage\s*\.\s*track\s*\(\s*\{[^{}]*\}\s*\)/g, (call) =>
          approvedReadyCalls.has(call.replace(/\s+/g, "")) ? "" : call);
      }
      expect(trackingSource, filename).not.toMatch(/\btrack\s*\(/);
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
