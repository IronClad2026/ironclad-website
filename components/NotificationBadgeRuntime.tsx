"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { loadAuthoritativeNotificationUnreadCount } from "@/app/notifications/actions";
import {
  applyAuthoritativeAppBadge,
  NOTIFICATION_BADGE_RECONCILE_EVENT,
} from "@/lib/app-badge";

export default function NotificationBadgeRuntime() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      void applyAuthoritativeAppBadge(0);
      return;
    }

    let active = true;
    let inFlight: Promise<void> | null = null;
    let rerunRequested = false;

    const reconcile = () => {
      if (inFlight) {
        rerunRequested = true;
        return inFlight;
      }

      inFlight = (async () => {
        do {
          rerunRequested = false;
          const result = await loadAuthoritativeNotificationUnreadCount();

          if (active && result.ok && !rerunRequested) {
            await applyAuthoritativeAppBadge(result.unreadCount);
          }
        } while (active && rerunRequested);
      })()
        .catch(() => undefined)
        .finally(() => {
          inFlight = null;
        });

      return inFlight;
    };

    const handlePageShow = () => {
      void reconcile();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reconcile();
      }
    };
    const handleReconcileRequest = () => {
      void reconcile();
    };

    void reconcile();
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener(
      NOTIFICATION_BADGE_RECONCILE_EVENT,
      handleReconcileRequest
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener(
        NOTIFICATION_BADGE_RECONCILE_EVENT,
        handleReconcileRequest
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoaded, isSignedIn]);

  return null;
}
