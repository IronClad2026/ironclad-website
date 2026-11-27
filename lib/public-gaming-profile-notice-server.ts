import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isPublicProfileNoticeVersion, type PublicProfileNoticeVersion } from "@/lib/public-gaming-profile-notice";

export type NoticeState =
  | { status: "inactive" | "unavailable" }
  | { status: "required" | "satisfied"; version: PublicProfileNoticeVersion };

export async function loadPublicGamingProfileNotice(userId: string): Promise<NoticeState> {
  try {
    const result = await createSupabaseAdminClient()
      .rpc("get_public_gaming_profile_notice_state", { p_subject: userId })
      .abortSignal(AbortSignal.timeout(4000));
    if (result.error || !result.data || typeof result.data !== "object") return { status: "unavailable" };
    const { version, satisfied } = result.data;
    if (version === null && satisfied === true) return { status: "inactive" };
    if (!isPublicProfileNoticeVersion(version) || typeof satisfied !== "boolean") return { status: "unavailable" };
    return { status: satisfied ? "satisfied" : "required", version };
  } catch {
    return { status: "unavailable" };
  }
}

export async function savePublicGamingProfileNotice(userId: string, version: PublicProfileNoticeVersion): Promise<boolean> {
  try {
    const result = await createSupabaseAdminClient()
      .rpc("acknowledge_public_gaming_profile_notice", {
        p_subject: userId,
        p_expected_version: version,
      })
      .abortSignal(AbortSignal.timeout(4000));
    return !result.error && typeof result.data === "string" && Number.isFinite(Date.parse(result.data));
  } catch {
    return false;
  }
}
