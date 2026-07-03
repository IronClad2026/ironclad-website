// Keep Server Action uploads deploy-safe; the bucket remains 50 MB for a
// future direct-to-Supabase upload flow that avoids platform payload limits.
export const MAX_AVATAR_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_UPLOAD_SIZE_LABEL = "10 MB";

export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type PlayerAvatarReference = {
  id: string | null;
  avatar_url: string | null;
};

export function getPlayerAvatarProxyUrl(
  playerId: string,
  cacheBuster?: number | string
) {
  const path = `/players/${playerId}/avatar`;

  return cacheBuster
    ? `${path}?v=${encodeURIComponent(String(cacheBuster))}`
    : path;
}

export function getPlayerAvatarDisplayUrl(
  player: PlayerAvatarReference | null | undefined
) {
  const avatarReference = player?.avatar_url?.trim();
  const playerId = player?.id?.trim();

  if (!avatarReference || !playerId) {
    return null;
  }

  const proxyPath = getPlayerAvatarProxyUrl(playerId);

  if (
    avatarReference === proxyPath ||
    avatarReference.startsWith(`${proxyPath}?`)
  ) {
    return avatarReference;
  }

  return proxyPath;
}
