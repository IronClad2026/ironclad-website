"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

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

function formatDeterministicUtc(timestamp: Date) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const hours = timestamp.getUTCHours();
  const displayHours = hours % 12 || 12;
  const minutes = timestamp.getUTCMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "pm" : "am";

  return `${timestamp.getUTCDate()} ${months[timestamp.getUTCMonth()]} ${timestamp.getUTCFullYear()}, ${displayHours}:${minutes} ${period}`;
}

export default function HydrationSafeLocalDateTime({
  value,
  fallback,
}: {
  value: string | null | undefined;
  fallback: ReactNode;
}) {
  const hydrated = useHydrated();

  if (!value) return fallback;

  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return fallback;

  const formatted = hydrated
    ? new Intl.DateTimeFormat("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp)
    : formatDeterministicUtc(timestamp);

  return <time dateTime={value}>{formatted}</time>;
}
