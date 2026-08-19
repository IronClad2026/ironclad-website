import "server-only";

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  resolveLocale,
  type Locale,
} from "@/lib/i18n/config";

export type LocaleScope = "player" | "admin";

export async function getRequestLocale(
  scope: LocaleScope = "player"
): Promise<Locale> {
  if (scope === "admin") {
    return DEFAULT_LOCALE;
  }

  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}
