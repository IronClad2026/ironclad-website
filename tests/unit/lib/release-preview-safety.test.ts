import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertReleasePreviewSafety } from "@/lib/release-preview-safety";

describe("Release hosted Preview remains disabled until isolation is independently verified", () => {
  it.each(["release/consolidated-production-2026-10", "unknown-branch", "master", undefined])(
    "rejects Preview for every branch including missing metadata: %s", (branch) => {
      const environment = Object.freeze({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch, CLERK_SECRET_KEY: "private-sentinel" });
      expect(() => assertReleasePreviewSafety(environment)).toThrow("isolated Supabase, Clerk, storage and outbound resources have not been verified");
      try { assertReleasePreviewSafety(environment); } catch (error) { expect(String(error)).not.toContain("private-sentinel"); }
    },
  );
  it("runs at config evaluation before the legacy check and application build", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config.indexOf("assertReleasePreviewSafety();")).toBeLessThan(config.indexOf("assertP03PreviewSafety();"));
    expect(config.indexOf("assertReleasePreviewSafety();")).toBeLessThan(config.indexOf("const nextConfig"));
  });
  it("leaves Production and unhosted local validation to their own resource safeguards", () => {
    expect(() => assertReleasePreviewSafety({ VERCEL_ENV: "production" })).not.toThrow();
    expect(() => assertReleasePreviewSafety({})).not.toThrow();
  });
});
