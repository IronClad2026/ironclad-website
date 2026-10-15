import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("public profile native RSC request isolation", () => {
  it.each(["development", "production"] as const)("deduplicates metadata/page only within one %s request", (mode) => {
    const environment = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key] as string]]));
    const output = execFileSync(process.execPath, ["--conditions=react-server", "tests/performance/public-profile-rsc-fixture.mjs", "1"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
      env: { ...environment, NODE_ENV: mode },
    });
    expect(JSON.parse(output)).toMatchObject({ passed: true, benchmarkRequests: 30, lookupsPerMetadataAndPageRequest: 1, totalBenchmarkLookups: 30,
      simultaneousRequestsIsolated: true, nextRequestPrivacyOptOutFresh: true, failureDoesNotPersistToNextRequest: true,
      distinctIdsDoNotCollide: true, realProvidersUsed: false });
  }, 20_000);
});
