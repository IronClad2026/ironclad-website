import type { Locale } from "@/lib/i18n/config";

export async function getRequestLocale(): Promise<Locale> {
  return (new URLSearchParams(window.location.search).get("locale") ?? "en") as Locale;
}

export async function loadPublicGamingProfileNotice(): Promise<"required"> {
  return "required";
}
