// Loaded by next.config.ts before application modules or build-time data reads.
type Environment = Readonly<Record<string, string | undefined>>;

/** No independently provisioned and verified release Preview exists yet. */
export function assertReleasePreviewSafety(environment: Environment = process.env): void {
  if (environment.VERCEL_ENV === "preview") {
    throw new Error("Release Preview is disabled: isolated Supabase, Clerk, storage and outbound resources have not been verified. Use isolated local validation.");
  }
}
