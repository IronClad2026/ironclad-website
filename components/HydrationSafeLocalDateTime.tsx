"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";

const subscribe = () => () => {};

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );
}

export default function HydrationSafeLocalDateTime({
  value,
  fallback,
  options,
  locale: localeOverride,
  className,
  render,
}: {
  value: string | null | undefined;
  fallback: ReactNode;
  options?: Intl.DateTimeFormatOptions;
  locale?: Locale;
  className?: string;
  render?: (formatted: string) => ReactNode;
}) {
  const hydrated = useHydrated();
  const selectedLocale = useOptionalLocale();
  const locale = localeOverride ?? selectedLocale;

  if (!value) return fallback;

  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return fallback;

  const formatted = hydrated
    ? formatDateTime(timestamp, locale, { kind: "local" }, options)
    : formatDateTime(timestamp, locale, { kind: "utc" }, options);

  if (render) {
    return render(formatted);
  }

  return (
    <time className={className} dateTime={value}>
      {formatted}
    </time>
  );
}
