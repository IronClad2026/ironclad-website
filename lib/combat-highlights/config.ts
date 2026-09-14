import "server-only";

export const STAGING_MEDIA_ORIGIN = "https://ironclad-staging-combat-highlights.ironclad-website.workers.dev";
export function mediaConfiguration() {
  if (process.env.VERCEL_ENV === "production" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://zzbnneprhjicmajpjkdg.supabase.co" || process.env.COMBAT_HIGHLIGHTS_WORKER_URL !== STAGING_MEDIA_ORIGIN) return null;
  return { origin: STAGING_MEDIA_ORIGIN, allowedOrigins: (process.env.COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS ?? "").split(",").map((v) => v.trim()).filter(Boolean) };
}
