"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

export default function AccountLegalGateRevalidation({
  initiallySignedIn,
  watchForSuccessor,
}: {
  initiallySignedIn: boolean;
  watchForSuccessor: boolean;
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
    if (watchForSuccessor) requestRevalidation();
  }, [pathname, requestRevalidation, watchForSuccessor]);

  useEffect(() => {
    if (!watchForSuccessor) return;

    const revalidateWhenActive = () => {
      if (document.visibilityState === "visible") requestRevalidation();
    };

    window.addEventListener("focus", revalidateWhenActive);
    document.addEventListener("visibilitychange", revalidateWhenActive);

    return () => {
      window.removeEventListener("focus", revalidateWhenActive);
      document.removeEventListener("visibilitychange", revalidateWhenActive);
    };
  }, [requestRevalidation, watchForSuccessor]);

  return null;
}
