"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MatchRoom } from "@/lib/match-room";
import { createAuthenticatedBrowserSupabaseClient } from "@/lib/supabase-browser";

const FALLBACK_POLL_MS = 10_000;
const SAFETY_POLL_MS = 60_000;
const TOKEN_REFRESH_MS = 25_000;
const INVALIDATION_COALESCE_MS = 80;

export function matchRoomRealtimeTopic(roomId: string, generation: number) {
  return `match-room:${roomId}:${generation}`;
}

function visibleAndOnline() {
  return document.visibilityState !== "hidden" && navigator.onLine !== false;
}

/** Transport only. Every signal wakes the existing authorized history read. */
export default function useMatchRoomRealtime({ room, refresh, onReturn }: {
  room: MatchRoom | null;
  refresh: () => Promise<void>;
  onReturn: () => void;
}) {
  const { getToken, isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const roomId = room?.id;
  const generation = room?.communicationGeneration;
  // Disabled and closed rooms retain polling, without a live subscription.
  const eligible = !!room?.writable && room.closedAt === null;

  useEffect(() => {
    let alive = true;
    let healthy = false;
    let attempt = 0;
    let connecting = false;
    let client: ReturnType<typeof createAuthenticatedBrowserSupabaseClient> | null = null;
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let invalidationTimer: ReturnType<typeof setTimeout> | undefined;
    let tokenTimer: ReturnType<typeof setTimeout> | undefined;

    const current = () => alive && visibleAndOnline();
    const stopConnection = () => {
      ++attempt;
      connecting = false;
      healthy = false;
      clearTimeout(invalidationTimer);
      invalidationTimer = undefined;
      clearTimeout(tokenTimer);
      const previousClient = client;
      const previousChannel = channel;
      client = null;
      channel = null;
      // This client belongs only to this room. Do not retain its socket while
      // an offline unsubscribe waits for an acknowledgement or times out.
      if (previousClient && previousChannel) {
        void previousClient.removeChannel(previousChannel).catch(() => {}).finally(() => {
          previousChannel.teardown();
          void previousClient.realtime.disconnect().catch(() => {});
        });
        previousChannel.teardown();
      }
      if (previousClient) void previousClient.realtime.disconnect().catch(() => {});
    };

    const schedulePoll = () => {
      clearTimeout(pollTimer);
      if (!current()) return;
      pollTimer = setTimeout(() => {
        if (!current()) return;
        void refresh();
        void connect();
        schedulePoll();
      }, healthy ? SAFETY_POLL_MS : FALLBACK_POLL_MS);
    };

    const invalidate = (payload: unknown) => {
      if (!current() || typeof payload !== "object" || payload === null) return;
      const signal = payload as Record<string, unknown>;
      // realtime.send adds its own UUID transport id on hosted Supabase.
      if (!Object.keys(signal).every((key) => ["roomId", "communicationGeneration", "id"].includes(key)) ||
          (signal.id !== undefined && (typeof signal.id !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signal.id))) ||
          signal.roomId !== roomId ||
          signal.communicationGeneration !== generation || invalidationTimer !== undefined) return;
      // Do not interpret content or advance read cursors from Broadcast payloads.
      invalidationTimer = setTimeout(() => {
        invalidationTimer = undefined;
        if (current()) void refresh();
      }, INVALIDATION_COALESCE_MS);
    };

    async function connect() {
      if (!current() || !eligible || !roomId || !generation ||
          !isLoaded || !isSignedIn || !userId || connecting || client) return;
      connecting = true;
      const connectionAttempt = ++attempt;
      const isCurrent = () => current() && connectionAttempt === attempt;
      try {
        const token = await getToken();
        if (!isCurrent()) return;
        if (!token) throw new Error("Match Room token unavailable");
        const connection = createAuthenticatedBrowserSupabaseClient(getToken);
        client = connection;
        // Explicit token refresh is required for Clerk-backed clients: a token
        // passed to setAuth remains pinned until the application replaces it.
        await connection.realtime.setAuth(token);
        if (!isCurrent()) return;
        const nextChannel = connection.channel(matchRoomRealtimeTopic(roomId, generation), {
          config: { private: true, broadcast: { self: false, ack: false } },
        });
        channel = nextChannel;
        nextChannel.on("broadcast", { event: "invalidate" }, ({ payload }) => {
          if (isCurrent() && channel === nextChannel) invalidate(payload);
        }).subscribe((status) => {
          if (!isCurrent() || channel !== nextChannel) return;
          healthy = status === "SUBSCRIBED";
          if (healthy) {
            // Includes every successful rejoin; events may have been missed.
            void refresh();
          } else if (status === "CLOSED") {
            stopConnection();
          }
          schedulePoll();
        });
        if (!isCurrent()) return;
        const refreshToken = async () => {
          if (!isCurrent()) return;
          try {
            const freshToken = await getToken();
            if (!isCurrent()) return;
            if (!freshToken) throw new Error("Match Room token unavailable");
            await connection.realtime.setAuth(freshToken);
            if (isCurrent()) tokenTimer = setTimeout(() => void refreshToken(), TOKEN_REFRESH_MS);
          } catch {
            if (isCurrent()) {
              stopConnection();
              schedulePoll();
            }
          }
        };
        tokenTimer = setTimeout(() => void refreshToken(), TOKEN_REFRESH_MS);
      } catch {
        if (isCurrent()) {
          stopConnection();
          schedulePoll();
        }
      } finally {
        if (connectionAttempt === attempt) connecting = false;
      }
    }

    const resume = () => {
      if (!current()) {
        clearTimeout(pollTimer);
        stopConnection();
        return;
      }
      onReturn();
      void refresh();
      void connect();
      schedulePoll();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    schedulePoll();
    void connect();
    return () => {
      alive = false;
      clearTimeout(pollTimer);
      stopConnection();
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [eligible, generation, getToken, isLoaded, isSignedIn, onReturn, refresh, roomId, sessionId, userId]);
}
