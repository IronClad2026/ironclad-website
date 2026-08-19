"use client";

import { useEffect, useRef } from "react";

import {
  syncLocalePreferenceAfterAuth,
  type SyncLocalePreferenceResult,
} from "@/app/locale-actions";
import type { Locale } from "@/lib/i18n/config";

export type SyncLocalePreferenceAction = () => Promise<SyncLocalePreferenceResult>;

type LocalePreferenceSyncProps = {
  isSignedIn: boolean;
  locale: Locale;
  syncPreference?: SyncLocalePreferenceAction;
};

export default function LocalePreferenceSync({
  isSignedIn,
  locale,
  syncPreference = syncLocalePreferenceAfterAuth,
}: LocalePreferenceSyncProps) {
  const attemptedLocaleRef = useRef<Locale | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      attemptedLocaleRef.current = null;
      return;
    }

    if (attemptedLocaleRef.current === locale) {
      return;
    }

    attemptedLocaleRef.current = locale;
    void syncPreference().catch(() => {
      console.error("Unable to synchronize the locale preference after sign-in.");
    });
  }, [isSignedIn, locale, syncPreference]);

  return null;
}
