// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useMatchRoomRealtime from "@/components/useMatchRoomRealtime";
import type { MatchRoom } from "@/lib/match-room";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(), createClient: vi.fn(), userId: "player", sessionId: "session", signedIn: true,
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({
  getToken: mocks.getToken, isLoaded: true, isSignedIn: mocks.signedIn,
  userId: mocks.userId, sessionId: mocks.sessionId,
}) }));
vi.mock("@/lib/supabase-browser", () => ({ createAuthenticatedBrowserSupabaseClient: mocks.createClient }));

const room: MatchRoom = {
  id: "d19a0000-0000-4000-8000-000000000100", matchId: "d19a0000-0000-4000-8000-000000000300",
  communicationGeneration: 1, roomRevision: 1, activationVersionSnapshot: 1,
  playerOneRegistrationId: "one", playerTwoRegistrationId: "two", viewerRegistrationId: "one",
  createdAt: "2026-09-19T00:00:00Z", closedAt: null, closureReason: null,
  writable: true, lastSequence: 0, lastReadSequence: 0,
};
const signal = { roomId: room.id, communicationGeneration: 1 };
function connection() {
  let broadcast!: (event: { payload: unknown }) => void;
  let status!: (value: string) => void;
  const channel = {
    teardown: vi.fn(),
    on: vi.fn().mockImplementation((_type, _filter, callback) => { broadcast = callback; return channel; }),
    subscribe: vi.fn().mockImplementation((callback) => { status = callback; return channel; }),
  };
  return {
    channel: vi.fn().mockReturnValue(channel), removeChannel: vi.fn().mockResolvedValue("ok"),
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined) },
    emit: (payload: unknown = signal) => broadcast({ payload }),
    status: (value: string) => status(value),
    subscribedChannel: channel,
  };
}
let clients: ReturnType<typeof connection>[];
let refresh: ReturnType<typeof vi.fn<() => Promise<void>>>;
let onReturn: ReturnType<typeof vi.fn<() => void>>;
const mount = (initialRoom: MatchRoom | null = room) => renderHook(
  ({ activeRoom }) => useMatchRoomRealtime({ room: activeRoom, refresh, onReturn }),
  { initialProps: { activeRoom: initialRoom } },
);
const flush = () => act(async () => {});
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  clients = [];
  mocks.userId = "player"; mocks.sessionId = "session"; mocks.signedIn = true;
  mocks.getToken.mockResolvedValue("test-token");
  mocks.createClient.mockImplementation(() => { const value = connection(); clients.push(value); return value; });
  refresh = vi.fn().mockResolvedValue(undefined);
  onReturn = vi.fn();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Match Room private Realtime transport", () => {
  it("authenticates the exact private generation topic and resyncs every successful join", async () => {
    mount(); await flush();
    const client = clients[0];
    expect(mocks.createClient).toHaveBeenCalledWith(mocks.getToken);
    expect(client.realtime.setAuth).toHaveBeenCalledWith("test-token");
    expect(client.channel).toHaveBeenCalledExactlyOnceWith(`match-room:${room.id}:1`, {
      config: { private: true, broadcast: { self: false, ack: false } },
    });
    expect(client.subscribedChannel.on).toHaveBeenCalledWith("broadcast", { event: "invalidate" }, expect.any(Function));
    act(() => client.status("SUBSCRIBED"));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => client.status("CHANNEL_ERROR"));
    act(() => client.status("SUBSCRIBED"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("coalesces bursts and ignores other room/generation or content payloads", async () => {
    mount(); await flush();
    const client = clients[0];
    act(() => {
      client.emit({ ...signal, communicationGeneration: 2 });
      client.emit({ ...signal, roomId: "another-room" });
      client.emit({ ...signal, body: "Never render broadcast content" });
      client.emit(null);
    });
    await advance(80);
    expect(refresh).not.toHaveBeenCalled();
    act(() => { for (let index = 0; index < 20; index++) client.emit(); });
    await advance(79); expect(refresh).not.toHaveBeenCalled();
    await advance(1); expect(refresh).toHaveBeenCalledTimes(1);
    act(() => client.emit({ ...signal, id: "ed65f4ae-5136-4047-a116-6d99fbe987cd" })); await advance(80);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps the 10-second fallback, slows healthy polling to 60 seconds, and restores fallback on failure", async () => {
    mount(); await flush();
    await advance(10_000); expect(refresh).toHaveBeenCalledTimes(1);
    act(() => clients[0].status("SUBSCRIBED"));
    expect(refresh).toHaveBeenCalledTimes(2);
    await advance(59_999); expect(refresh).toHaveBeenCalledTimes(2);
    await advance(1); expect(refresh).toHaveBeenCalledTimes(3);
    act(() => clients[0].status("TIMED_OUT"));
    await advance(10_000); expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("retries a closed channel on fallback cadence and resyncs when the replacement joins", async () => {
    mount(); await flush();
    act(() => clients[0].status("CLOSED"));
    expect(clients[0].realtime.disconnect).toHaveBeenCalled();
    await advance(10_000);
    expect(clients).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => clients[1].status("SUBSCRIBED"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it.each(["hidden", "offline"])("removes connections/timers while %s and immediately resyncs on return", async (state) => {
    const view = mount(); await flush();
    const stale = clients[0];
    act(() => stale.status("SUBSCRIBED"));
    if (state === "hidden") Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    else Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => (state === "hidden" ? document : window).dispatchEvent(new Event(state === "hidden" ? "visibilitychange" : "offline")));
    expect(stale.removeChannel).toHaveBeenCalledExactlyOnceWith(stale.subscribedChannel);
    await advance(120_000);
    act(() => { stale.emit(); stale.status("SUBSCRIBED"); });
    expect(refresh).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => (state === "hidden" ? document : window).dispatchEvent(new Event(state === "hidden" ? "visibilitychange" : "online")));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(2);
    view.unmount();
    expect(clients[1].removeChannel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes Clerk tokens during an otherwise idle healthy connection", async () => {
    mount(); await flush();
    mocks.getToken.mockResolvedValue("refreshed-test-token");
    await advance(25_000);
    expect(clients[0].realtime.setAuth).toHaveBeenLastCalledWith("refreshed-test-token");
  });

  it("cleans up when token renewal fails and keeps authoritative fallback reads", async () => {
    mount(); await flush();
    act(() => clients[0].status("SUBSCRIBED"));
    mocks.getToken.mockResolvedValue(null);
    await advance(25_000);
    expect(clients[0].removeChannel).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(clients).toHaveLength(1);
  });

  it("does not subscribe after an in-flight token resolves following unmount", async () => {
    let resolve!: (token: string) => void;
    mocks.getToken.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const view = mount(); view.unmount();
    await act(async () => resolve("late-test-token"));
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["timed out", "rejected"])("disconnects its socket even if channel removal is %s", async (outcome) => {
    const view = mount(); await flush();
    const client = clients[0];
    if (outcome === "rejected") client.removeChannel.mockRejectedValueOnce(new Error("offline"));
    else client.removeChannel.mockResolvedValueOnce("timed out");
    view.unmount(); await flush();
    expect(client.realtime.disconnect).toHaveBeenCalled();
    expect(client.subscribedChannel.teardown).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disconnects an authenticated client before a pending setAuth resolves after unmount", async () => {
    let resolve!: () => void;
    const client = connection();
    client.realtime.setAuth.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    mocks.createClient.mockReturnValueOnce(client);
    const view = mount(); await flush(); view.unmount();
    expect(client.realtime.disconnect).toHaveBeenCalled();
    await act(async () => resolve());
    expect(client.channel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes old topics and ignores queued/late events after reassignment", async () => {
    const view = mount(); await flush();
    const stale = clients[0]; act(() => stale.emit());
    view.rerender({ activeRoom: { ...room, id: "replacement", communicationGeneration: 2 } });
    await flush();
    act(() => { stale.emit(); stale.status("SUBSCRIBED"); });
    await advance(80);
    expect(refresh).not.toHaveBeenCalled();
    expect(stale.removeChannel).toHaveBeenCalledTimes(1);
    expect(clients[1].channel).toHaveBeenCalledWith("match-room:replacement:2", expect.any(Object));
  });

  it("cleans up on session/identity change and does not join when signed out", async () => {
    const view = mount(); await flush();
    mocks.sessionId = "next-session"; mocks.userId = "next-player";
    view.rerender({ activeRoom: room }); await flush();
    expect(clients[0].removeChannel).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(2);
    mocks.signedIn = false;
    view.rerender({ activeRoom: room }); await flush();
    expect(clients[1].removeChannel).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(2);
  });

  it.each([
    ["kill switch", { ...room, writable: false }],
    ["completed", { ...room, writable: false, closedAt: "2026-09-20T00:00:00Z", closureReason: "match_completed" }],
    ["TBD/BYE/empty future", null],
  ] as const)("retains fallback without subscriptions for %s", async (_label, activeRoom) => {
    mount(activeRoom); await flush();
    expect(mocks.createClient).not.toHaveBeenCalled();
    await advance(10_000); expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops a live subscription as soon as authoritative kill-switch state arrives", async () => {
    const view = mount(); await flush();
    view.rerender({ activeRoom: { ...room, writable: false } }); await flush();
    expect(clients[0].removeChannel).toHaveBeenCalledTimes(1);
    act(() => clients[0].emit()); await advance(80);
    expect(refresh).not.toHaveBeenCalled();
    await advance(10_000); expect(refresh).toHaveBeenCalledTimes(1);
  });
});
