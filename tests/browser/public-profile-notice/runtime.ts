import type { Locale } from "@/lib/i18n/config";
import { PUBLIC_PROFILE_NOTICE_VERSION, PUBLIC_PROFILE_TRANSITION_NOTICE_VERSION } from "@/lib/public-gaming-profile-notice";
import type { NoticeState } from "@/lib/public-gaming-profile-notice-server";

export async function getRequestLocale(): Promise<Locale> {
  return (new URLSearchParams(window.location.search).get("locale") ?? "en") as Locale;
}

export async function loadPublicGamingProfileNotice(): Promise<NoticeState> {
  const transition = new URLSearchParams(window.location.search).get("notice") === "v2";
  return { status: "required", version: transition ? PUBLIC_PROFILE_TRANSITION_NOTICE_VERSION : PUBLIC_PROFILE_NOTICE_VERSION };
}
