/** Shared, credential-free resource boundary for the app and media Worker. */
export const PRODUCTION_HIGHLIGHTS_SUPABASE_ORIGIN = "https://nsyjtqpvyxlzyujlbzos.supabase.co";
const productionAppOrigins = new Set([
  "https://ironcladtournaments.com",
  "https://www.ironcladtournaments.com",
]);

export function exactOrigin(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    return value === url.origin && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

export function loopbackOrigin(value: string | undefined): boolean {
  const origin = exactOrigin(value);
  if (!origin) return false;
  const url = new URL(origin);
  return ["http:", "https:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

export function productionMediaOrigin(value: string | undefined): boolean {
  const origin = exactOrigin(value);
  if (!origin) return false;
  const url = new URL(origin);
  return url.protocol === "https:" && !url.port && (
    ["media.ironcladtournaments.com", "highlights.ironcladtournaments.com"].includes(url.hostname) ||
    /^ironclad-production-combat-highlights\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)
  );
}

export function allowedHighlightOrigins(value: string | undefined, deployment: "production" | "local"): string[] | null {
  if (!value) return null;
  const origins = value.split(",").map((part) => part.trim());
  if (origins.length === 0 || new Set(origins).size !== origins.length ||
      origins.some((origin) => !exactOrigin(origin) ||
        (deployment === "production" ? !productionAppOrigins.has(origin) : !loopbackOrigin(origin)))) return null;
  return origins;
}

export function signingJwk(value: string | undefined, privateKey: boolean): boolean {
  if (!value) return false;
  try {
    const key: unknown = JSON.parse(value);
    if (typeof key !== "object" || key === null || Array.isArray(key)) return false;
    const jwk = key as Record<string, unknown>;
    return jwk.kty === "EC" && jwk.crv === "P-256" &&
      typeof jwk.x === "string" && /^[A-Za-z0-9_-]{43}$/.test(jwk.x) &&
      typeof jwk.y === "string" && /^[A-Za-z0-9_-]{43}$/.test(jwk.y) &&
      (privateKey ? typeof jwk.d === "string" && /^[A-Za-z0-9_-]{43}$/.test(jwk.d) : jwk.d === undefined);
  } catch { return false; }
}
