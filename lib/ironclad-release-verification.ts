import { IRONCLAD_PRODUCTION_SUPABASE, isVerifiedIronCladProduction } from "./ironclad-release-environment";

type Environment = Readonly<Record<string, string | undefined>>;

/** Read-only credential binding checks run when the Production build opts in. */
export async function verifyProductionFeatureCredentials(environment: Environment = process.env, request = fetch): Promise<void> {
  if (environment.VERCEL_ENV !== "production" ||
    (environment.CASTER_PROGRAM_ENABLED !== "true" && environment.READY_PROGRAM_ENABLED !== "true")) return;

  const failure = new Error("IronClad could not verify the Production Clerk and Supabase credential bindings.");
  if (!isVerifiedIronCladProduction(environment)) throw failure;

  const supabase = `https://${IRONCLAD_PRODUCTION_SUPABASE}.supabase.co/rest/v1/tournaments?select=id&limit=0`;
  const publicKey = (environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY!;
  const clerkHeaders = { Authorization: `Bearer ${environment.CLERK_SECRET_KEY}` };
  const signal = AbortSignal.timeout(8_000);
  const options = { redirect: "error", signal } as const;

  try {
    const [publicRead, serviceRead, instanceRead, domainsRead] = await Promise.all([
      request(supabase, { ...options, headers: { apikey: publicKey } }),
      request(supabase, { ...options, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }),
      request("https://api.clerk.com/v1/instance", { ...options, headers: clerkHeaders }),
      request("https://api.clerk.com/v1/domains", { ...options, headers: clerkHeaders }),
    ]);
    if (![publicRead, serviceRead, instanceRead, domainsRead].every((response) => response.ok)) throw failure;
    const [instance, domains] = await Promise.all([instanceRead.json(), domainsRead.json()]);
    if (instance?.environment_type !== "production" || !Array.isArray(domains?.data) ||
      !domains.data.some((domain: { is_satellite?: boolean; frontend_api_url?: string }) =>
        domain.is_satellite === false && new URL(domain.frontend_api_url ?? "https://invalid.invalid").origin === "https://clerk.ironcladtournaments.com")) throw failure;
  } catch {
    throw failure;
  }
}
