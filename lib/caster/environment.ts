type CasterEnvironment = Readonly<Record<string, string | undefined>>;

const STAGING_SUPABASE_REF = "zzbnneprhjicmajpjkdg";
const STAGING_SUPABASE_ORIGIN = `https://${STAGING_SUPABASE_REF}.supabase.co`;
const STAGING_CLERK_FRONTEND = "guided-goshawk-34.clerk.accounts.dev$";
const STAGING_ORIGIN = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";

function parseOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return value === url.origin || value === `${url.origin}/` ? url : null;
  } catch {
    return null;
  }
}

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function assertCasterBuildEnvironment(environment: CasterEnvironment = process.env): void {
  if (environment.CASTER_PROGRAM_ENABLED === "true" && !getCasterInvitationOrigin(environment)) {
    throw new Error("Caster programme opt-in requires isolated local fixtures, verified canonical Staging or verified IronClad Production.");
  }
}

export function getCasterInvitationOrigin(environment: CasterEnvironment = process.env): string | null {
  const configuredOrigin = environment.CASTER_PROGRAM_ORIGIN;
  if (environment.CASTER_PROGRAM_ENABLED !== "true") return null;
  if (environment.VERCEL_ENV === "production") {
    return isVerifiedIronCladProduction(environment) &&
      environment.PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED === "true" &&
      environment.PATCH2_ADMIN_INBOX_ENABLED === "true" &&
      (configuredOrigin === undefined || parseOrigin(configuredOrigin)?.origin === IRONCLAD_PRODUCTION_ORIGIN)
      ? IRONCLAD_PRODUCTION_ORIGIN : null;
  }
  const supabase = parseOrigin(environment.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabase ||
    !publishableKey?.startsWith("pk_test_") || !environment.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    !serviceRoleKey ||
    environment.TRANSACTIONAL_EMAIL_MODE !== "disabled") return null;

  if (!environment.VERCEL_ENV && !environment.VERCEL) {
    const origin = parseOrigin(configuredOrigin);
    if (!origin || !isLoopback(origin) || !isLoopback(supabase) ||
      environment.WEB_PUSH_VAPID_PUBLIC_KEY || environment.WEB_PUSH_VAPID_PRIVATE_KEY ||
      environment.WEB_PUSH_VAPID_SUBJECT) return null;

    const allowsLoopbackHttp = environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
    return origin.protocol === "https:" || (allowsLoopbackHttp && origin.protocol === "http:")
      ? origin.origin : null;
  }

  // The isolation attestation covers the hosted Clerk binding, protection, and
  // the database ACL that prevents the shared worker from claiming Web Push jobs.
  if (environment.VERCEL_ENV !== "preview" || environment.VERCEL_PROJECT_ID !== IRONCLAD_VERCEL_PROJECT ||
    environment.VERCEL_GIT_COMMIT_REF !== "staging" ||
    environment.PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED !== "true" ||
    environment.CASTER_HOSTED_ISOLATION_VERIFIED !== "true" ||
    supabase.origin !== STAGING_SUPABASE_ORIGIN || !hasSupabaseServiceIdentity(serviceRoleKey, STAGING_SUPABASE_REF) ||
    Buffer.from(publishableKey.slice(8), "base64url").toString("utf8") !== STAGING_CLERK_FRONTEND ||
    (configuredOrigin !== undefined && parseOrigin(configuredOrigin)?.origin !== STAGING_ORIGIN)) return null;

  return STAGING_ORIGIN;
}

export function isCasterProgramEnabled(): boolean {
  return getCasterInvitationOrigin() !== null;
}
import { hasSupabaseServiceIdentity, IRONCLAD_PRODUCTION_ORIGIN, IRONCLAD_VERCEL_PROJECT, isVerifiedIronCladProduction } from "../ironclad-release-environment";
