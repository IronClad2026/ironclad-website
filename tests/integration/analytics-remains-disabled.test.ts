import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
  it("uses only the approved Vercel package and has no custom tracker", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    const files = sourceRoots.flatMap((directory) =>
      sourceFiles(resolve(root, directory))
    );
    const runtimeSource = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(packageJson.dependencies?.["@vercel/analytics"]).toBe("2.0.1");
    expect(runtimeSource).not.toMatch(/\btrack\s*\(/);
    expect(runtimeSource).not.toMatch(/sendBeacon\s*\(/);
    expect(runtimeSource).not.toMatch(/\/_vercel\/insights/);
    expect(runtimeSource).not.toMatch(/<script[^>]+(?:analytics|insights)/i);
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
