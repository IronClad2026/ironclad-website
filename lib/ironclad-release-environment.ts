type Environment = Readonly<Record<string, string | undefined>>;

export const IRONCLAD_VERCEL_PROJECT = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
export const IRONCLAD_PRODUCTION_ORIGIN = "https://www.ironcladtournaments.com";
export const IRONCLAD_PRODUCTION_SUPABASE = "nsyjtqpvyxlzyujlbzos";

export function hasSupabaseServiceIdentity(key: string | undefined, ref: string): boolean {
  return hasJwtIdentity(key, ref, "service_role");
}

function hasJwtIdentity(key: string | undefined, ref: string, role: string): boolean {
  const parts = key?.split(".");
  if (parts?.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === role && payload.ref === ref;
  } catch {
    return false;
  }
}

export function hasClerkFrontend(key: string | undefined, mode: "test" | "live", hostname: string): boolean {
  const prefix = `pk_${mode}_`;
  return !!key?.startsWith(prefix) && Buffer.from(key.slice(prefix.length), "base64url").toString("utf8") === `${hostname}$`;
}

export function isVerifiedIronCladProduction(environment: Environment): boolean {
  const siteHost = new URL(IRONCLAD_PRODUCTION_ORIGIN).hostname;
  const publicKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return environment.VERCEL_ENV === "production" &&
    environment.VERCEL_PROJECT_ID === IRONCLAD_VERCEL_PROJECT &&
    environment.VERCEL_PROJECT_PRODUCTION_URL === siteHost &&
    environment.IRONCLAD_PRODUCTION_IDENTITY_VERIFIED === "true" &&
    environment.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") === `https://${IRONCLAD_PRODUCTION_SUPABASE}.supabase.co` &&
    hasSupabaseServiceIdentity(environment.SUPABASE_SERVICE_ROLE_KEY, IRONCLAD_PRODUCTION_SUPABASE) &&
    (hasJwtIdentity(publicKey, IRONCLAD_PRODUCTION_SUPABASE, "anon") || /^sb_publishable_[a-zA-Z0-9_-]{16,}$/.test(publicKey ?? "")) &&
    hasClerkFrontend(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, "live", "clerk.ironcladtournaments.com") &&
    environment.CLERK_SECRET_KEY?.startsWith("sk_live_") === true;
}
