import "server-only";
import { allowedHighlightOrigins, loopbackOrigin, productionMediaOrigin, PRODUCTION_HIGHLIGHTS_SUPABASE_ORIGIN, signingJwk } from "./environment";

type Environment = Readonly<Record<string, string | undefined>>;

/** Provisioning and enablement are separate: missing or mismatched resources remain OFF. */
export function mediaConfiguration(environment: Environment = process.env) {
  if (environment.COMBAT_HIGHLIGHTS_ENABLED !== "true" ||
      !signingJwk(environment.COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK, true)) return null;
  const deployment = environment.COMBAT_HIGHLIGHTS_DEPLOYMENT_ENV;
  const origin = environment.COMBAT_HIGHLIGHTS_WORKER_URL;
  if (deployment === "production") {
    if (environment.VERCEL_ENV !== "production" ||
        environment.NEXT_PUBLIC_SUPABASE_URL !== PRODUCTION_HIGHLIGHTS_SUPABASE_ORIGIN ||
        !productionMediaOrigin(origin)) return null;
  } else if (deployment === "local") {
    // Synthetic validation only. A hosted environment can never select this path.
    if (environment.VERCEL_ENV || environment.NODE_ENV === "production" ||
        !loopbackOrigin(environment.NEXT_PUBLIC_SUPABASE_URL) || !loopbackOrigin(origin)) return null;
  } else return null;
  const allowedOrigins = allowedHighlightOrigins(environment.COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS, deployment);
  return origin && allowedOrigins ? { origin, allowedOrigins } : null;
}
