import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://www.ironcladtournaments.com";

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

    await worker.dispatchClick({
      notificationId: NOTIFICATION_ID,
      scope: "player",
      destination: "https://evil.example/ignored",
    });

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
});

function createWorkerHarness() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const setAppBadge = vi.fn().mockResolvedValue(undefined);
  const clearAppBadge = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const workerSource = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const serviceWorker = {
    location: { origin: ORIGIN },
    navigator: { setAppBadge, clearAppBadge },
    registration: { showNotification },
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
      listeners.get("notificationclick")?.({
        notification: { close: vi.fn(), data },
        waitUntil: (promise: Promise<unknown>) => {
          work = promise;
        },
      });
      await work;
    },
  };
}
