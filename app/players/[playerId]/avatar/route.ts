import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const AVATAR_BUCKET = "player-avatars";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CustomClaims = {
  metadata?: {
    role?: string;
  };
};
const FALLBACK_AVATAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="IronClad player avatar">
  <defs>
    <radialGradient id="ember" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#fb923c"/>
      <stop offset="45%" stop-color="#431407"/>
      <stop offset="100%" stop-color="#030712"/>
    </radialGradient>
    <linearGradient id="shield" x1="50%" x2="50%" y1="22%" y2="86%">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#7c2d12"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="#020617"/>
  <rect x="12" y="12" width="232" height="232" rx="48" fill="url(#ember)" stroke="#fb923c" stroke-opacity=".36" stroke-width="3"/>
  <path d="M128 48 184 70v48c0 38-21 70-56 90-35-20-56-52-56-90V70l56-22Z" fill="url(#shield)" stroke="#fed7aa" stroke-opacity=".48" stroke-width="4"/>
  <path d="M104 92h48v19h-13v50h13v19h-48v-19h13v-50h-13V92Z" fill="#fff7ed"/>
  <circle cx="128" cy="128" r="86" fill="none" stroke="#fdba74" stroke-opacity=".22" stroke-width="8"/>
</svg>`.trim();

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await params;

  if (!UUID_PATTERN.test(playerId)) {
    return createFallbackAvatarResponse();
  }

  const supabase = createSupabaseAdminClient();
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("clerk_user_id, avatar_url, public_profile_enabled")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError) {
    console.error("Public player avatar lookup failed:", playerError);
    return createFallbackAvatarResponse();
  }

  if (!player?.avatar_url || !player.clerk_user_id) {
    return createFallbackAvatarResponse();
  }

  let canReadAvatar = player.public_profile_enabled;

  if (!canReadAvatar) {
    const { userId, sessionClaims } = await auth();
    const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
    canReadAvatar = player.clerk_user_id === userId || role === "admin";
  }

  if (!canReadAvatar) {
    return createFallbackAvatarResponse("private, no-store");
  }

  const { data: avatar, error: avatarError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .download(`${player.clerk_user_id}/avatar`);

  if (avatarError || !avatar) {
    return createFallbackAvatarResponse();
  }

  return new Response(avatar, {
    headers: {
      "Cache-Control": player.public_profile_enabled
        ? "public, max-age=300, stale-while-revalidate=86400"
        : "private, max-age=300",
      "Content-Type": avatar.type || "application/octet-stream",
    },
  });
}

function createFallbackAvatarResponse(
  cacheControl = "public, max-age=3600, stale-while-revalidate=86400"
) {
  return new Response(FALLBACK_AVATAR_SVG, {
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
