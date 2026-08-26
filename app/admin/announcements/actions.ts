"use server";

import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_MEDIA_BUCKET,
  ANNOUNCEMENT_MEDIA_MIME_TYPES,
  buildAnnouncementMediaPublicUrl,
  createAnnouncementMediaPath,
  getAnnouncementMediaExtension,
  hasAnnouncementMediaSignature,
  isUuid,
  parseAnnouncementMediaPath,
  type AnnouncementMediaMimeType,
} from "@/lib/announcement-contract";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: { role?: string };
};

export type AnnouncementMediaUploadAuthorization = {
  bucket: typeof ANNOUNCEMENT_MEDIA_BUCKET;
  path: string;
  token: string;
  publicUrl: string;
};

export type AnnouncementPublishInput = {
  title: string;
  body: string;
  mediaPath: string | null;
  mediaDescription: string | null;
};

export type AnnouncementPublishResult =
  | { ok: true; announcementId: string; publishedAt: string }
  | { ok: false; message: string };

export type AnnouncementWithdrawResult =
  | { ok: true; mediaCleanupWarning: boolean }
  | { ok: false; message: string };

const invalidMediaMessage =
  "Choose one JPG, JPEG, PNG, or WEBP image up to 10 MiB, or one MP4 or WEBM video up to 50 MiB.";
const publishFailedMessage =
  "The announcement could not be published. Any uploaded media was safely retired where possible. Try again.";

export async function createAnnouncementMediaUpload(input: {
  fileName: string;
  contentType: string;
  size: number;
}): Promise<AnnouncementMediaUploadAuthorization> {
  await requireAdmin();

  const extension = getAnnouncementMediaExtension(input);
  if (!extension) throw new Error(invalidMediaMessage);

  const path = createAnnouncementMediaPath(extension, randomUUID());
  if (!path) throw new Error("Unable to prepare the media upload. Try again.");

  const client = createSupabaseAdminClient();
  await verifyAnnouncementMediaBucket(client);
  const { data, error } = await client.storage
    .from(ANNOUNCEMENT_MEDIA_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (
    error ||
    !data ||
    data.path !== path ||
    typeof data.token !== "string" ||
    !data.token
  ) {
    logAnnouncementAdminFailure("authorize-upload", error);
    throw new Error("Unable to prepare the media upload. Try again.");
  }

  const publicUrl = buildAnnouncementMediaPublicUrl(path);
  if (!publicUrl) {
    logAnnouncementAdminFailure("build-public-url");
    throw new Error("Unable to prepare the media upload. Try again.");
  }

  return {
    bucket: ANNOUNCEMENT_MEDIA_BUCKET,
    path,
    token: data.token,
    publicUrl,
  };
}

export async function discardAnnouncementMediaUpload(path: string) {
  await requireAdmin();
  const media = parseAnnouncementMediaPath(path);
  if (!media) return { deleted: false };

  const client = createSupabaseAdminClient();
  try {
    if (await isAnnouncementMediaReferenced(client, media.path)) {
      return { deleted: false };
    }
    return {
      deleted: await removeAnnouncementMediaObject(client, media.path),
    };
  } catch {
    logAnnouncementAdminFailure("discard-upload");
    return { deleted: false };
  }
}

export async function publishAnnouncement(
  input: AnnouncementPublishInput
): Promise<AnnouncementPublishResult> {
  const { userId } = await requireAdmin();
  const parsed = parsePublishInput(input);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const client = createSupabaseAdminClient();
  const media = parsed.mediaPath
    ? parseAnnouncementMediaPath(parsed.mediaPath)
    : null;

  if (parsed.mediaPath && !media) {
    return { ok: false, message: invalidMediaMessage };
  }

  if (media) {
    try {
      await verifyAnnouncementMediaBucket(client);
      if (
        (await isAnnouncementMediaReferenced(client, media.path)) ||
        !(await isVerifiedAnnouncementMedia(client, media))
      ) {
        await cleanupFailedPublicationMedia(client, media.path);
        return { ok: false, message: invalidMediaMessage };
      }
    } catch {
      await cleanupFailedPublicationMedia(client, media.path);
      logAnnouncementAdminFailure("verify-publication-media");
      return { ok: false, message: publishFailedMessage };
    }
  }

  try {
    const { data, error } = await client.rpc("publish_official_announcement", {
      p_title: parsed.title,
      p_body: parsed.body,
      p_media_kind: media?.kind ?? null,
      p_media_path: media?.path ?? null,
      p_media_mime_type: media?.mimeType ?? null,
      p_media_description: media ? parsed.mediaDescription : null,
      p_actor_clerk_user_id: userId,
    });
    const publication = error ? null : parsePublicationResult(data);
    if (!publication) {
      logAnnouncementAdminFailure("publish", error);
      if (media) await cleanupFailedPublicationMedia(client, media.path);
      return { ok: false, message: publishFailedMessage };
    }

    revalidateAnnouncementPaths();
    return { ok: true, ...publication };
  } catch {
    logAnnouncementAdminFailure("publish");
    if (media) await cleanupFailedPublicationMedia(client, media.path);
    return { ok: false, message: publishFailedMessage };
  }
}

export async function withdrawAnnouncement(
  announcementId: string
): Promise<AnnouncementWithdrawResult> {
  const { userId } = await requireAdmin();
  if (!isUuid(announcementId)) {
    return { ok: false, message: "The announcement could not be withdrawn." };
  }

  const client = createSupabaseAdminClient();
  try {
    const { data, error } = await client.rpc(
      "withdraw_official_announcement",
      {
        p_announcement_id: announcementId,
        p_actor_clerk_user_id: userId,
      }
    );
    const withdrawal = error ? null : parseWithdrawalResult(data);
    if (!withdrawal?.withdrawn) {
      logAnnouncementAdminFailure("withdraw", error);
      return { ok: false, message: "The announcement could not be withdrawn." };
    }

    revalidateAnnouncementPaths();
    let mediaCleanupWarning = false;
    if (withdrawal.mediaPath) {
      mediaCleanupWarning = !(await removeAnnouncementMediaObject(
        client,
        withdrawal.mediaPath
      ));
      if (mediaCleanupWarning) {
        logAnnouncementAdminFailure("withdraw-media-cleanup");
      }
    }

    return { ok: true, mediaCleanupWarning };
  } catch {
    logAnnouncementAdminFailure("withdraw");
    return { ok: false, message: "The announcement could not be withdrawn." };
  }
}

async function requireAdmin() {
  const identity = await auth();
  const role = (identity.sessionClaims as CustomClaims | null)?.metadata?.role;
  if (!identity.userId || role !== "admin") throw new Error("Unauthorized");
  return { userId: identity.userId };
}

function parsePublishInput(input: AnnouncementPublishInput):
  | {
      ok: true;
      title: string;
      body: string;
      mediaPath: string | null;
      mediaDescription: string | null;
    }
  | { ok: false; message: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "Enter a title and message." };
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const mediaPath = typeof input.mediaPath === "string" && input.mediaPath
    ? input.mediaPath
    : null;
  const mediaDescription = typeof input.mediaDescription === "string" &&
      input.mediaDescription.trim()
    ? input.mediaDescription.trim()
    : null;

  if (!title || !body) {
    return { ok: false, message: "Enter a title and message." };
  }
  if (title.length > ANNOUNCEMENT_LIMITS.title) {
    return { ok: false, message: "Title must be 160 characters or fewer." };
  }
  if (body.length > ANNOUNCEMENT_LIMITS.body) {
    return { ok: false, message: "Message must be 10,000 characters or fewer." };
  }
  if (
    mediaDescription &&
    mediaDescription.length > ANNOUNCEMENT_LIMITS.mediaDescription
  ) {
    return {
      ok: false,
      message: "Media description must be 500 characters or fewer.",
    };
  }
  if ((mediaPath === null) !== (mediaDescription === null)) {
    return {
      ok: false,
      message: "Add a concise accessibility description for the selected media.",
    };
  }

  return { ok: true, title, body, mediaPath, mediaDescription };
}

async function verifyAnnouncementMediaBucket(
  client: ReturnType<typeof createSupabaseAdminClient>
) {
  try {
    const { data: bucket, error } = await client.storage.getBucket(
      ANNOUNCEMENT_MEDIA_BUCKET
    );
    const allowed = [...(bucket?.allowed_mime_types ?? [])].sort();
    const expected = [...ANNOUNCEMENT_MEDIA_MIME_TYPES].sort();
    if (
      !error &&
      bucket?.id === ANNOUNCEMENT_MEDIA_BUCKET &&
      bucket.public === true &&
      Number(bucket.file_size_limit) === ANNOUNCEMENT_LIMITS.videoBytes &&
      allowed.length === expected.length &&
      expected.every((mimeType, index) => allowed[index] === mimeType)
    ) {
      return;
    }
  } catch {}

  logAnnouncementAdminFailure("bucket-configuration");
  throw new Error("Announcement media storage is not configured.");
}

async function isVerifiedAnnouncementMedia(
  client: ReturnType<typeof createSupabaseAdminClient>,
  media: NonNullable<ReturnType<typeof parseAnnouncementMediaPath>>
) {
  try {
    const fileName = media.path.slice("media/".length);
    const { data, error } = await client.storage
      .from(ANNOUNCEMENT_MEDIA_BUCKET)
      .list("media", { limit: 1, search: fileName });
    const object = data?.find((item) => item.name === fileName);
    const size = Number(object?.metadata?.size);
    const mimeType = String(object?.metadata?.mimetype ?? "");
    const limit = media.kind === "image"
      ? ANNOUNCEMENT_LIMITS.imageBytes
      : ANNOUNCEMENT_LIMITS.videoBytes;

    if (
      error ||
      !object ||
      mimeType !== media.mimeType ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > limit
    ) {
      return false;
    }

    const publicUrl = buildAnnouncementMediaPublicUrl(media.path);
    if (!publicUrl) return false;
    const response = await fetch(publicUrl, {
      headers: { Range: "bytes=0-31" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;

    const bytes = await readHeader(response, 32);
    return hasAnnouncementMediaSignature(
      bytes,
      media.mimeType as AnnouncementMediaMimeType
    );
  } catch {
    return false;
  }
}

async function readHeader(response: Response, maximumBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: number[] = [];
  while (chunks.length < maximumBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(...value.slice(0, maximumBytes - chunks.length));
  }
  await reader.cancel();
  return Uint8Array.from(chunks);
}

async function isAnnouncementMediaReferenced(
  client: ReturnType<typeof createSupabaseAdminClient>,
  path: string
) {
  const { data, error } = await client
    .from("announcements")
    .select("id")
    .eq("media_path", path)
    .limit(1);
  if (error || !Array.isArray(data)) {
    throw new Error("Announcement media reference check failed.");
  }
  return data.length > 0;
}

async function cleanupFailedPublicationMedia(
  client: ReturnType<typeof createSupabaseAdminClient>,
  path: string
) {
  try {
    if (await isAnnouncementMediaReferenced(client, path)) return;
    await removeAnnouncementMediaObject(client, path);
  } catch {
    logAnnouncementAdminFailure("publication-media-cleanup");
  }
}

async function removeAnnouncementMediaObject(
  client: ReturnType<typeof createSupabaseAdminClient>,
  path: string
) {
  const media = parseAnnouncementMediaPath(path);
  if (!media) return false;
  try {
    const bucket = client.storage.from(ANNOUNCEMENT_MEDIA_BUCKET);
    const { error } = await bucket.remove([media.path]);
    if (error) return false;

    const fileName = media.path.slice("media/".length);
    const verification = await bucket.list("media", {
      limit: 1,
      search: fileName,
    });
    return !verification.error &&
      Array.isArray(verification.data) &&
      !verification.data.some((item) => item.name === fileName);
  } catch {
    return false;
  }
}

function parsePublicationResult(value: unknown) {
  if (!isRecord(value) || !isUuid(value.id) || !isTimestamp(value.published_at)) {
    return null;
  }
  return {
    announcementId: value.id,
    publishedAt: new Date(value.published_at).toISOString(),
  };
}

function parseWithdrawalResult(value: unknown) {
  if (!isRecord(value) || typeof value.withdrawn !== "boolean") return null;
  if (!value.withdrawn) return { withdrawn: false, mediaPath: null };
  if (!isTimestamp(value.withdrawn_at)) return null;
  const mediaPath = value.media_path === null
    ? null
    : typeof value.media_path === "string" &&
        parseAnnouncementMediaPath(value.media_path)
      ? value.media_path
      : undefined;
  return mediaPath === undefined
    ? null
    : { withdrawn: true, mediaPath };
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revalidateAnnouncementPaths() {
  revalidatePath("/announcements");
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
}

function logAnnouncementAdminFailure(operation: string, error?: unknown) {
  const candidateCode = isRecord(error) && typeof error.code === "string"
    ? error.code.toUpperCase()
    : "";
  console.error("Official Announcements Admin operation failed.", {
    operation,
    code: /^[A-Z0-9_]{3,64}$/.test(candidateCode)
      ? candidateCode
      : "ANNOUNCEMENT_ADMIN_FAILED",
  });
}
