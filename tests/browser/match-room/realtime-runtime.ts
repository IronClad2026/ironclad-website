// Synthetic, in-process Broadcast adapter. Never opens a socket or uses credentials.
import { createAuthenticatedBrowserSupabaseClient as resultClient } from "../match-result/runtime";
import { fixture, ROOM_ID } from "./runtime";

const enabled = new URLSearchParams(location.search).get("realtime") === "1";
const getToken = async () => enabled ? "fixture-only" : null;
export function useAuth() {
  return { getToken, isLoaded: true, isSignedIn: true, userId: "fixture-" + fixture.viewer(), sessionId: "fixture-session" };
}
type Channel = {
  teardown: () => void;
  callback?: (event: { payload: unknown }) => void;
  status?: (status: string) => void;
  listener: () => void;
  on: (_event: string, _filter: unknown, callback: (event: { payload: unknown }) => void) => Channel;
  subscribe: (callback: (status: string) => void) => Channel;
};
const channels = new Set<Channel>();
let connected = true;
let created = 0;
let removed = 0;
export function createAuthenticatedBrowserSupabaseClient() {
  return {
    ...resultClient(),
    realtime: { setAuth: async () => {}, disconnect: async () => {} },
    channel() {
      created++;
      const channel: Channel = {
        teardown() { window.removeEventListener("fixture-room-update", channel.listener); },
        listener: () => {
          if (connected) channel.callback?.({ payload: {
            roomId: ROOM_ID, communicationGeneration: 1, id: crypto.randomUUID(),
          } });
        },
        on(_event, _filter, callback) { channel.callback = callback; return channel; },
        subscribe(callback) {
          channel.status = callback;
          channels.add(channel);
          window.addEventListener("fixture-room-update", channel.listener);
          queueMicrotask(() => { if (channels.has(channel)) callback(connected ? "SUBSCRIBED" : "CHANNEL_ERROR"); });
          return channel;
        },
      };
      return channel;
    },
    async removeChannel(channel: Channel) {
      channels.delete(channel); removed++;
      window.removeEventListener("fixture-room-update", channel.listener);
      return "ok";
    },
  };
}
const realtimeFixture = {
  setConnected(value: boolean) {
    connected = value;
    channels.forEach((channel) => channel.status?.(value ? "SUBSCRIBED" : "CHANNEL_ERROR"));
  },
  invalidate() { channels.forEach((channel) => channel.listener()); },
  snapshot() { return { created, removed, active: channels.size }; },
};
declare global { interface Window { matchRoomRealtimeFixture: typeof realtimeFixture } }
window.matchRoomRealtimeFixture = realtimeFixture;
