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
import { isPlayerProfileComplete } from "@/lib/player-profile";
import { supabaseUrl } from "@/lib/supabase-config";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

type ValidatedProfile = {
  display_name: string;
  in_game_name: string;
  discord_username: string;
  steam_username: string;
  coh3_player_card_url: string;
  country: string;
  region: string;
  timezone: string;
  current_elo: number;
  bio: string | null;
};

const AVATAR_BUCKET = "player-avatars";
const ALLOWED_AVATAR_TYPES = new Set<string>(ALLOWED_AVATAR_MIME_TYPES);

export async function savePlayerProfile(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const { getToken, userId } = await auth();

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
    .select("id, avatar_url")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existingProfileError) {
    console.error("Existing player avatar lookup error:", existingProfileError);

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
    const sessionToken = await getToken();
    const uploadContext = {
      projectHost: new URL(supabaseUrl).host,
      bucket: AVATAR_BUCKET,
      objectPath: avatarPath,
      fullStoragePath: `${AVATAR_BUCKET}/${avatarPath}`,
      clerkUserId: userId,
      hasSessionToken: Boolean(sessionToken),
      sessionTokenLength: sessionToken?.length ?? 0,
      fileName: avatar.name,
      contentType: avatar.type,
      fileSize: avatar.size,
      validationPassed: true,
      upsert: true,
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
      const storageError = serializeStorageError(uploadError);

      console.error("Player avatar upload failed:", {
        ...uploadContext,
        storageError,
      });

      return {
        status: "error",
        message:
          "Your avatar could not be uploaded. Check the image and try again.",
        errors: { avatar: getAvatarUploadErrorMessage(storageError) },
      };
    }

    console.info("Player avatar upload succeeded:", {
      bucket: AVATAR_BUCKET,
      objectPath: avatarPath,
      clerkUserId: userId,
    });

    avatarUrl = getPlayerAvatarProxyUrl(playerId, Date.now());
  }

  const finalAvatarUrl = avatarUrl ?? existingProfile?.avatar_url ?? null;
  const profileCompleted = isPlayerProfileComplete({
    ...validation.data,
    avatar_url: finalAvatarUrl,
  });
  const { error } = await supabase.from("players").upsert(
    {
      id: playerId,
      clerk_user_id: userId,
      ...validation.data,
      profile_completed: profileCompleted,
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

type SerializedStorageError = {
  name: string;
  message: string;
  status?: number | string;
  statusCode?: number | string;
  error?: string;
  cause?: string;
};

function serializeStorageError(error: unknown): SerializedStorageError {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownStorageError",
      message:
        typeof error === "string" ? error : JSON.stringify(error ?? null),
    };
  }

  const storageError = error as Error & {
    status?: number | string;
    statusCode?: number | string;
    error?: string;
    cause?: unknown;
  };

  return {
    name: storageError.name,
    message: storageError.message,
    status: storageError.status,
    statusCode: storageError.statusCode,
    error: storageError.error,
    cause:
      storageError.cause instanceof Error
        ? storageError.cause.message
        : storageError.cause
          ? String(storageError.cause)
          : undefined,
  };
}

function getAvatarUploadErrorMessage(error: SerializedStorageError) {
  const details = `${error.message} ${error.error ?? ""}`.toLowerCase();

  if (details.includes("bucket") && details.includes("not found")) {
    return 'Storage bucket "player-avatars" was not found.';
  }

  if (
    details.includes("row-level security") ||
    details.includes("policy") ||
    error.status === 403 ||
    error.statusCode === 403
  ) {
    return "Storage permission denied. Check the player-avatars RLS policies.";
  }

  if (
    details.includes("jwt") ||
    details.includes("unauthorized") ||
    error.status === 401 ||
    error.statusCode === 401
  ) {
    return "Supabase did not accept the authenticated Clerk session.";
  }

  return `Avatar upload failed: ${error.message}`;
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
    steamUsername: getValue(formData, "steamUsername"),
    coh3PlayerCardUrl: getValue(formData, "coh3PlayerCardUrl"),
    country: getValue(formData, "country"),
    region: getValue(formData, "region"),
    timezone: getValue(formData, "timezone"),
    currentElo: getValue(formData, "currentElo"),
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
  requireText(
    errors,
    "steamUsername",
    values.steamUsername,
    "Steam username",
    100
  );
  requireText(errors, "country", values.country, "Country", 100);
  requireText(errors, "region", values.region, "Region", 100);
  requireText(errors, "timezone", values.timezone, "Timezone", 100);

  if (!values.coh3PlayerCardUrl) {
    errors.coh3PlayerCardUrl = "CoH3 Player Card URL is required.";
  } else if (
    values.coh3PlayerCardUrl.length > 500 ||
    !isHttpUrl(values.coh3PlayerCardUrl)
  ) {
    errors.coh3PlayerCardUrl = "Enter a valid HTTP or HTTPS URL.";
  }

  const currentElo = Number(values.currentElo);

  if (
    !values.currentElo ||
    !Number.isInteger(currentElo) ||
    currentElo < 0 ||
    currentElo > 5000
  ) {
    errors.currentElo = "Current ELO must be a whole number from 0 to 5000.";
  }

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
      steam_username: values.steamUsername,
      coh3_player_card_url: values.coh3PlayerCardUrl,
      country: values.country,
      region: values.region,
      timezone: values.timezone,
      current_elo: currentElo,
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
