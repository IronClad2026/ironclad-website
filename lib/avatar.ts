// Keep Server Action avatar uploads within the hosting request-body boundary.
// The Storage bucket can remain broader because this is the application limit.
export const MAX_AVATAR_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_AVATAR_UPLOAD_SIZE_LABEL = "4 MiB";

export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Shared upload/proxy signature check; this is not a complete image decoder. */
export function hasValidImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (contentType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

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
