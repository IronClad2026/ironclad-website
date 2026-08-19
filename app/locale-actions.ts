"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import {
  CLERK_LOCALE_METADATA_KEY,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";

export type SetLocalePreferenceResult =
  | {
      ok: true;
      locale: Locale;
      metadataMirror: "updated" | "not-signed-in" | "failed";
    }
  | {
      ok: false;
      code: "INVALID_LOCALE";
    };

export async function setLocalePreference(
  value: string
): Promise<SetLocalePreferenceResult> {
  if (!isLocale(value)) {
    return { ok: false, code: "INVALID_LOCALE" };
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, value, {
    httpOnly: true,
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error(
      "Unable to resolve the signed-in user for locale preference mirroring."
    );
    return { ok: true, locale: value, metadataMirror: "failed" };
  }

  if (!userId) {
    return { ok: true, locale: value, metadataMirror: "not-signed-in" };
  }

  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        [CLERK_LOCALE_METADATA_KEY]: value,
      },
    });
  } catch {
    console.error("Unable to mirror the locale preference to Clerk.");
    return { ok: true, locale: value, metadataMirror: "failed" };
  }

  return { ok: true, locale: value, metadataMirror: "updated" };
}
