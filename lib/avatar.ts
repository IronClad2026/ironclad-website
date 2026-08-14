// Keep Server Action avatar uploads within the hosting request-body boundary.
// The Storage bucket can remain broader because this is the application limit.
export const MAX_AVATAR_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_AVATAR_UPLOAD_SIZE_LABEL = "4 MiB";

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
