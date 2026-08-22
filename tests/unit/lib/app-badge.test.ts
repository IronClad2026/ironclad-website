// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAuthoritativeAppBadge,
  closeDisplayedIronCladNotifications,
  NOTIFICATION_BADGE_RECONCILE_EVENT,
  requestNotificationBadgeReconciliation,
} from "@/lib/app-badge";

const originalMessageChannel = globalThis.MessageChannel;
const CLOSE_RESULT_TYPE = "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS_RESULT";

describe("installed-app badge helper", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "setAppBadge");
    Reflect.deleteProperty(navigator, "clearAppBadge");
    Reflect.deleteProperty(navigator, "serviceWorker");
    Object.defineProperty(globalThis, "MessageChannel", {
      configurable: true,
      writable: true,
      value: originalMessageChannel,
    });
    vi.useRealTimers();
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

  it("sends exact durable identity and scope to the active worker and awaits acknowledgement", async () => {
    const targetId = "11111111-1111-4111-8111-111111111111";
    const worker = installActiveWorker({ acknowledge: false });

    let settled = false;
    const cleanup = closeDisplayedIronCladNotifications({
      notificationIds: [targetId, targetId],
      scope: "player",
    });
    void cleanup.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledOnce());

    expect(worker.getRegistration).toHaveBeenCalledWith("/");
    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        type: "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS",
        notificationIds: [targetId],
        scope: "player",
      },
      [expect.any(TestMessagePort)]
    );
    expect(settled).toBe(false);

    worker.reply(workerReply());
    await expect(cleanup).resolves.toEqual({
      status: "closed",
      enumerated: 1,
      matched: 1,
      closed: 1,
      remaining: 0,
    });
    expect(settled).toBe(true);
  });

  it("sends scope-only cleanup for mark-all", async () => {
    const worker = installActiveWorker();

    await closeDisplayedIronCladNotifications({ scope: "admin" });

    expect(worker.postMessage).toHaveBeenCalledWith(
      {
        type: "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS",
        scope: "admin",
      },
      [expect.any(TestMessagePort)]
    );
  });

  it("rejects malformed durable ids before messaging the worker", async () => {
    const worker = installActiveWorker();

    await expect(
      closeDisplayedIronCladNotifications({
        notificationIds: [
          "11111111-1111-4111-8111-111111111111",
          "not-a-notification-id",
        ],
      })
    ).resolves.toEqual(
      expect.objectContaining({ status: "invalid_request" })
    );

    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it("contains unavailable registration and worker messaging failures", async () => {
    const getRegistration = vi
      .fn()
      .mockRejectedValue(new Error("NOTIFICATION_INSPECTION_FAILED"));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration },
    });

    await expect(closeDisplayedIronCladNotifications()).resolves.toEqual(
      expect.objectContaining({
        status: "registration_unavailable",
      })
    );
    const worker = installActiveWorker({ postMessageError: true });
    await expect(closeDisplayedIronCladNotifications()).resolves.toEqual(
      expect.objectContaining({ status: "message_failed" })
    );
    expect(worker.postMessage).toHaveBeenCalledOnce();
  });

  it("bounds a missing or malformed worker acknowledgement", async () => {
    vi.useFakeTimers();
    const worker = installActiveWorker({ acknowledge: false });
    const cleanup = closeDisplayedIronCladNotifications();
    await vi.advanceTimersByTimeAsync(0);
    worker.reply({ type: "UNTRUSTED_RESULT" });

    let settled = false;
    void cleanup.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1_499);
    expect(settled).toBe(false);
    await vi.runAllTimersAsync();
    await expect(cleanup).resolves.toEqual(
      expect.objectContaining({
        status: "message_timeout",
      })
    );
  });

});

class TestMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  peer: TestMessagePort | null = null;
  close = vi.fn();
  start = vi.fn();

  postMessage(data: unknown) {
    this.peer?.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

class TestMessageChannel {
  port1 = new TestMessagePort();
  port2 = new TestMessagePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

function installActiveWorker({
  acknowledge = true,
  postMessageError = false,
}: {
  acknowledge?: boolean;
  postMessageError?: boolean;
} = {}) {
  Object.defineProperty(globalThis, "MessageChannel", {
    configurable: true,
    writable: true,
    value: TestMessageChannel,
  });

  let responsePort: TestMessagePort | null = null;
  const postMessage = vi.fn(
    (_request: unknown, ports: readonly TestMessagePort[]) => {
      if (postMessageError) {
        throw new Error("POST_MESSAGE_FAILED");
      }
      responsePort = ports[0] ?? null;
      if (acknowledge) {
        responsePort?.postMessage(workerReply());
      }
    }
  );
  const active = { postMessage } as unknown as ServiceWorker;
  const matchingRegistration = {
    active,
    scope: "https://example.test/",
  } as unknown as ServiceWorkerRegistration;
  const getRegistration = vi.fn().mockResolvedValue(matchingRegistration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration,
      controller: active,
      get ready() {
        throw new Error("READY_MUST_NOT_BE_READ");
      },
    },
  });

  return {
    getRegistration,
    postMessage,
    reply(data: unknown) {
      responsePort?.postMessage(data);
    },
  };
}

function workerReply(overrides: Record<string, unknown> = {}) {
  return {
    type: CLOSE_RESULT_TYPE,
    ok: true,
    status: "closed",
    enumeratedCount: 1,
    matchedCount: 1,
    closedCount: 1,
    remainingCount: 0,
    ...overrides,
  };
}
