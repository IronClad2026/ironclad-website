import "server-only";

import sharp from "sharp";
import { CASTER_APPLICATION_LIMITS as limits, type CasterMediaKind } from "./application";

const fileFormats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;
const dimensions = {
  avatar: { width: 1_024, height: 1_024 },
  banner: { width: 1_920, height: 1_280 },
  gallery: { width: 1_920, height: 1_920 },
};

export function isCasterMediaKind(value: unknown): value is CasterMediaKind {
  return value === "avatar" || value === "banner" || value === "gallery";
}

export type CasterMediaRecord = {
  id: string;
  kind: CasterMediaKind;
  object_path: string;
  content_type: "image/webp";
  size: number;
  state: string;
};

export type CasterMediaResult = { status: string; media?: CasterMediaRecord };

export async function optimizeCasterImage(file: File, kind: CasterMediaKind): Promise<Buffer | null> {
  const expected = fileFormats[file.type as keyof typeof fileFormats];
  const maxBytes = kind === "avatar" ? limits.avatar : kind === "banner" ? limits.banner : limits.galleryImage;
  if (!Object.hasOwn(fileFormats, file.type) || !expected || file.size === 0 || file.size > maxBytes) return null;

  try {
    const decoder = sharp(Buffer.from(await file.arrayBuffer()), {
      failOn: "warning", limitInputPixels: 20_000_000, sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    if (metadata.format !== expected || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height) return null;

    const image = await decoder.autoOrient()
      .resize({ ...dimensions[kind], fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 }).toBuffer();
    return image.length > 0 && image.length <= maxBytes ? image : null;
  } catch {
    return null;
  }
}
