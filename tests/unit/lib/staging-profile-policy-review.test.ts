import { afterEach, describe, expect, it, vi } from "vitest";
import { isStagingProfilePolicyReview } from "@/lib/staging-profile-policy-review";

describe("Staging profile policy review", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["preview", "staging", true],
    ["production", "staging", false],
    ["production", "master", false],
    ["preview", "other-preview", false],
    [undefined, "staging", false],
  ] as const)("restricts the draft page to the existing Staging preview (%s, %s)", (environment, branch, expected) => {
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
    expect(isStagingProfilePolicyReview()).toBe(expected);
  });
});
