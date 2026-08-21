// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAuthoritativeAppBadge,
  closeDisplayedIronCladNotifications,
  NOTIFICATION_BADGE_RECONCILE_EVENT,
  requestNotificationBadgeReconciliation,
} from "@/lib/app-badge";

describe("installed-app badge helper", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "setAppBadge");
    Reflect.deleteProperty(navigator, "clearAppBadge");
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("sets a positive authoritative unread count", async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "setAppBadge", {
      configurable: true,
      value: setAppBadge,
    });

    await expect(applyAuthoritativeAppBadge(7)).resolves.toBe("applied");
    expect(setAppBadge).toHaveBeenCalledWith(7);
  });

  it("clears the badge for authoritative zero", async () => {
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clearAppBadge", {
      configurable: true,
      value: clearAppBadge,
    });

    await expect(applyAuthoritativeAppBadge(0)).resolves.toBe("applied");
    expect(clearAppBadge).toHaveBeenCalledOnce();
  });

  it("rejects forged or malformed counts and tolerates unsupported browsers", async () => {
    await expect(applyAuthoritativeAppBadge(-1)).resolves.toBe("invalid");
    await expect(applyAuthoritativeAppBadge(1.5)).resolves.toBe("invalid");
    await expect(applyAuthoritativeAppBadge(Number.NaN)).resolves.toBe(
      "invalid"
    );
    await expect(applyAuthoritativeAppBadge(1)).resolves.toBe("unsupported");
  });

  it("contains browser API rejection without changing notification truth", async () => {
    Object.defineProperty(navigator, "setAppBadge", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("BADGE_FAILED")),
    });

    await expect(applyAuthoritativeAppBadge(3)).resolves.toBe("failed");
  });

  it("emits the narrow reconciliation event", () => {
    const listener = vi.fn();
    window.addEventListener(NOTIFICATION_BADGE_RECONCILE_EVENT, listener);

    requestNotificationBadgeReconciliation();

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(NOTIFICATION_BADGE_RECONCILE_EVENT, listener);
  });

  it("closes only the displayed notification for a trusted durable id", async () => {
    const targetId = "11111111-1111-4111-8111-111111111111";
    const otherId = "22222222-2222-4222-8222-222222222222";
    const target = displayedNotification(
      `ironclad-notification:${targetId}`,
      "player"
    );
    const other = displayedNotification(
      `ironclad-notification:${otherId}`,
      "player"
    );
    const unrelated = displayedNotification("another-app-notification", "player");
    installDisplayedNotifications([target, other, unrelated]);

    await closeDisplayedIronCladNotifications({ notificationIds: [targetId] });

    expect(target.close).toHaveBeenCalledOnce();
    expect(other.close).not.toHaveBeenCalled();
    expect(unrelated.close).not.toHaveBeenCalled();
  });

  it("closes only current-scope IronClad notifications for mark-all", async () => {
    const player = displayedNotification(
      "ironclad-notification:11111111-1111-4111-8111-111111111111",
      "player"
    );
    const admin = displayedNotification(
      "ironclad-notification:22222222-2222-4222-8222-222222222222",
      "admin"
    );
    const malformed = displayedNotification(
      "ironclad-notification:not-a-notification-id",
      "player"
    );
    installDisplayedNotifications([player, admin, malformed]);

    await closeDisplayedIronCladNotifications({ scope: "player" });

    expect(player.close).toHaveBeenCalledOnce();
    expect(admin.close).not.toHaveBeenCalled();
    expect(malformed.close).not.toHaveBeenCalled();
  });

  it("contains unavailable or rejected notification inspection", async () => {
    const getRegistration = vi
      .fn()
      .mockRejectedValue(new Error("NOTIFICATION_INSPECTION_FAILED"));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration },
    });

    await expect(closeDisplayedIronCladNotifications()).resolves.toBeUndefined();
  });
});

function displayedNotification(tag: string, scope: "player" | "admin") {
  return {
    tag,
    data: { scope },
    close: vi.fn(),
  } as unknown as Notification;
}

function installDisplayedNotifications(notifications: Notification[]) {
  const getNotifications = vi.fn().mockResolvedValue(notifications);
  const getRegistration = vi.fn().mockResolvedValue({ getNotifications });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration },
  });
  return { getNotifications, getRegistration };
}
