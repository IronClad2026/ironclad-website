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
    const browser = installDisplayedNotifications([target, other, unrelated]);

    await closeDisplayedIronCladNotifications({ notificationIds: [targetId] });

    expect(browser.getNotifications).toHaveBeenCalledWith();
    expect(target.close).toHaveBeenCalledOnce();
    expect(other.close).not.toHaveBeenCalled();
    expect(unrelated.close).not.toHaveBeenCalled();
  });

  it("recovers the durable id from notification data", async () => {
    const targetId = "11111111-1111-4111-8111-111111111111";
    const target = {
      tag: "",
      data: { notificationId: targetId, scope: "player" },
      close: vi.fn(),
    } as unknown as Notification;
    installDisplayedNotifications([target]);

    await closeDisplayedIronCladNotifications({ notificationIds: [targetId] });

    expect(target.close).toHaveBeenCalledOnce();
  });

  it("uses the active registration associated with the current page", async () => {
    const targetId = "11111111-1111-4111-8111-111111111111";
    const target = displayedNotification(
      `ironclad-notification:${targetId}`,
      "player"
    );
    const matchedGetNotifications = vi.fn().mockResolvedValue([]);
    const matchedRegistration = {
      active: {},
      getNotifications: matchedGetNotifications,
      scope: "https://example.test/",
    } as unknown as ServiceWorkerRegistration;
    const readyGetNotifications = vi.fn().mockResolvedValue([target]);
    const readyRegistration = {
      active: {},
      getNotifications: readyGetNotifications,
      scope: "https://example.test/",
    } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(matchedRegistration),
        ready: Promise.resolve(readyRegistration),
      },
    });

    await closeDisplayedIronCladNotifications({ notificationIds: [targetId] });

    expect(matchedGetNotifications).not.toHaveBeenCalled();
    expect(readyGetNotifications).toHaveBeenCalledWith();
    expect(target.close).toHaveBeenCalledOnce();
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

  it("contains getNotifications rejection", async () => {
    const registration = {
      active: {},
      getNotifications: vi
        .fn()
        .mockRejectedValue(new Error("GET_NOTIFICATIONS_FAILED")),
      scope: "https://example.test/",
    } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    });

    await expect(closeDisplayedIronCladNotifications()).resolves.toBeUndefined();
  });

  it("returns without awaiting readiness when no registration exists", async () => {
    const serviceWorkers = {
      getRegistration: vi.fn().mockResolvedValue(undefined),
      get ready() {
        throw new Error("READY_MUST_NOT_BE_READ");
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: serviceWorkers,
    });

    await expect(closeDisplayedIronCladNotifications()).resolves.toBeUndefined();
  });

  it("contains a notification close failure", async () => {
    const failingId = "11111111-1111-4111-8111-111111111111";
    const succeedingId = "22222222-2222-4222-8222-222222222222";
    const failing = displayedNotification(
      `ironclad-notification:${failingId}`,
      "player"
    );
    const succeeding = displayedNotification(
      `ironclad-notification:${succeedingId}`,
      "player"
    );
    vi.mocked(failing.close).mockImplementation(() => {
      throw new Error("CLOSE_FAILED");
    });
    installDisplayedNotifications([failing, succeeding]);

    await expect(
      closeDisplayedIronCladNotifications({
        notificationIds: [failingId, succeedingId],
      })
    ).resolves.toBeUndefined();
    expect(succeeding.close).toHaveBeenCalledOnce();
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
  const registration = {
    active: {},
    getNotifications,
    scope: "https://example.test/",
  } as unknown as ServiceWorkerRegistration;
  const getRegistration = vi.fn().mockResolvedValue(registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, ready: Promise.resolve(registration) },
  });
  return { getNotifications, getRegistration };
}
