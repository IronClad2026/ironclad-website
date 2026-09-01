"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BadgeSlug } from "@/lib/badges/types";

export function useBadgeRevealDestinations() {
  const destinationsRef = useRef(new Map<BadgeSlug, HTMLElement>());
  const settleTimerRef = useRef<number | null>(null);
  const [settlingSlug, setSettlingSlug] = useState<BadgeSlug | null>(null);

  const registerDestination = useCallback(
    (slug: BadgeSlug, element: HTMLElement | null) => {
      if (element) {
        destinationsRef.current.set(slug, element);
      } else {
        destinationsRef.current.delete(slug);
      }
    },
    []
  );

  const getDestinationRect = useCallback((slug: BadgeSlug) => {
    const element = destinationsRef.current.get(slug);

    if (!element?.isConnected) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return rect;
  }, []);

  const settleDestination = useCallback((slug: BadgeSlug) => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }

    setSettlingSlug(slug);
    settleTimerRef.current = window.setTimeout(() => {
      setSettlingSlug((current) => (current === slug ? null : current));
      settleTimerRef.current = null;
    }, 720);
  }, []);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    []
  );

  return {
    getDestinationRect,
    registerDestination,
    settleDestination,
    settlingSlug,
  };
}
