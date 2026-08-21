// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.hoisted(() => vi.fn());
const loadUnreadCountMock = vi.hoisted(() => vi.fn());
const applyBadgeMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("@/app/notifications/actions", () => ({
  loadAuthoritativeNotificationUnreadCount: loadUnreadCountMock,
}));
vi.mock("@/lib/app-badge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-badge")>();
  return {
    ...actual,
    applyAuthoritativeAppBadge: applyBadgeMock,
  };
});

import NotificationBadgeRuntime from "@/components/NotificationBadgeRuntime";
import {
  NOTIFICATION_BADGE_RECONCILE_EVENT,
} from "@/lib/app-badge";

describe("notification badge runtime", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    loadUnreadCountMock.mockResolvedValue({ ok: true, unreadCount: 6 });
    applyBadgeMock.mockResolvedValue("applied");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("reconciles an authenticated app open from server truth", async () => {
    render(<NotificationBadgeRuntime />);

    await waitFor(() => {
      expect(loadUnreadCountMock).toHaveBeenCalledOnce();
      expect(applyBadgeMock).toHaveBeenCalledWith(6);
    });
  });

  it("ignores a failed count load instead of inventing zero", async () => {
    loadUnreadCountMock.mockResolvedValue({
      ok: false,
      code: "unavailable",
    });

    render(<NotificationBadgeRuntime />);

    await waitFor(() => expect(loadUnreadCountMock).toHaveBeenCalledOnce());
    expect(applyBadgeMock).not.toHaveBeenCalled();
  });

  it("reconciles on an explicit truth-change event without polling", async () => {
    render(<NotificationBadgeRuntime />);
    await waitFor(() => expect(loadUnreadCountMock).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event(NOTIFICATION_BADGE_RECONCILE_EVENT));

    await waitFor(() => expect(loadUnreadCountMock).toHaveBeenCalledTimes(2));
  });

  it("reconciles when the installed app returns through pageshow", async () => {
    render(<NotificationBadgeRuntime />);
    await waitFor(() => expect(applyBadgeMock).toHaveBeenCalledWith(6));

    window.dispatchEvent(new Event("pageshow"));

    await waitFor(() => expect(loadUnreadCountMock).toHaveBeenCalledTimes(2));
  });

  it("reconciles only when document visibility returns to visible", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    render(<NotificationBadgeRuntime />);
    await waitFor(() => expect(applyBadgeMock).toHaveBeenCalledWith(6));

    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => Promise.resolve());
    expect(loadUnreadCountMock).toHaveBeenCalledOnce();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(loadUnreadCountMock).toHaveBeenCalledTimes(2));
  });

  it("re-runs after a truth-change event arrives during reconciliation", async () => {
    let resolveFirst!: (value: { ok: true; unreadCount: number }) => void;
    const firstResult = new Promise<{ ok: true; unreadCount: number }>(
      (resolve) => {
        resolveFirst = resolve;
      }
    );
    loadUnreadCountMock
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce({ ok: true, unreadCount: 4 });

    render(<NotificationBadgeRuntime />);
    await waitFor(() => expect(loadUnreadCountMock).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event(NOTIFICATION_BADGE_RECONCILE_EVENT));
    expect(loadUnreadCountMock).toHaveBeenCalledOnce();

    await act(async () => {
      resolveFirst({ ok: true, unreadCount: 5 });
      await firstResult;
    });

    await waitFor(() => {
      expect(loadUnreadCountMock).toHaveBeenCalledTimes(2);
      expect(applyBadgeMock).toHaveBeenLastCalledWith(4);
    });
    expect(applyBadgeMock).not.toHaveBeenCalledWith(5);
  });

  it("clears stale device state after sign-out", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(<NotificationBadgeRuntime />);

    await waitFor(() => expect(applyBadgeMock).toHaveBeenCalledWith(0));
    expect(loadUnreadCountMock).not.toHaveBeenCalled();
  });
});
