// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useMatchRoomUnread from "@/components/tournaments/useMatchRoomUnread";
import { getMatchRoomUnreadSummary } from "@/app/tournaments/room-unread-actions";
import { notifyMatchRoomReadAcknowledged } from "@/lib/match-room-unread-events";
import type { MatchRoomUnreadItem } from "@/lib/match-room-unread";

vi.mock("@/app/tournaments/room-unread-actions", () => ({ getMatchRoomUnreadSummary: vi.fn() }));

const item = (matchId = "match-1", unreadSource: MatchRoomUnreadItem["unreadSource"] = "opponent"): MatchRoomUnreadItem => ({
  matchId, roomId: `room-${matchId}`, unreadSource,
});
const ok = (items: MatchRoomUnreadItem[]) => ({ ok: true as const, data: { items } });
const flush = () => act(async () => { await Promise.resolve(); });
const acknowledge = (matchId = "match-1") => act(() => notifyMatchRoomReadAcknowledged({
  matchId, roomId: `room-${matchId}`, lastReadSequence: 1,
}));
const visibility = (value: "visible" | "hidden") => act(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
});
const deferred = () => {
  let resolve!: (value: Awaited<ReturnType<typeof getMatchRoomUnreadSummary>>) => void;
  const promise = new Promise<Awaited<ReturnType<typeof getMatchRoomUnreadSummary>>>((done) => { resolve = done; });
  return { resolve, promise };
};

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.mocked(getMatchRoomUnreadSummary).mockResolvedValue(ok([item()]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("private match unread polling", () => {
  it("loads one batch, includes only requested matches and pauses in hidden tabs", async () => {
    vi.mocked(getMatchRoomUnreadSummary).mockResolvedValue(ok([item(), item("unrelated")]));
    const { result } = renderHook(() => useMatchRoomUnread({ userId: "player", matchIds: ["match-2", "match-1", "match-1"] }));
    await flush();
    expect(getMatchRoomUnreadSummary).toHaveBeenCalledExactlyOnceWith({ matchIds: ["match-1", "match-2"] });
    expect([...result.current.keys()]).toEqual(["match-1"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getMatchRoomUnreadSummary).toHaveBeenCalledTimes(2);
    visibility("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(getMatchRoomUnreadSummary).toHaveBeenCalledTimes(2);
    visibility("visible");
    await flush();
    expect(getMatchRoomUnreadSummary).toHaveBeenCalledTimes(3);
  });

  it("never requests private state for public viewers or an irrelevant page", async () => {
    const { rerender } = renderHook(({ userId, matchIds }) => useMatchRoomUnread({ userId, matchIds }), {
      initialProps: { userId: null as string | null, matchIds: ["match-1"] },
    });
    await flush();
    rerender({ userId: "player", matchIds: [] });
    await flush();
    expect(getMatchRoomUnreadSummary).not.toHaveBeenCalled();
  });

  it("synchronously isolates signed-out users, other identities and reassigned pairings", async () => {
    const { result, rerender } = renderHook(({ userId, scopeKey }) => useMatchRoomUnread({
      userId, scopeKey, matchIds: ["match-1"],
    }), { initialProps: { userId: "player-A" as string | null, scopeKey: "A/B:1" } });
    await flush();
    expect(result.current.size).toBe(1);
    const pending = deferred();
    vi.mocked(getMatchRoomUnreadSummary).mockReturnValue(pending.promise);
    rerender({ userId: "player-A", scopeKey: "A/C:2" });
    expect(result.current.size).toBe(0);
    rerender({ userId: "player-C", scopeKey: "A/C:2" });
    expect(result.current.size).toBe(0);
    rerender({ userId: null, scopeKey: "A/C:2" });
    await act(async () => pending.resolve(ok([item()])));
    expect(result.current.size).toBe(0);
  });

  it("refreshes immediately after authoritative room acknowledgment without optimistic clearing", async () => {
    const { result } = renderHook(() => useMatchRoomUnread({ userId: "player", matchIds: ["match-1"] }));
    await flush();
    const readRefresh = deferred();
    vi.mocked(getMatchRoomUnreadSummary).mockReturnValueOnce(readRefresh.promise);
    acknowledge();
    expect(result.current.size).toBe(1);
    expect(getMatchRoomUnreadSummary).toHaveBeenCalledTimes(2);
    await act(async () => readRefresh.resolve(ok([])));
    expect(result.current.size).toBe(0);
    vi.mocked(getMatchRoomUnreadSummary).mockResolvedValue(ok([item("match-1", "admin")]));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.get("match-1")?.unreadSource).toBe("admin");
  });

  it("cannot let an older in-flight empty response clear newer unread communication", async () => {
    const previous = deferred();
    vi.mocked(getMatchRoomUnreadSummary).mockReturnValueOnce(previous.promise).mockResolvedValueOnce(ok([item()]));
    const { result } = renderHook(() => useMatchRoomUnread({ userId: "player", matchIds: ["match-1"] }));
    acknowledge();
    await flush();
    expect(result.current.size).toBe(1);
    await act(async () => previous.resolve(ok([])));
    expect(result.current.size).toBe(1);
  });

  it("ignores unrelated room reads and notification-center dismissal", async () => {
    const { result } = renderHook(() => useMatchRoomUnread({ userId: "player", matchIds: ["match-1"] }));
    await flush();
    acknowledge("other-match");
    act(() => window.dispatchEvent(new Event("notification-read")));
    expect(getMatchRoomUnreadSummary).toHaveBeenCalledTimes(1);
    expect(result.current.size).toBe(1);
  });

  it("fails safely for disabled, denied and unavailable rooms", async () => {
    vi.mocked(getMatchRoomUnreadSummary).mockResolvedValueOnce(ok([item()]))
      .mockResolvedValueOnce(ok([])).mockResolvedValueOnce({ ok: false, code: "forbidden" })
      .mockRejectedValueOnce(new Error("unavailable"));
    const { result } = renderHook(() => useMatchRoomUnread({ userId: "player", matchIds: ["match-1"] }));
    await flush();
    expect(result.current.size).toBe(1);
    for (let index = 0; index < 3; index++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(result.current.size).toBe(0);
    }
  });
});
