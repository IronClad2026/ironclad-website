// Build-configuration helper: imported only by next.config.ts, which runs in
// ordinary Node before application modules. Do not import this into app code.
import { Buffer } from "node:buffer";

type PreviewEnvironment = Readonly<Record<string, string | undefined>>;

const CANDIDATE_BRANCH = "codex/p03-production-ready";
const STAGING_REF = "zzbnneprhjicmajpjkdg";
const PRODUCTION_REF = "nsyjtqpvyxlzyujlbzos";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;
const OUTBOUND_CREDENTIALS = [
  "RESEND_API_KEY",
  "TRANSACTIONAL_EMAIL_WORKER_SECRET",
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
  "VERCEL_ANALYTICS_ACCESS_TOKEN",
  "STEAM_WEB_API_KEY",
] as const;
const DIRECT_DATABASE_URLS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_URL",
] as const;

function isStagingOrigin(value: string | undefined): boolean {
  if (!value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === STAGING_HOST &&
      !url.port && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isStagingDatabase(value: string): boolean {
  try {
    const url = new URL(value);
    const direct = url.hostname === `db.${STAGING_HOST}`;
    const pooler = url.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(url.username) === `postgres.${STAGING_REF}`;
    return ["postgres:", "postgresql:"].includes(url.protocol) &&
      (direct || pooler);
  } catch {
    return false;
  }
}

function isStagingKey(
  value: string | undefined,
  role: "anon" | "service_role"
): boolean {
  if (!value || value !== value.trim()) return false;
  const opaquePrefix = role === "anon" ? "sb_publishable_" : "sb_secret_";
  if (value.startsWith(opaquePrefix) && value.length > opaquePrefix.length) {
    // Opaque keys cannot expose a project ref; the exact URL remains mandatory.
    return true;
  }
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return false;
  }
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof claims === "object" && claims !== null &&
      "ref" in claims && claims.ref === STAGING_REF &&
      "role" in claims && claims.role === role;
  } catch {
    return false;
  }
}

/** Fail before build-time application evaluation; never print environment values. */
export function assertP03PreviewSafety(
  environment: PreviewEnvironment = process.env
): void {
  if (environment.VERCEL_ENV !== "preview" ||
    environment.VERCEL_GIT_COMMIT_REF !== CANDIDATE_BRANCH) return;

  const failures: string[] = [];
  if (!isStagingOrigin(environment.NEXT_PUBLIC_SUPABASE_URL)) {
    failures.push("NEXT_PUBLIC_SUPABASE_URL must identify the approved Staging origin");
  }
  if (!/^pk_test_[A-Za-z0-9_=\-]+$/.test(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "")) {
    failures.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use Clerk test mode");
  }
  if (!/^sk_test_[A-Za-z0-9_\-]+$/.test(environment.CLERK_SECRET_KEY ?? "")) {
    failures.push("CLERK_SECRET_KEY must use Clerk test mode");
  }
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isStagingKey(publishableKey, "anon")) {
    failures.push("The effective Supabase public key must be present and its JWT identity must match Staging");
  }
  if (!isStagingKey(environment.SUPABASE_SERVICE_ROLE_KEY, "service_role")) {
    failures.push("SUPABASE_SERVICE_ROLE_KEY must be present and its JWT identity must match Staging");
  }
  if (Object.values(environment).some((value) => value?.includes(PRODUCTION_REF))) {
    failures.push("A Production Supabase project reference is present");
  }
  for (const key of DIRECT_DATABASE_URLS) {
    const value = environment[key];
    if (value && !isStagingDatabase(value)) {
      failures.push(`${key} must be absent or identify the approved Staging database`);
    }
  }
  const emailMode = environment.TRANSACTIONAL_EMAIL_MODE;
  if (emailMode && emailMode !== "disabled") {
    failures.push("TRANSACTIONAL_EMAIL_MODE must be absent or disabled");
  }
  for (const key of OUTBOUND_CREDENTIALS) {
    if (environment[key]?.trim()) failures.push(`${key} must be absent in this candidate Preview`);
  }
  // Layout and the reporting loader already require VERCEL_ENV=production
  // before using analytics. No additional public analytics flag is introduced.
  if (failures.length) {
    throw new Error(`P03 Preview isolation check failed: ${failures.join("; ")}.`);
  }
}
