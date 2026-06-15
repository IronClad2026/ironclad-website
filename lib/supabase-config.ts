const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!configuredSupabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!configuredSupabasePublishableKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

let parsedSupabaseUrl: URL;

try {
  parsedSupabaseUrl = new URL(configuredSupabaseUrl);
} catch {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
}

if (!["http:", "https:"].includes(parsedSupabaseUrl.protocol)) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.");
}

// createClient appends API paths itself. Preserve reverse-proxy path prefixes,
// but remove an accidentally copied REST endpoint and trailing slashes.
const normalizedSupabasePath = parsedSupabaseUrl.pathname
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/+$/, "");

export const supabaseUrl = `${parsedSupabaseUrl.origin}${normalizedSupabasePath}`;
export const supabasePublishableKey = configuredSupabasePublishableKey;
