// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAuthoritativeAppBadge,
  NOTIFICATION_BADGE_RECONCILE_EVENT,
  requestNotificationBadgeReconciliation,
} from "@/lib/app-badge";

describe("installed-app badge helper", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "setAppBadge");
    Reflect.deleteProperty(navigator, "clearAppBadge");
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
});
