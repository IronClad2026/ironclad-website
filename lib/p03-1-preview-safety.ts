// Evaluated by Next configuration before build-time application reads.
export function assertRealtimeStagingEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): void {
  if (environment.VERCEL_ENV !== "preview" ||
    !["staging", "codex/p03-1-realtime-match-room"].includes(environment.VERCEL_GIT_COMMIT_REF ?? "")) return;

  const failures: string[] = [];
  if (environment.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== "https://zzbnneprhjicmajpjkdg.supabase.co") {
    failures.push("NEXT_PUBLIC_SUPABASE_URL must identify Staging");
  }
  if (!environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
    !environment.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    failures.push("Clerk keys must use test mode");
  }
  if (Object.values(environment).some((value) => value?.includes("nsyjtqpvyxlzyujlbzos"))) {
    failures.push("Production Supabase configuration is forbidden");
  }
  for (const key of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const value = environment[key];
    if (!value || !value.includes(".")) continue;
    try {
      const claims = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
      if (claims.ref !== "zzbnneprhjicmajpjkdg") failures.push(`${key} must identify Staging`);
    } catch {
      failures.push(`${key} has invalid JWT configuration`);
    }
  }
  if (failures.length) throw new Error(`P03.1 Staging isolation failed: ${failures.join("; ")}.`);
}
