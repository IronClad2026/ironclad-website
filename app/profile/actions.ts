"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type {
  ProfileActionState,
  ProfileField,
} from "@/lib/player-profile";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  getPlayerAvatarProxyUrl,
  MAX_AVATAR_UPLOAD_SIZE_BYTES,
  MAX_AVATAR_UPLOAD_SIZE_LABEL,
} from "@/lib/avatar";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

type ValidatedProfile = {
  display_name: string;
  in_game_name: string;
  discord_username: string;
  country: string;
  region: string;
  timezone: string;
  bio: string | null;
};

const AVATAR_BUCKET = "player-avatars";
const ALLOWED_AVATAR_TYPES = new Set<string>(ALLOWED_AVATAR_MIME_TYPES);

export async function savePlayerProfile(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const { userId } = await auth();

  if (!userId) {
    return {
      status: "error",
      message: "Your session has expired. Sign in again before saving.",
      errors: {},
    };
  }

  const validation = validateProfile(formData);

  if (!validation.data) {
    return {
      status: "error",
      message: "Review the highlighted profile fields.",
      errors: validation.errors,
    };
  }

  const supabase = await createAuthenticatedSupabaseClient();
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("players")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existingProfileError) {
    console.error("Existing player profile lookup error:", existingProfileError);

    return {
      status: "error",
      message: "Your profile could not be saved. Please try again.",
      errors: {},
    };
  }

  const avatar = formData.get("avatar");
  let avatarUrl: string | undefined;
  const playerId = existingProfile?.id ?? crypto.randomUUID();

  if (avatar instanceof File && avatar.size > 0) {
    const avatarSignature = new Uint8Array(
      await avatar.slice(0, 12).arrayBuffer()
    );
    const avatarError = validateAvatar(avatar, avatarSignature);

    if (avatarError) {
      return {
        status: "error",
        message: "Review the highlighted profile fields.",
        errors: { avatar: avatarError },
      };
    }

    const avatarPath = `${userId}/avatar`;
    const uploadContext = {
      bucket: AVATAR_BUCKET,
      contentType: avatar.type,
      fileSize: avatar.size,
    };

    console.info("Player avatar upload attempt:", uploadContext);

    let uploadError: unknown;

    try {
      const result = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(avatarPath, avatar, {
          cacheControl: "3600",
          contentType: avatar.type,
          upsert: true,
        });

      uploadError = result.error;
    } catch (error) {
      uploadError = error;
    }

    if (uploadError) {
      const storageError = summarizeStorageError(uploadError);

      console.error("Player avatar upload failed:", {
        ...uploadContext,
        ...(storageError.providerStatus === null
          ? {}
          : { providerStatus: storageError.providerStatus }),
        errorCode: storageError.errorCode,
      });

      return {
        status: "error",
        message:
          "Your avatar could not be uploaded. Check the image and try again.",
        errors: { avatar: getAvatarUploadErrorMessage(storageError) },
      };
    }

    console.info("Player avatar upload succeeded:", uploadContext);

    avatarUrl = getPlayerAvatarProxyUrl(playerId, Date.now());
  }

  const { error } = await supabase.from("players").upsert(
    {
      id: playerId,
      clerk_user_id: userId,
      ...validation.data,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    },
    {
      onConflict: "clerk_user_id",
    }
  );

  if (error) {
    console.error("Player profile save error:", error);

    return {
      status: "error",
      message: "Your profile could not be saved. Please try again.",
      errors: {},
    };
  }

  revalidatePath("/profile");
  revalidatePath("/");

  return {
    status: "success",
    message: "Player profile saved successfully.",
    errors: {},
  };
}

type StorageErrorCode =
  | "STORAGE_BUCKET_NOT_FOUND"
  | "STORAGE_PERMISSION_DENIED"
  | "STORAGE_UNAUTHORIZED"
  | "STORAGE_UPLOAD_FAILED";

type StorageErrorSummary = {
  errorCode: StorageErrorCode;
  providerStatus: number | null;
};

function summarizeStorageError(error: unknown): StorageErrorSummary {
  const record = isRecord(error) ? error : null;
  const status = normalizeProviderStatus(
    record?.statusCode ?? record?.status ?? null
  );
  const details = [
    error instanceof Error ? error.message : null,
    typeof error === "string" ? error : null,
    typeof record?.message === "string" ? record.message : null,
    typeof record?.error === "string" ? record.error : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  if (details.includes("bucket") && details.includes("not found")) {
    return {
      errorCode: "STORAGE_BUCKET_NOT_FOUND",
      providerStatus: status,
    };
  }

  if (
    details.includes("row-level security") ||
    details.includes("policy") ||
    status === 403
  ) {
    return {
      errorCode: "STORAGE_PERMISSION_DENIED",
      providerStatus: status,
    };
  }

  if (
    details.includes("jwt") ||
    details.includes("unauthorized") ||
    status === 401
  ) {
    return {
      errorCode: "STORAGE_UNAUTHORIZED",
      providerStatus: status,
    };
  }

  return {
    errorCode: "STORAGE_UPLOAD_FAILED",
    providerStatus: status,
  };
}

function getAvatarUploadErrorMessage(error: StorageErrorSummary) {
  if (error.errorCode === "STORAGE_BUCKET_NOT_FOUND") {
    return 'Storage bucket "player-avatars" was not found.';
  }

  if (error.errorCode === "STORAGE_PERMISSION_DENIED") {
    return "Storage permission denied. Check the player-avatars RLS policies.";
  }

  if (error.errorCode === "STORAGE_UNAUTHORIZED") {
    return "Supabase did not accept the authenticated Clerk session.";
  }

  return "Avatar upload failed. Please try again.";
}

function normalizeProviderStatus(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{3}$/.test(value)
        ? Number(value)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599
    ? parsed
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateAvatar(file: File, bytes: Uint8Array) {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return "Use a PNG, JPG, JPEG, or WEBP image.";
  }

  if (file.size > MAX_AVATAR_UPLOAD_SIZE_BYTES) {
    return `Avatar image must be ${MAX_AVATAR_UPLOAD_SIZE_LABEL} or smaller.`;
  }

  if (!hasValidImageSignature(file.type, bytes)) {
    return "The selected file does not contain a valid supported image.";
  }

  return null;
}

function hasValidImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return pngSignature.every((byte, index) => bytes[index] === byte);
  }

  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }

  return false;
}

function validateProfile(formData: FormData): {
  data?: ValidatedProfile;
  errors: Partial<Record<ProfileField, string>>;
} {
  const values = {
    displayName: getValue(formData, "displayName"),
    inGameName: getValue(formData, "inGameName"),
    discordUsername: getValue(formData, "discordUsername"),
    country: getValue(formData, "country"),
    region: getValue(formData, "region"),
    timezone: getValue(formData, "timezone"),
    bio: getValue(formData, "bio"),
  };
  const errors: Partial<Record<ProfileField, string>> = {};

  requireText(errors, "displayName", values.displayName, "Display name", 80);
  requireText(errors, "inGameName", values.inGameName, "In-game name", 80);
  requireText(
    errors,
    "discordUsername",
    values.discordUsername,
    "Discord username",
    100
  );
  requireText(errors, "country", values.country, "Country", 100);
  requireText(errors, "region", values.region, "Region", 100);
  requireText(errors, "timezone", values.timezone, "Timezone", 100);

  if (values.bio.length > 500) {
    errors.bio = "Bio must be 500 characters or fewer.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    data: {
      display_name: values.displayName,
      in_game_name: values.inGameName,
      discord_username: values.discordUsername,
      country: values.country,
      region: values.region,
      timezone: values.timezone,
      bio: values.bio || null,
    },
    errors,
  };
}

function getValue(formData: FormData, field: ProfileField) {
  return String(formData.get(field) ?? "").trim();
}

function requireText(
  errors: Partial<Record<ProfileField, string>>,
  field: ProfileField,
  value: string,
  label: string,
  maxLength: number
) {
  if (!value) {
    errors[field] = `${label} is required.`;
  } else if (value.length > maxLength) {
    errors[field] = `${label} must be ${maxLength} characters or fewer.`;
  }
}
