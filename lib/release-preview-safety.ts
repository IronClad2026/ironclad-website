// Loaded by next.config.ts before application modules or build-time data reads.
import { assertStagingPreviewResources } from "./p03-preview-safety";

type Environment = Readonly<Record<string, string | undefined>>;

// These two review branches use the independently attested Staging resources.
// This exception does not authorize any other feature or release Preview.
const STAGING_REVIEW_BRANCHES = new Set([
  "feature/public-player-tournament-history-2026-10",
  "feature/home-collaboration-2026-10",
]);
// Verified 2026-10-29: public key from the guarded Staging Preview passed a
// read-only HEAD against the approved Staging public projection. No key stored.
const APPROVED_STAGING_PUBLISHABLE_KEY_SHA256 =
  "a0314ae03160c84408f67f2a27f136e3cf83427999b2c1888f227e1704ea719d";
const UNVERIFIED_RESOURCES = [
  "COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK",
  "COMBAT_HIGHLIGHTS_WORKER_URL",
  "COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS",
  "COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV",
  "COH3STATS_API_TOKEN",
] as const;

/** Keep unverified hosted Previews blocked; validate every allowed build. */
export function assertReleasePreviewSafety(environment: Environment = process.env): void {
  if (environment.VERCEL_ENV !== "preview") return;
  if (!STAGING_REVIEW_BRANCHES.has(environment.VERCEL_GIT_COMMIT_REF ?? "")) {
    throw new Error("Release Preview is disabled: isolated Supabase, Clerk, storage and outbound resources have not been verified. Use isolated local validation.");
  }

  assertStagingPreviewResources(environment, {
    requireProjectBoundKeys: true,
    approvedPublishableKeyDigest: APPROVED_STAGING_PUBLISHABLE_KEY_SHA256,
  });

  const failures: string[] = [];
  if (environment.COMBAT_HIGHLIGHTS_ENABLED && environment.COMBAT_HIGHLIGHTS_ENABLED !== "false") {
    failures.push("COMBAT_HIGHLIGHTS_ENABLED must be absent or false");
  }
  for (const key of UNVERIFIED_RESOURCES) {
    if (environment[key]?.trim()) failures.push(`${key} must be absent`);
  }
  if (failures.length) {
    throw new Error(`Feature Preview isolation check failed: ${failures.join("; ")}.`);
  }
}
