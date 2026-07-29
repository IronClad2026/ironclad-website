import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseUrl } from "@/lib/supabase-config";

export const TOURNAMENT_BANNER_BUCKET = "tournament-banners";
export const MAX_TOURNAMENT_BANNER_BYTES = 10 * 1024 * 1024;
export const TOURNAMENT_BANNER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type TournamentBannerMimeType =
  (typeof TOURNAMENT_BANNER_MIME_TYPES)[number];

type TournamentBannerExtension = "jpg" | "png" | "webp";

export type TournamentBannerAsset = {
  extension: TournamentBannerExtension;
  mimeType: TournamentBannerMimeType;
  path: string;
  publicUrl: string;
};

const extensionByMimeType: Record<
  TournamentBannerMimeType,
  TournamentBannerExtension
> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const mimeTypeByExtension: Record<
  TournamentBannerExtension,
  TournamentBannerMimeType
> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const tournamentBannerPathPattern =
  /^banners\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const tournamentBannerPublicUrlPrefix =
  `${supabaseUrl}/storage/v1/object/public/${TOURNAMENT_BANNER_BUCKET}/`;

export function getTournamentBannerExtension(input: {
  fileName: string;
  contentType: string;
  size: number;
}) {
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > MAX_TOURNAMENT_BANNER_BYTES
  ) {
    return null;
  }

  if (
    !TOURNAMENT_BANNER_MIME_TYPES.includes(
      input.contentType as TournamentBannerMimeType
    )
  ) {
    return null;
  }

  const mimeType = input.contentType as TournamentBannerMimeType;
  const suppliedExtension = input.fileName.match(/\.([a-z0-9]+)$/i)?.[1];
  const validExtensions =
    mimeType === "image/jpeg" ? ["jpg", "jpeg"] : [extensionByMimeType[mimeType]];

  return suppliedExtension &&
    validExtensions.includes(suppliedExtension.toLowerCase())
    ? extensionByMimeType[mimeType]
    : null;
}

export function createTournamentBannerPath(
  extension: TournamentBannerExtension
) {
  return `banners/${randomUUID()}.${extension}`;
}

export function parseTournamentBannerPath(path: string) {
  const match = tournamentBannerPathPattern.exec(path);
  if (!match) return null;

  const extension = match[1] as TournamentBannerExtension;
  return {
    extension,
    mimeType: mimeTypeByExtension[extension],
    path,
  };
}

export function buildTournamentBannerPublicUrl(path: string) {
  return parseTournamentBannerPath(path)
    ? `${tournamentBannerPublicUrlPrefix}${path}`
    : null;
}

export function parseTournamentBannerPublicUrl(
  publicUrl: string
): TournamentBannerAsset | null {
  if (!publicUrl.startsWith(tournamentBannerPublicUrlPrefix)) return null;

  const path = publicUrl.slice(tournamentBannerPublicUrlPrefix.length);
  const parsedPath = parseTournamentBannerPath(path);
  if (!parsedPath) return null;

  const canonicalUrl = buildTournamentBannerPublicUrl(path);
  if (canonicalUrl !== publicUrl) return null;

  return {
    ...parsedPath,
    publicUrl: canonicalUrl,
  };
}

export function hasTournamentBannerSignature(
  bytes: Uint8Array,
  mimeType: TournamentBannerMimeType
) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}
