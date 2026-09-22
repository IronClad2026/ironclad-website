"use client";

import { useEffect, useState } from "react";
import { getMatchRoomUnreadSummary } from "@/app/tournaments/room-unread-actions";
import type { MatchRoomUnreadItem } from "@/lib/match-room-unread";
import {
  MATCH_ROOM_READ_ACKNOWLEDGED_EVENT,
  type MatchRoomReadAcknowledged,
} from "@/lib/match-room-unread-events";

const EMPTY_UNREAD: ReadonlyMap<string, MatchRoomUnreadItem> = new Map();

export default function useMatchRoomUnread({ userId, matchIds, scopeKey = "" }: {
  userId: string | null | undefined;
  matchIds: readonly string[];
  scopeKey?: string;
}): ReadonlyMap<string, MatchRoomUnreadItem> {
  // Stable primitive dependencies keep the timer independent of draft/UI renders.
  const idsKey = JSON.stringify([...new Set(matchIds)].sort());
  const requestKey = JSON.stringify([userId ?? null, idsKey, scopeKey]);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    items: ReadonlyMap<string, MatchRoomUnreadItem>;
  } | null>(null);

  useEffect(() => {
    const ids: string[] = JSON.parse(idsKey);
    if (!userId || ids.length === 0) return;
    const requested = new Set(ids);
    let alive = true;
    let revision = 0;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      if (alive && document.visibilityState === "visible") {
        timer = setTimeout(() => void refresh(), 10_000);
      }
    };
    const refresh = async (invalidate = false) => {
      if (!alive || document.visibilityState !== "visible") return;
      if (inFlight && !invalidate) return;
      clearTimeout(timer);
      const requestRevision = ++revision;
      inFlight = true;
      try {
        const result = await getMatchRoomUnreadSummary({ matchIds: ids });
        if (!alive || requestRevision !== revision || document.visibilityState !== "visible") return;
        // Disabled, unauthorized, malformed and failed projections fail closed.
        // Notification-center dismissal never changes this state.
        const items = result.ok ? result.data.items.filter((item) => requested.has(item.matchId)) : [];
        setSnapshot({ key: requestKey, items: new Map(items.map((item) => [item.matchId, item])) });
      } catch {
        if (alive && requestRevision === revision) setSnapshot({ key: requestKey, items: EMPTY_UNREAD });
      } finally {
        if (alive && requestRevision === revision) {
          inFlight = false;
          schedule();
        }
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      // A response requested before hiding cannot restore stale private state.
      ++revision;
      inFlight = false;
      if (document.visibilityState === "visible") void refresh();
    };
    const acknowledged = (event: Event) => {
      const detail = (event as CustomEvent<MatchRoomReadAcknowledged>).detail;
      if (detail && requested.has(detail.matchId)) {
        // Supersede any older request; ask the server again so a newer incoming
        // message is never cleared by an optimistic read acknowledgment.
        void refresh(true);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener(MATCH_ROOM_READ_ACKNOWLEDGED_EVENT, acknowledged);
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener(MATCH_ROOM_READ_ACKNOWLEDGED_EVENT, acknowledged);
    };
  }, [idsKey, requestKey, userId]);

  // Synchronously isolate sign-out, user changes, and pairing/lifecycle changes.
  return userId && snapshot?.key === requestKey ? snapshot.items : EMPTY_UNREAD;
}
