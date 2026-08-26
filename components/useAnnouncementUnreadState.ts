"use client";

import { useEffect, useState } from "react";
import { loadAnnouncementNavigationState } from "@/app/announcements/actions";
import {
  ANNOUNCEMENT_SEEN_RECONCILE_EVENT,
  ANNOUNCEMENT_SEEN_STORAGE_KEY,
  hasUnseenAnnouncement,
  readAnonymousAnnouncementMarker,
} from "@/lib/announcement-contract";

type AnnouncementUnreadState = {
  viewer: "anonymous" | "authenticated";
  unread: boolean;
};

export function useAnnouncementUnreadState({
  isLoaded,
  isSignedIn,
  pathname,
}: {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  pathname: string;
}) {
  const [unreadState, setUnreadState] =
    useState<AnnouncementUnreadState | null>(null);
  const expectedViewer =
    !isLoaded || isSignedIn === undefined
      ? null
      : isSignedIn
        ? "authenticated"
        : "anonymous";

  useEffect(() => {
    if (!isLoaded) return;

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
          const result = await loadAnnouncementNavigationState();
          if (!active || !result.ok || rerunRequested) continue;

          if (result.viewer === "authenticated") {
            setUnreadState({
              viewer: "authenticated",
              unread: result.unread,
            });
            continue;
          }

          const seen = readAnonymousAnnouncementMarker();
          setUnreadState({
            viewer: "anonymous",
            unread:
              seen.available &&
              hasUnseenAnnouncement(result.latest, seen.marker),
          });
        } while (active && rerunRequested);
      })()
        .catch(() => undefined)
        .finally(() => {
          inFlight = null;
          if (active && rerunRequested) {
            void reconcile();
          }
        });

      return inFlight;
    };

    const handlePageShow = () => void reconcile();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    const handleSeenReconcile = () => void reconcile();
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === ANNOUNCEMENT_SEEN_STORAGE_KEY ||
        event.key === null
      ) {
        void reconcile();
      }
    };

    void reconcile();
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener(
      ANNOUNCEMENT_SEEN_RECONCILE_EVENT,
      handleSeenReconcile
    );
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener(
        ANNOUNCEMENT_SEEN_RECONCILE_EVENT,
        handleSeenReconcile
      );
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [isLoaded, isSignedIn, pathname]);

  return expectedViewer !== null && unreadState?.viewer === expectedViewer
    ? unreadState.unread
    : false;
}
