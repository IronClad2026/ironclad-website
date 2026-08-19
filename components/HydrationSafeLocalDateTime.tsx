"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { useOptionalLocale } from "@/components/i18n/LocaleProvider";
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
}: {
  value: string | null | undefined;
  fallback: ReactNode;
  options?: Intl.DateTimeFormatOptions;
}) {
  const hydrated = useHydrated();
  const locale = useOptionalLocale();

  if (!value) return fallback;

  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return fallback;

  const formatted = hydrated
    ? formatDateTime(timestamp, locale, { kind: "local" }, options)
    : formatDateTime(timestamp, locale, { kind: "utc" }, options);

  return <time dateTime={value}>{formatted}</time>;
}
