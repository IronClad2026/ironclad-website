// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathnameMock = vi.hoisted(() => vi.fn(() => "/"));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
}));

import AnalyticsConsent from "@/components/analytics/AnalyticsConsent";
import Footer from "@/components/Footer";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  writeAnalyticsConsent,
} from "@/lib/analytics-consent";
import englishCommon from "@/lib/i18n/dictionaries/en/common";

const copy = englishCommon.analyticsConsent;

describe("AnalyticsConsent", () => {
  beforeEach(() => {
    writeAnalyticsConsent("declined");
    localStorage.clear();
    pathnameMock.mockReturnValue("/");
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  it("offers equally prominent allow and decline controls without loading analytics", async () => {
    render(<AnalyticsConsent copy={copy} />);

    const banner = await screen.findByRole("region", { name: copy.title });
    const allow = screen.getByRole("button", { name: copy.allow });
    const decline = screen.getByRole("button", { name: copy.decline });

    expect(banner).toBeInTheDocument();
    expect(allow).toHaveClass(
      "min-h-11",
      "w-full",
      "border-orange-400",
      "bg-orange-500/10",
      "text-orange-100"
    );
    expect(decline).toHaveClass(
      "min-h-11",
      "w-full",
      "border-orange-400",
      "bg-orange-500/10",
      "text-orange-100"
    );
    expect(screen.getByRole("link", { name: copy.privacyLink })).toHaveAttribute(
      "href",
      "/privacy"
    );

    fireEvent.click(decline);

    await waitFor(() => {
      expect(
        localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
      ).toBe("declined");
      expect(screen.queryByRole("region", { name: copy.title })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: copy.choices })).toHaveFocus();
    });

    const source = readFileSync(
      resolve(process.cwd(), "components/analytics/AnalyticsConsent.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/@vercel\/analytics|<Analytics\b|fetch\(/);
  });

  it("does not send or inject analytics when either choice is saved", async () => {
    const fetchMock = vi.fn();
    const sendBeaconMock = vi.fn();
    const originalSendBeacon = Object.getOwnPropertyDescriptor(
      navigator,
      "sendBeacon"
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconMock,
    });

    try {
      const scriptsBefore = document.querySelectorAll("script").length;
      const view = render(<AnalyticsConsent copy={copy} />);

      fireEvent.click(
        await screen.findByRole("button", { name: copy.allow })
      );
      await waitFor(() =>
        expect(
          localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
        ).toBe("granted")
      );

      view.unmount();
      localStorage.clear();
      render(<AnalyticsConsent copy={copy} />);
      fireEvent.click(
        await screen.findByRole("button", { name: copy.decline })
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(sendBeaconMock).not.toHaveBeenCalled();
      expect(document.querySelectorAll("script")).toHaveLength(scriptsBefore);
    } finally {
      if (originalSendBeacon) {
        Object.defineProperty(navigator, "sendBeacon", originalSendBeacon);
      } else {
        Reflect.deleteProperty(navigator, "sendBeacon");
      }
      vi.unstubAllGlobals();
    }
  });

  it("suppresses the first-choice banner for either stored decision", () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const { unmount } = render(<AnalyticsConsent copy={copy} />);
    expect(screen.queryByRole("region", { name: copy.title })).not.toBeInTheDocument();

    unmount();
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "declined");
    render(<AnalyticsConsent copy={copy} />);
    expect(screen.queryByRole("region", { name: copy.title })).not.toBeInTheDocument();
  });

  it("withdraws a grant, closes the modal, and restores trigger focus", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    render(<AnalyticsConsent copy={copy} />);
    const trigger = screen.getByRole("button", { name: copy.choices });

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: copy.dialogTitle });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(copy.statusGranted)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: copy.allow })).toHaveFocus();
    });
    fireEvent.click(screen.getByRole("button", { name: copy.withdraw }));

    await waitFor(() => {
      expect(
        localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
      ).toBe("declined");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("fails closed and keeps the first-choice prompt visible when saving fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    render(<AnalyticsConsent copy={copy} />);

    fireEvent.click(
      await screen.findByRole("button", { name: copy.allow })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.saveError);
    expect(screen.getByRole("region", { name: copy.title })).toBeInTheDocument();
    expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
  });

  it("handles Escape, reverse-Tab trapping, backdrop dismissal, and Privacy navigation", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "declined");
    render(<AnalyticsConsent copy={copy} />);
    const trigger = screen.getByRole("button", { name: copy.choices });

    fireEvent.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: copy.decline })).toHaveFocus()
    );

    const close = screen.getByRole("button", { name: copy.close });
    const privacy = screen.getByRole("link", { name: copy.privacyLink });
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(privacy).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByTestId("analytics-consent-backdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(trigger);
    const dialogPrivacy = screen.getByRole("link", { name: copy.privacyLink });
    dialogPrivacy.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(dialogPrivacy);
    expect(dialogPrivacy).toHaveAttribute("href", "/privacy");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("responds to same-tab and cross-tab invalidation without identifiers", async () => {
    render(<AnalyticsConsent copy={copy} />);
    expect(await screen.findByRole("region", { name: copy.title })).toBeInTheDocument();

    writeAnalyticsConsent("granted");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: copy.title })).not.toBeInTheDocument()
    );

    localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ANALYTICS_CONSENT_STORAGE_KEY,
        newValue: null,
      })
    );
    expect(await screen.findByRole("region", { name: copy.title })).toBeInTheDocument();
  });

  it("mounts a permanent localized Footer trigger outside Admin only", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "declined");
    pathnameMock.mockReturnValue("/dashboard");
    const { unmount } = render(
      <Footer
        analyticsConsentAvailable
        dictionary={englishCommon}
        ppaPath="/documents/ppa.pdf"
        rulebookPath="/documents/rulebook.pdf"
      />
    );
    expect(
      screen.getByRole("button", { name: copy.choices })
    ).toBeInTheDocument();

    unmount();
    pathnameMock.mockReturnValue("/admin/operations");
    render(
      <Footer
        analyticsConsentAvailable
        dictionary={englishCommon}
        ppaPath="/documents/ppa.pdf"
        rulebookPath="/documents/rulebook.pdf"
      />
    );
    expect(
      screen.queryByRole("button", { name: copy.choices })
    ).not.toBeInTheDocument();
  });

  it("keeps consent unavailable while the Effective corpus is still v1.0", () => {
    localStorage.clear();
    render(
      <Footer
        analyticsConsentAvailable={false}
        dictionary={englishCommon}
        ppaPath="/documents/ppa.pdf"
        rulebookPath="/documents/rulebook.pdf"
      />
    );

    expect(
      screen.queryByRole("button", { name: copy.choices })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: copy.title })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
  });
});
