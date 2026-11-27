type ReadyEnvironment = Readonly<Record<string, string | undefined>>;
type FixtureUser = {
  id: string;
  banned: boolean;
  locked: boolean;
  privateMetadata: Record<string, unknown>;
};

export function isReadyStagingEnabled(environment: ReadyEnvironment = process.env): boolean {
  return environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF === "staging" &&
    environment.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") === "https://zzbnneprhjicmajpjkdg.supabase.co" &&
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") === true &&
    environment.CLERK_SECRET_KEY?.startsWith("sk_test_") === true;
}

export function isReadyProductionEnabled(environment: ReadyEnvironment = process.env): boolean {
  return environment.READY_PROGRAM_ENABLED === "true" && isVerifiedIronCladProduction(environment) &&
    environment.PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED === "true";
}

export function isReadyEnabled(environment: ReadyEnvironment = process.env): boolean {
  return isReadyStagingEnabled(environment) || isReadyProductionEnabled(environment);
}

export function isReadyEngagementEnabled(environment: ReadyEnvironment = process.env): boolean {
  return isReadyStagingEnabled(environment) ||
    (isReadyProductionEnabled(environment) && environment.READY_ENGAGEMENT_ENABLED === "true");
}

export function assertReadyBuildEnvironment(environment: ReadyEnvironment = process.env): void {
  if (environment.READY_PROGRAM_ENABLED === "true" && !isReadyEnabled(environment)) {
    throw new Error("Ready opt-in requires verified canonical Staging or verified IronClad Production.");
  }
}

export function readyReviewAliases(environment: ReadyEnvironment): readonly string[] {
  if (!isReadyStagingEnabled(environment)) return [];
  return (environment.READY_STAGING_REVIEW_ALIASES ?? "")
    .split(",").map((value) => value.trim()).filter((value) => /^TestAcademy[1-4]$/.test(value));
}

export function isReadyReviewUser(user: FixtureUser, expectedUserId: string, aliases: readonly string[]): boolean {
  const metadata = user.privateMetadata;
  return user.id === expectedUserId && !user.banned && !user.locked &&
    metadata.ironclad_fixture_source === "staging_synthetic_uat" &&
    metadata.ironclad_fixture_contract_version === "staging-synthetic-v1" &&
    typeof metadata.ironclad_fixture_alias === "string" &&
    aliases.includes(metadata.ironclad_fixture_alias);
}
import { isVerifiedIronCladProduction } from "../ironclad-release-environment";
