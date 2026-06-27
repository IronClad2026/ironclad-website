import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ELO_VERIFICATION_KEY = "elo_verification";

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

const defaultEloVerificationSetting: EloVerificationSetting = {
  enabled: false,
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
