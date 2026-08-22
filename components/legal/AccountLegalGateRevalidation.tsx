"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

export default function AccountLegalGateRevalidation({
  initiallySignedIn,
  watchForLegalChange,
}: {
  initiallySignedIn: boolean;
  watchForLegalChange: boolean;
}) {
  const { isLoaded, userId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const lastPathnameRef = useRef(pathname);
  const refreshPendingRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);

  const requestRevalidation = useCallback(() => {
    if (refreshPendingRef.current) return;

    refreshPendingRef.current = true;
    router.refresh();
    resetTimerRef.current = window.setTimeout(() => {
      refreshPendingRef.current = false;
      resetTimerRef.current = null;
    }, 1_000);
  }, [router]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isLoaded && Boolean(userId) !== initiallySignedIn) {
      requestRevalidation();
    }
  }, [initiallySignedIn, isLoaded, requestRevalidation, userId]);

  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;

    lastPathnameRef.current = pathname;
    if (watchForLegalChange) requestRevalidation();
  }, [pathname, requestRevalidation, watchForLegalChange]);

  useEffect(() => {
    if (!watchForLegalChange) return;

    const revalidateWhenActive = () => {
      if (document.visibilityState === "visible") requestRevalidation();
    };

    window.addEventListener("focus", revalidateWhenActive);
    document.addEventListener("visibilitychange", revalidateWhenActive);

    return () => {
      window.removeEventListener("focus", revalidateWhenActive);
      document.removeEventListener("visibilitychange", revalidateWhenActive);
    };
  }, [requestRevalidation, watchForLegalChange]);

  return null;
}
