import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ELO_VERIFICATION_KEY = "elo_verification";
const ELO_VERIFICATION_SUPPORT_LINK_KEY = "elo_verification_support_link";

export const DEFAULT_ELO_VERIFICATION_SUPPORT_URL =
  "https://discord.gg/ZQSQjBNRm3";

type PlatformSettingRow = {
  key: string;
  value: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by_clerk_user_id: string | null;
};

export type EloVerificationSetting = {
  enabled: boolean;
  updatedAt: string | null;
  updatedByClerkUserId: string | null;
  error: string | null;
};

export type EloVerificationSupportLinkSetting = {
  url: string;
  updatedAt: string | null;
  updatedByClerkUserId: string | null;
  error: string | null;
};

const defaultEloVerificationSetting: EloVerificationSetting = {
  enabled: false,
  updatedAt: null,
  updatedByClerkUserId: null,
  error: null,
};

const defaultEloVerificationSupportLinkSetting: EloVerificationSupportLinkSetting =
  {
    url: DEFAULT_ELO_VERIFICATION_SUPPORT_URL,
    updatedAt: null,
    updatedByClerkUserId: null,
    error: null,
  };

export async function getEloVerificationSetting(): Promise<EloVerificationSetting> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, value, updated_at, updated_by_clerk_user_id")
    .eq("key", ELO_VERIFICATION_KEY)
    .maybeSingle();

  if (error) {
    console.error("ELO verification setting load failed:", error.message);
    return {
      ...defaultEloVerificationSetting,
      error: "ELO verification setting could not be loaded.",
    };
  }

  if (!data) {
    return defaultEloVerificationSetting;
  }

  return mapEloVerificationSetting(data as PlatformSettingRow);
}

export async function getEloVerificationSupportLinkSetting(): Promise<EloVerificationSupportLinkSetting> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, value, updated_at, updated_by_clerk_user_id")
    .eq("key", ELO_VERIFICATION_SUPPORT_LINK_KEY)
    .maybeSingle();

  if (error) {
    console.error("ELO verification support link load failed:", error.message);
    return {
      ...defaultEloVerificationSupportLinkSetting,
      error: "ELO verification support link could not be loaded.",
    };
  }

  if (!data) {
    return defaultEloVerificationSupportLinkSetting;
  }

  return mapEloVerificationSupportLinkSetting(data as PlatformSettingRow);
}

export async function updateEloVerificationSetting({
  enabled,
  updatedByClerkUserId,
}: {
  enabled: boolean;
  updatedByClerkUserId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .upsert(
      {
        key: ELO_VERIFICATION_KEY,
        value: { enabled },
        updated_by_clerk_user_id: updatedByClerkUserId,
      },
      { onConflict: "key" }
    )
    .select("key, value, updated_at, updated_by_clerk_user_id")
    .single();

  if (error || !data) {
    console.error("ELO verification setting update failed:", error?.message);
    return {
      ...defaultEloVerificationSetting,
      error: "ELO verification setting could not be updated.",
    };
  }

  return mapEloVerificationSetting(data as PlatformSettingRow);
}

export async function updateEloVerificationSupportLinkSetting({
  url,
  updatedByClerkUserId,
}: {
  url: string;
  updatedByClerkUserId: string;
}) {
  const normalizedUrl = normalizeEloVerificationSupportUrl(url);

  if (!normalizedUrl) {
    return {
      ...defaultEloVerificationSupportLinkSetting,
      url: url.trim(),
      error: "Enter a valid Discord support URL.",
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .upsert(
      {
        key: ELO_VERIFICATION_SUPPORT_LINK_KEY,
        value: { url: normalizedUrl },
        updated_by_clerk_user_id: updatedByClerkUserId,
      },
      { onConflict: "key" }
    )
    .select("key, value, updated_at, updated_by_clerk_user_id")
    .single();

  if (error || !data) {
    console.error(
      "ELO verification support link update failed:",
      error?.message
    );
    return {
      ...defaultEloVerificationSupportLinkSetting,
      url: normalizedUrl,
      error: "ELO verification support link could not be updated.",
    };
  }

  return mapEloVerificationSupportLinkSetting(data as PlatformSettingRow);
}

function mapEloVerificationSetting(
  row: PlatformSettingRow
): EloVerificationSetting {
  return {
    enabled: row.value?.enabled === true,
    updatedAt: row.updated_at,
    updatedByClerkUserId: row.updated_by_clerk_user_id,
    error: null,
  };
}

function mapEloVerificationSupportLinkSetting(
  row: PlatformSettingRow
): EloVerificationSupportLinkSetting {
  const url =
    typeof row.value?.url === "string"
      ? normalizeEloVerificationSupportUrl(row.value.url)
      : null;

  return {
    url: url ?? DEFAULT_ELO_VERIFICATION_SUPPORT_URL,
    updatedAt: row.updated_at,
    updatedByClerkUserId: row.updated_by_clerk_user_id,
    error: null,
  };
}

function normalizeEloVerificationSupportUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length > 500) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
