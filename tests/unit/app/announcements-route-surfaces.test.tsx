// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRequestLocaleMock = vi.hoisted(() => vi.fn());
const loadDictionaryMock = vi.hoisted(() => vi.fn());
const loadPublicAnnouncementsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: getRequestLocaleMock,
}));
vi.mock("@/lib/i18n/loaders", () => ({
  loadDictionary: loadDictionaryMock,
}));
vi.mock("@/lib/announcements", () => ({
  loadPublicAnnouncements: loadPublicAnnouncementsMock,
}));
vi.mock("@/components/AnnouncementsFeed", () => ({
  default: () => <section data-testid="announcements-feed" />,
}));

import AnnouncementsLoading from "@/app/announcements/loading";
import AnnouncementsPage from "@/app/announcements/page";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import englishPublic from "@/lib/i18n/dictionaries/en/public";
import italianCommon from "@/lib/i18n/dictionaries/it/common";

describe("Announcements route surfaces", () => {
  beforeEach(() => {
    getRequestLocaleMock.mockResolvedValue("en");
    loadDictionaryMock.mockResolvedValue(englishPublic);
    loadPublicAnnouncementsMock.mockResolvedValue({
      ok: true,
      announcements: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("owns an isolated black page background behind the decorative glow", async () => {
    render(await AnnouncementsPage());

    expect(screen.getByRole("main")).toHaveClass("isolate", "bg-black");
    expect(screen.getByTestId("announcements-feed")).toBeInTheDocument();
  });

  it("announces localized loading state without motion when requested", () => {
    render(
      <LocaleProvider locale="it" dictionaries={{ common: italianCommon }}>
        <AnnouncementsLoading />
      </LocaleProvider>
    );

    const main = screen.getByRole("main");
    const skeleton = main.querySelector('[aria-hidden="true"]');

    expect(main).toHaveAttribute("aria-busy", "true");
    expect(main).toHaveAttribute("aria-live", "polite");
    expect(main).toHaveClass("isolate", "bg-black");
    expect(screen.getByText(italianCommon.errors.loading)).toHaveClass(
      "sr-only"
    );
    expect(skeleton).toHaveClass(
      "animate-pulse",
      "motion-reduce:animate-none"
    );
  });
});
