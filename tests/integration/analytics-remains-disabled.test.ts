import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

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

describe("PR B1 analytics-disabled contract", () => {
  it("contains no analytics package, tracker, beacon, endpoint, or runtime secret", () => {
    const packageJson = readFileSync(resolve(root, "package.json"), "utf8");
    const packageLock = readFileSync(resolve(root, "package-lock.json"), "utf8");
    expect(packageJson).not.toContain("@vercel/analytics");
    expect(packageLock).not.toContain('"node_modules/@vercel/analytics"');

    const files = [
      ...sourceRoots.flatMap((directory) =>
        sourceFiles(resolve(root, directory))
      ),
      resolve(root, "next.config.ts"),
    ];
    const runtimeSource = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(runtimeSource).not.toMatch(
      /(?:from|require\()\s*["']@vercel\/analytics/
    );
    expect(runtimeSource).not.toMatch(/<Analytics\b|\/_vercel\/insights/);
    expect(runtimeSource).not.toContain("VERCEL_ANALYTICS_ACCESS_TOKEN");
    expect(runtimeSource).not.toMatch(
      /<script[^>]+(?:analytics|insights)|sendBeacon\s*\(/i
    );
  });
});
