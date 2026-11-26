type CasterEnvironment = Readonly<Record<string, string | undefined>>;

const STAGING_SUPABASE_REF = "zzbnneprhjicmajpjkdg";
const STAGING_SUPABASE_ORIGIN = `https://${STAGING_SUPABASE_REF}.supabase.co`;
const STAGING_CLERK_FRONTEND = "guided-goshawk-34.clerk.accounts.dev$";
const STAGING_ORIGIN = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
const FEATURE_BRANCH = "codex/caster-phase-1-invitations";
const VERCEL_PROJECT_ID = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const FEATURE_BRANCH_HOST = /^ironclad-website-git-[a-z0-9]+(?:-[a-z0-9]+)*-ironclad-tournaments\.vercel\.app$/;
const FEATURE_DEPLOYMENT_HOST = /^ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app$/;

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

function hasSuppressedDelivery(environment: CasterEnvironment): boolean {
  return environment.TRANSACTIONAL_EMAIL_MODE === "disabled" &&
    !environment.WEB_PUSH_VAPID_PUBLIC_KEY && !environment.WEB_PUSH_VAPID_PRIVATE_KEY &&
    !environment.WEB_PUSH_VAPID_SUBJECT;
}

function hasStagingServiceRole(key: string): boolean {
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === "service_role" && payload.ref === STAGING_SUPABASE_REF;
  } catch {
    return false;
  }
}

function hasContinuationKey(value: string | undefined): boolean {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const key = Buffer.from(value, "base64url");
  return key.length === 32 && key.toString("base64url") === value;
}

function hasStagingBindings(environment: CasterEnvironment): boolean {
  const publishableKey = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  return parseOrigin(environment.NEXT_PUBLIC_SUPABASE_URL)?.origin === STAGING_SUPABASE_ORIGIN &&
    !!publishableKey?.startsWith("pk_test_") &&
    Buffer.from(publishableKey.slice(8), "base64url").toString("utf8") === STAGING_CLERK_FRONTEND &&
    !!environment.CLERK_SECRET_KEY?.startsWith("sk_test_") &&
    !!serviceRoleKey && hasStagingServiceRole(serviceRoleKey) && hasSuppressedDelivery(environment);
}

// Next evaluates this before a Git-triggered feature Preview can build and
// read application data, even while the public caster feature is disabled.
export function assertCasterFeaturePreviewBuildEnvironment(environment: CasterEnvironment = process.env): void {
  if (environment.VERCEL_GIT_COMMIT_REF !== FEATURE_BRANCH) return;
  if (environment.VERCEL_ENV !== "preview" || environment.VERCEL_PROJECT_ID !== VERCEL_PROJECT_ID ||
    !hasStagingBindings(environment) || environment.PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED !== "true") {
    throw new Error("Caster feature build requires the pinned Staging Preview, test Clerk, suppressed delivery and the Patch 2 notice.");
  }
}

export function getCasterInvitationOrigin(environment: CasterEnvironment = process.env): string | null {
  const origin = parseOrigin(environment.CASTER_PROGRAM_ORIGIN);
  const supabase = parseOrigin(environment.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (environment.CASTER_PROGRAM_ENABLED !== "true" || !origin || !supabase ||
    !publishableKey?.startsWith("pk_test_") || !environment.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    !serviceRoleKey || !hasContinuationKey(environment.CASTER_CONTINUATION_KEY) ||
    !hasSuppressedDelivery(environment)) return null;

  if (!environment.VERCEL_ENV && !environment.VERCEL && isLoopback(origin) && isLoopback(supabase)) {
    const allowsLoopbackHttp = environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
    return origin.protocol === "https:" || (allowsLoopbackHttp && origin.protocol === "http:")
      ? origin.origin : null;
  }

  if (environment.VERCEL_ENV !== "preview" || origin.protocol !== "https:" ||
    !hasStagingBindings(environment) ||
    environment.CASTER_HOSTED_ISOLATION_VERIFIED !== "true") return null;

  if (environment.VERCEL_GIT_COMMIT_REF === "staging" && origin.origin === STAGING_ORIGIN) {
    return origin.origin;
  }
  if (environment.VERCEL_GIT_COMMIT_REF !== FEATURE_BRANCH || environment.VERCEL_PROJECT_ID !== VERCEL_PROJECT_ID) return null;

  // The branch alias stays stable when Vercel creates a new deployment URL.
  const branchHost = environment.VERCEL_BRANCH_URL;
  if (branchHost && FEATURE_BRANCH_HOST.test(branchHost) && origin.origin === `https://${branchHost}`) return origin.origin;

  const deploymentHost = environment.VERCEL_URL;
  return deploymentHost && FEATURE_DEPLOYMENT_HOST.test(deploymentHost) &&
    origin.origin === `https://${deploymentHost}` ? origin.origin : null;
}

export function isCasterProgramEnabled(): boolean {
  return getCasterInvitationOrigin() !== null;
}
