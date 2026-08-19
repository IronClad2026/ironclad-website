"use client";

import { useEffect, useState } from "react";

export default function useHydrationSafeNow({
  enabled = true,
  intervalMs = 1_000,
}: {
  enabled?: boolean;
  intervalMs?: number;
} = {}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const updateNow = () => setNow(Date.now());
    const initialTimer = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, intervalMs);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [enabled, intervalMs]);

  return now;
}
