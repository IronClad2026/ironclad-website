type ReadyEnvironment = Readonly<Record<string, string | undefined>>;
type FixtureUser = {
  id: string;
  banned: boolean;
  locked: boolean;
  privateMetadata: Record<string, unknown>;
};

export function readyReviewAliases(environment: ReadyEnvironment): readonly string[] {
  if (
    environment.VERCEL_ENV !== "preview" ||
    environment.VERCEL_GIT_COMMIT_REF !== "staging" ||
    environment.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== "https://zzbnneprhjicmajpjkdg.supabase.co" ||
    !environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
    !environment.CLERK_SECRET_KEY?.startsWith("sk_test_")
  ) return [];

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
