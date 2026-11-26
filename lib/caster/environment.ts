type CasterEnvironment = Readonly<Record<string, string | undefined>>;

const STAGING_SUPABASE_REF = "zzbnneprhjicmajpjkdg";
const STAGING_SUPABASE_ORIGIN = `https://${STAGING_SUPABASE_REF}.supabase.co`;
const STAGING_CLERK_FRONTEND = "guided-goshawk-34.clerk.accounts.dev$";
const STAGING_ORIGIN = "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app";
const FEATURE_BRANCH = "codex/caster-phase-1-invitations";

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
    supabase.origin !== STAGING_SUPABASE_ORIGIN || !hasStagingServiceRole(serviceRoleKey) ||
    Buffer.from(publishableKey.slice(8), "base64url").toString("utf8") !== STAGING_CLERK_FRONTEND ||
    environment.CASTER_HOSTED_ISOLATION_VERIFIED !== "true") return null;

  if (environment.VERCEL_GIT_COMMIT_REF === "staging" && origin.origin === STAGING_ORIGIN) {
    return origin.origin;
  }
  const featureHost = environment.VERCEL_URL;
  return environment.VERCEL_GIT_COMMIT_REF === FEATURE_BRANCH && featureHost &&
    /^ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app$/.test(featureHost) &&
    origin.origin === `https://${featureHost}` ? origin.origin : null;
}

export function isCasterProgramEnabled(): boolean {
  return getCasterInvitationOrigin() !== null;
}
