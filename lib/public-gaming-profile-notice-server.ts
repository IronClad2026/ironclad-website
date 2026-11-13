import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { PUBLIC_PROFILE_NOTICE_VERSION } from "@/lib/public-gaming-profile-notice";

type NoticeState = "inactive" | "required" | "satisfied" | "unavailable";

export async function loadPublicGamingProfileNotice(userId: string): Promise<NoticeState> {
  try {
    const result = await createSupabaseAdminClient()
      .rpc("get_public_gaming_profile_notice_state", { p_subject: userId })
      .abortSignal(AbortSignal.timeout(4000));
    if (result.error || !result.data || typeof result.data !== "object") return "unavailable";
    if (result.data.version === null && result.data.satisfied === true) return "inactive";
    if (result.data.version !== PUBLIC_PROFILE_NOTICE_VERSION) return "unavailable";
    if (result.data.satisfied === true) return "satisfied";
    return result.data.satisfied === false ? "required" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function savePublicGamingProfileNotice(userId: string): Promise<boolean> {
  try {
    const result = await createSupabaseAdminClient()
      .rpc("acknowledge_public_gaming_profile_notice", {
        p_subject: userId,
        p_expected_version: PUBLIC_PROFILE_NOTICE_VERSION,
      })
      .abortSignal(AbortSignal.timeout(4000));
    return !result.error && typeof result.data === "string" && Number.isFinite(Date.parse(result.data));
  } catch {
    return false;
  }
}
