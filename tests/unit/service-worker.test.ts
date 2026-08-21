import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://www.ironcladtournaments.com";
const CLOSE_MESSAGE_TYPE = "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS";
const CLOSE_RESULT_TYPE = "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS_RESULT";

describe("notification service worker", () => {
  it("shows a conservative notification and applies a trusted badge snapshot", async () => {
    const worker = createWorkerHarness();

    await worker.dispatchPush({
      version: 1,
      notificationId: NOTIFICATION_ID,
      scope: "player",
      title: "Match ready",
      body: "Your next match is ready.",
      unreadCount: 3,
      destination: "https://evil.example/ignored",
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "Match ready",
      expect.objectContaining({
        body: "Your next match is ready.",
        data: { notificationId: NOTIFICATION_ID, scope: "player" },
      })
    );
    expect(worker.setAppBadge).toHaveBeenCalledWith(3);
  });

  it("uses the durable notification identity as a stable replacement tag", async () => {
    const worker = createWorkerHarness();
    const payload = {
      version: 1,
      notificationId: NOTIFICATION_ID,
      scope: "player",
      title: "Match ready",
      body: "Your next match is ready.",
      unreadCount: 2,
    };

    await worker.dispatchPush(payload);
    await worker.dispatchPush({
      ...payload,
      body: "Your match notification was refreshed.",
      unreadCount: 3,
    });

    expect(worker.showNotification).toHaveBeenCalledTimes(2);
    for (const [, options] of worker.showNotification.mock.calls) {
      expect(options).toEqual(
        expect.objectContaining({
          tag: `ironclad-notification:${NOTIFICATION_ID}`,
        })
      );
    }
  });

  it("isolates badge API rejection from system-notification delivery", async () => {
    const worker = createWorkerHarness();
    worker.setAppBadge.mockRejectedValueOnce(new Error("BADGE_UNAVAILABLE"));

    await expect(
      worker.dispatchPush({
        version: 1,
        notificationId: NOTIFICATION_ID,
        scope: "player",
        title: "Match ready",
        body: "Your next match is ready.",
        unreadCount: 3,
      })
    ).resolves.toBeUndefined();

    expect(worker.showNotification).toHaveBeenCalledOnce();
  });

  it("fails closed for malformed payloads and does not apply a forged badge", async () => {
    const worker = createWorkerHarness();

    await worker.dispatchPush({
      version: 2,
      notificationId: "not-a-uuid",
      scope: "admin",
      title: "Forged title",
      body: "Forged body",
      unreadCount: 999,
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "IronClad",
      expect.objectContaining({
        body: "",
        data: { notificationId: "", scope: null },
      })
    );
    expect(worker.setAppBadge).not.toHaveBeenCalled();
    expect(worker.clearAppBadge).not.toHaveBeenCalled();
  });

  it("clears the installed-app badge for an authoritative zero snapshot", async () => {
    const worker = createWorkerHarness();

    await worker.dispatchPush({
      version: 1,
      notificationId: NOTIFICATION_ID,
      scope: "admin",
      title: "Admin update",
      body: "An operational item changed.",
      unreadCount: 0,
    });

    expect(worker.clearAppBadge).toHaveBeenCalledOnce();
    expect(worker.setAppBadge).not.toHaveBeenCalled();
  });

  it("routes clicks only through the authenticated same-origin resolver", async () => {
    const worker = createWorkerHarness();
    const focusedClient = {
      url: `${ORIGIN}/dashboard`,
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn(),
    };
    focusedClient.navigate.mockResolvedValue(focusedClient);
    worker.matchAll.mockResolvedValue([focusedClient]);

    const close = await worker.dispatchClick({
      notificationId: NOTIFICATION_ID,
      scope: "player",
      destination: "https://evil.example/ignored",
    });

    expect(close).toHaveBeenCalledOnce();
    expect(focusedClient.navigate).toHaveBeenCalledWith(
      `${ORIGIN}/api/notifications/click?notificationId=${NOTIFICATION_ID}&scope=player`
    );
    expect(focusedClient.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("opens only the root fallback when click identity is invalid", async () => {
    const worker = createWorkerHarness();

    await worker.dispatchClick({
      notificationId: NOTIFICATION_ID,
      scope: "owner-supplied-admin",
      destination: "//evil.example",
    });

    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it("closes exact same-scope notifications inside the owning service worker", async () => {
    const worker = createWorkerHarness();
    const tagged = displayedNotification({
      notificationId: NOTIFICATION_ID,
      scope: "player",
    });
    const dataFallback = displayedNotification({
      notificationId: SECOND_NOTIFICATION_ID,
      scope: "player",
      tag: "",
    });
    const wrongScope = displayedNotification({
      notificationId: NOTIFICATION_ID,
      scope: "admin",
    });
    const unrelated = displayedNotification({
      notificationId: "33333333-3333-4333-8333-333333333333",
      scope: "player",
    });
    worker.getNotifications.mockResolvedValue([
      tagged,
      dataFallback,
      wrongScope,
      unrelated,
    ]);

    const reply = await worker.dispatchMessage({
      type: CLOSE_MESSAGE_TYPE,
      notificationIds: [NOTIFICATION_ID, SECOND_NOTIFICATION_ID],
      scope: "player",
    });

    expect(worker.getNotifications).toHaveBeenCalledOnce();
    expect(tagged.close).toHaveBeenCalledOnce();
    expect(dataFallback.close).toHaveBeenCalledOnce();
    expect(wrongScope.close).not.toHaveBeenCalled();
    expect(unrelated.close).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      type: CLOSE_RESULT_TYPE,
      ok: true,
      matchedCount: 2,
      closedCount: 2,
    });
  });

  it("closes only valid current-scope notifications for mark-all", async () => {
    const worker = createWorkerHarness();
    const player = displayedNotification({
      notificationId: NOTIFICATION_ID,
      scope: "player",
    });
    const playerCloseFailure = displayedNotification({
      notificationId: SECOND_NOTIFICATION_ID,
      scope: "player",
    });
    playerCloseFailure.close.mockImplementation(() => {
      throw new Error("CLOSE_FAILED");
    });
    const admin = displayedNotification({
      notificationId: "33333333-3333-4333-8333-333333333333",
      scope: "admin",
    });
    const conflictingIdentity = displayedNotification({
      notificationId: "44444444-4444-4444-8444-444444444444",
      scope: "player",
      dataNotificationId: "55555555-5555-4555-8555-555555555555",
    });
    const unrelated = {
      tag: "another-app-notification",
      data: { scope: "player" },
      close: vi.fn(),
    };
    worker.getNotifications.mockResolvedValue([
      player,
      playerCloseFailure,
      admin,
      conflictingIdentity,
      unrelated,
    ]);

    const reply = await worker.dispatchMessage({
      type: CLOSE_MESSAGE_TYPE,
      scope: "player",
    });

    expect(player.close).toHaveBeenCalledOnce();
    expect(playerCloseFailure.close).toHaveBeenCalledOnce();
    expect(admin.close).not.toHaveBeenCalled();
    expect(conflictingIdentity.close).not.toHaveBeenCalled();
    expect(unrelated.close).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      type: CLOSE_RESULT_TYPE,
      ok: false,
      matchedCount: 2,
      closedCount: 1,
    });
  });

  it("ignores malformed, cross-origin, and over-broad cleanup messages", async () => {
    const worker = createWorkerHarness();
    const malformedMessages = [
      { type: "UNTRUSTED_MESSAGE", scope: "player" },
      { type: CLOSE_MESSAGE_TYPE, notificationIds: [] },
      { type: CLOSE_MESSAGE_TYPE, notificationIds: ["not-a-uuid"] },
      { type: CLOSE_MESSAGE_TYPE, scope: "owner-supplied-admin" },
      { type: CLOSE_MESSAGE_TYPE, scope: "player", destination: "/admin" },
    ];

    for (const message of malformedMessages) {
      const reply = await worker.dispatchMessage(message);
      expect(reply).not.toHaveBeenCalled();
    }
    const crossOriginReply = await worker.dispatchMessage(
      { type: CLOSE_MESSAGE_TYPE, scope: "player" },
      "https://evil.example"
    );

    expect(crossOriginReply).not.toHaveBeenCalled();
    expect(worker.getNotifications).not.toHaveBeenCalled();
  });
});

function createWorkerHarness() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const setAppBadge = vi.fn().mockResolvedValue(undefined);
  const clearAppBadge = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const getNotifications = vi.fn().mockResolvedValue([]);
  const workerSource = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const serviceWorker = {
    location: { origin: ORIGIN },
    navigator: { setAppBadge, clearAppBadge },
    registration: { getNotifications, showNotification },
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll,
      openWindow,
    },
    skipWaiting: vi.fn(),
    addEventListener: (
      type: string,
      listener: (event: unknown) => void
    ) => listeners.set(type, listener),
  };

  runInNewContext(workerSource, {
    Array,
    Map,
    Number,
    Promise,
    Set,
    URL,
    encodeURIComponent,
    self: serviceWorker,
  });

  return {
    clearAppBadge,
    getNotifications,
    matchAll,
    openWindow,
    setAppBadge,
    showNotification,
    async dispatchPush(payload: unknown) {
      let work: Promise<unknown> | null = null;
      listeners.get("push")?.({
        data: { json: () => payload },
        waitUntil: (promise: Promise<unknown>) => {
          work = promise;
        },
      });
      await work;
    },
    async dispatchClick(data: Record<string, unknown>) {
      let work: Promise<unknown> | null = null;
      const close = vi.fn();
      listeners.get("notificationclick")?.({
        notification: { close, data },
        waitUntil: (promise: Promise<unknown>) => {
          work = promise;
        },
      });
      await work;
      return close;
    },
    async dispatchMessage(data: unknown, origin = ORIGIN) {
      let work: Promise<unknown> | null = null;
      const postMessage = vi.fn();
      listeners.get("message")?.({
        data,
        origin,
        ports: [{ postMessage }],
        waitUntil: (promise: Promise<unknown>) => {
          work = promise;
        },
      });
      await work;
      return postMessage;
    },
  };
}

function displayedNotification({
  notificationId,
  scope,
  tag = `ironclad-notification:${notificationId}`,
  dataNotificationId = notificationId,
}: {
  notificationId: string;
  scope: "player" | "admin";
  tag?: string;
  dataNotificationId?: string;
}) {
  return {
    tag,
    data: { notificationId: dataNotificationId, scope },
    close: vi.fn(),
  };
}
