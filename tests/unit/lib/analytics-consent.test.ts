// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_CONSENT_CHANGE_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  parseAnalyticsConsentDecision,
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analytics-consent";

describe("analytics consent storage", () => {
  beforeEach(() => {
    writeAnalyticsConsent("declined");
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the exact minimal key and allowlisted raw values", () => {
    expect(ANALYTICS_CONSENT_STORAGE_KEY).toBe(
      "ironclad_analytics_consent"
    );
    expect(parseAnalyticsConsentDecision("granted")).toBe("granted");
    expect(parseAnalyticsConsentDecision("declined")).toBe("declined");

    for (const invalid of [
      undefined,
      null,
      "",
      "accepted",
      "denied",
      "GRANTED",
      { decision: "granted" },
    ]) {
      expect(parseAnalyticsConsentDecision(invalid)).toBeNull();
    }
  });

  it("stores no identifier, locale, route, or timestamp", () => {
    expect(writeAnalyticsConsent("granted")).toBe(true);

    expect(localStorage).toHaveLength(1);
    expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      "granted"
    );
    expect(readAnalyticsConsent()).toBe("granted");

    expect(writeAnalyticsConsent("declined")).toBe(true);
    expect(localStorage).toHaveLength(1);
    expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe(
      "declined"
    );
    expect(readAnalyticsConsent()).toBe("declined");
  });

  it("fails closed for missing, malformed, and unreadable storage", () => {
    expect(readAnalyticsConsent()).toBeNull();

    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "stale-version");
    expect(readAnalyticsConsent()).toBeNull();

    const unreadableStorage = {
      getItem: vi.fn(() => {
        throw new Error("Storage blocked");
      }),
    };
    expect(readAnalyticsConsent(unreadableStorage)).toBeNull();
  });

  it("notifies this tab after a successful decision and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAnalyticsConsent(listener);

    expect(writeAnalyticsConsent("granted")).toBe(true);
    expect(listener).toHaveBeenLastCalledWith("granted");

    expect(writeAnalyticsConsent("declined")).toBe(true);
    expect(listener).toHaveBeenLastCalledWith("declined");

    unsubscribe();
    window.dispatchEvent(
      new CustomEvent(ANALYTICS_CONSENT_CHANGE_EVENT, {
        detail: "granted",
      })
    );
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("observes cross-tab decisions, invalidation, and storage clearing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAnalyticsConsent(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ANALYTICS_CONSENT_STORAGE_KEY,
        newValue: "granted",
      })
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ANALYTICS_CONSENT_STORAGE_KEY,
        newValue: "invalid",
      })
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "unrelated",
        newValue: "granted",
      })
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: null, newValue: null })
    );

    expect(listener.mock.calls).toEqual([
      ["granted"],
      [null],
      [null],
    ]);
    unsubscribe();
  });

  it("invalidates the current tab when a storage write fails", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAnalyticsConsent(listener);
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const blockedStorage = {
      getItem: vi.fn(() => "granted"),
      setItem: vi.fn(() => {
        throw new Error("Storage blocked");
      }),
      removeItem: vi.fn(() => {
        throw new Error("Storage blocked");
      }),
    };

    expect(writeAnalyticsConsent("declined", blockedStorage)).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(readAnalyticsConsent()).toBeNull();

    expect(writeAnalyticsConsent("declined")).toBe(true);
    expect(readAnalyticsConsent()).toBe("declined");
    unsubscribe();
  });
});
