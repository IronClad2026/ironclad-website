// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://ironclad.example/" }

import { cleanup, render, waitFor } from "@testing-library/react";
import type { BeforeSendEvent } from "@vercel/analytics/next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analyticsPropsSpy = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => vi.fn(() => "/"));
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));

vi.mock("@vercel/analytics/next", () => ({
  Analytics: (props: unknown) => {
    analyticsPropsSpy(props);
    return <div data-testid="vercel-analytics" />;
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useSearchParams: searchParamsMock,
}));

import ConsentAwareVercelAnalytics from "@/components/analytics/ConsentAwareVercelAnalytics";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  writeAnalyticsConsent,
} from "@/lib/analytics-consent";

type CapturedAnalyticsProps = {
  beforeSend: (event: BeforeSendEvent) => BeforeSendEvent | null;
  mode: string;
};

const PLAYER_ID = "123e4567-e89b-12d3-a456-426614174000";
const TOURNAMENT_ID = "223e4567-e89b-12d3-a456-426614174000";
const MATCH_ID = "323e4567-e89b-12d3-a456-426614174000";
const POLL_ID = "423e4567-e89b-12d3-a456-426614174000";

describe("ConsentAwareVercelAnalytics", () => {
  beforeEach(() => {
    writeAnalyticsConsent("declined");
    localStorage.clear();
    analyticsPropsSpy.mockClear();
    pathnameMock.mockReturnValue("/");
    searchParamsMock.mockReturnValue(new URLSearchParams());
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ["missing", null],
    ["malformed", "yes-please"],
    ["declined", "declined"],
  ])("does not mount Analytics when consent is %s", (_, value) => {
    if (value !== null) {
      localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, value);
    }

    const view = render(<ConsentAwareVercelAnalytics enabled />);

    expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
    expect(analyticsPropsSpy).not.toHaveBeenCalled();
  });

  it("fails closed when browser preference storage is inaccessible", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });

    const view = render(<ConsentAwareVercelAnalytics enabled />);

    expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
    expect(analyticsPropsSpy).not.toHaveBeenCalled();
  });

  it("mounts Production Analytics only after an exact grant on an allowed route", () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");

    const view = render(<ConsentAwareVercelAnalytics enabled />);

    expect(view.getByTestId("vercel-analytics")).toBeInTheDocument();
    expect(getLatestAnalyticsProps().mode).toBe("production");
  });

  it.each(["Preview", "legal mismatch"])(
    "does not mount when the server-owned gate is closed for %s",
    () => {
      localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");

      const view = render(<ConsentAwareVercelAnalytics enabled={false} />);

      expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
      expect(analyticsPropsSpy).not.toHaveBeenCalled();
    }
  );

  it.each([
    "/admin?x=1",
    "/dashboard?x=1",
    "/api/test?x=1",
    "/unknown#private",
  ])("does not mount on an excluded current URL: %s", (url) => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    setCurrentRoute(url);

    const view = render(<ConsentAwareVercelAnalytics enabled />);

    expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
    expect(analyticsPropsSpy).not.toHaveBeenCalled();
  });

  it.each([
    "/about?test=1",
    "/about?source=hello%20world",
    "/about#test",
    `/tournaments?tournament=${TOURNAMENT_ID}`,
    `/players/${PLAYER_ID}?tab=history#section`,
  ])("mounts on an approved query- or hash-bearing route: %s", (url) => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    setCurrentRoute(url);

    const view = render(<ConsentAwareVercelAnalytics enabled />);

    expect(view.getByTestId("vercel-analytics")).toBeInTheDocument();
    expect(getLatestAnalyticsProps().mode).toBe("production");
  });

  it("strips query, fragment, and identifiers from outgoing pageviews", () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    render(<ConsentAwareVercelAnalytics enabled />);
    const { beforeSend } = getLatestAnalyticsProps();

    const sanitizedPlayer = beforeSend({
      type: "pageview",
      url: `https://ironclad.example/players/${PLAYER_ID}?tab=history#section`,
    });
    const sanitizedTournament = beforeSend({
      type: "pageview",
      url: `https://ironclad.example/tournaments?tournament=${TOURNAMENT_ID}&match=${MATCH_ID}&poll=${POLL_ID}#private-state`,
    });

    expect(sanitizedPlayer).toEqual({
      type: "pageview",
      url: "https://ironclad.example/players/[playerId]",
    });
    expect(sanitizedTournament).toEqual({
      type: "pageview",
      url: "https://ironclad.example/tournaments",
    });

    const serializedPayload = JSON.stringify([
      sanitizedPlayer,
      sanitizedTournament,
    ]);
    for (const discardedValue of [
      PLAYER_ID,
      TOURNAMENT_ID,
      MATCH_ID,
      POLL_ID,
      "history",
      "section",
      "private-state",
    ]) {
      expect(serializedPayload).not.toContain(discardedValue);
    }
    expect(serializedPayload).not.toMatch(/[?#]/);
  });

  it("rejects custom events and unsafe event URLs", () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    render(<ConsentAwareVercelAnalytics enabled />);
    const { beforeSend } = getLatestAnalyticsProps();

    expect(
      beforeSend({
        type: "pageview",
        url: "https://ironclad.example/about?source=public#section",
      })
    ).toEqual({
      type: "pageview",
      url: "https://ironclad.example/about",
    });
    expect(
      beforeSend({ type: "event", url: "https://ironclad.example/" })
    ).toBeNull();

    for (const url of [
      "https://ironclad.example/admin/operations?x=1",
      "https://ironclad.example/dashboard#private",
      "https://ironclad.example/api/test?x=1",
      "https://foreign.example/about?x=1",
    ]) {
      expect(beforeSend({ type: "pageview", url })).toBeNull();
    }
  });

  it("rechecks the current consent inside beforeSend", () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    render(<ConsentAwareVercelAnalytics enabled />);
    const { beforeSend } = getLatestAnalyticsProps();

    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "declined");

    expect(
      beforeSend({ type: "pageview", url: "https://ironclad.example/about" })
    ).toBeNull();
  });

  it("unmounts and reloads once after same-tab withdrawal", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const reloadCurrentPage = vi.fn();
    const view = render(
      <ConsentAwareVercelAnalytics
        enabled
        reloadCurrentPage={reloadCurrentPage}
      />
    );
    expect(view.getByTestId("vercel-analytics")).toBeInTheDocument();
    const { beforeSend } = getLatestAnalyticsProps();

    writeAnalyticsConsent("declined");

    expect(
      beforeSend({ type: "pageview", url: "https://ironclad.example/about" })
    ).toBeNull();

    await waitFor(() => {
      expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
      expect(reloadCurrentPage).toHaveBeenCalledTimes(1);
    });
  });

  it("unmounts and reloads once after cross-tab withdrawal", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const reloadCurrentPage = vi.fn();
    const view = render(
      <ConsentAwareVercelAnalytics
        enabled
        reloadCurrentPage={reloadCurrentPage}
      />
    );
    expect(view.getByTestId("vercel-analytics")).toBeInTheDocument();

    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "declined");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ANALYTICS_CONSENT_STORAGE_KEY,
        newValue: "declined",
      })
    );

    await waitFor(() => {
      expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
      expect(reloadCurrentPage).toHaveBeenCalledTimes(1);
    });
  });

  it("reloads on withdrawal after an allowed route previously loaded the runtime", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const reloadCurrentPage = vi.fn();
    const view = render(
      <ConsentAwareVercelAnalytics
        enabled
        reloadCurrentPage={reloadCurrentPage}
      />
    );
    expect(view.getByTestId("vercel-analytics")).toBeInTheDocument();

    pathnameMock.mockReturnValue("/dashboard");
    window.history.replaceState(null, "", "/dashboard");
    view.rerender(
      <ConsentAwareVercelAnalytics
        enabled
        reloadCurrentPage={reloadCurrentPage}
      />
    );
    expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();

    writeAnalyticsConsent("declined");

    await waitFor(() => {
      expect(reloadCurrentPage).toHaveBeenCalledTimes(1);
    });
  });

  it("does not create a reload loop for an existing decline", () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "declined");
    const reloadCurrentPage = vi.fn();

    render(
      <ConsentAwareVercelAnalytics
        enabled
        reloadCurrentPage={reloadCurrentPage}
      />
    );

    expect(reloadCurrentPage).not.toHaveBeenCalled();
  });

  it("fails closed without reloading when withdrawal cannot be persisted", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const reloadCurrentPage = vi.fn();
    const view = render(
      <ConsentAwareVercelAnalytics
        enabled
        reloadCurrentPage={reloadCurrentPage}
      />
    );
    expect(view.getByTestId("vercel-analytics")).toBeInTheDocument();

    const blockedStorage = {
      getItem: () => "granted",
      setItem: () => {
        throw new Error("Storage blocked");
      },
      removeItem: () => {
        throw new Error("Storage blocked");
      },
    };
    expect(
      writeAnalyticsConsent("declined", blockedStorage, window)
    ).toBe(false);

    await waitFor(() => {
      expect(view.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
    });
    expect(reloadCurrentPage).not.toHaveBeenCalled();
  });

  it("contains no custom-event, fetch, or beacon implementation", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "components/analytics/ConsentAwareVercelAnalytics.tsx"
      ),
      "utf8"
    );

    expect(source).not.toMatch(/\btrack\s*\(/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/sendBeacon/);
  });
});

function getLatestAnalyticsProps() {
  const latestCall = analyticsPropsSpy.mock.calls.at(-1);
  if (!latestCall) throw new Error("Analytics was not rendered");

  return latestCall[0] as CapturedAnalyticsProps;
}

function setCurrentRoute(url: string) {
  window.history.replaceState(null, "", url);
  const currentUrl = new URL(url, window.location.origin);
  pathnameMock.mockReturnValue(currentUrl.pathname);
  searchParamsMock.mockReturnValue(currentUrl.searchParams);
}
