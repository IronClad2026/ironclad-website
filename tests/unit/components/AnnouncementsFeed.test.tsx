// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.hoisted(() => vi.fn());
const markAnnouncementSeenMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/announcements/actions", () => ({
  markAnnouncementSeen: markAnnouncementSeenMock,
}));

import AnnouncementsFeed from "@/components/AnnouncementsFeed";
import englishPublic from "@/lib/i18n/dictionaries/en/public";
import {
  ANNOUNCEMENT_SEEN_STORAGE_KEY,
  type PublicAnnouncement,
} from "@/lib/announcement-contract";

const copy = englishPublic.announcements;
const latest: PublicAnnouncement = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  title: "<b>Launch update</b>",
  body: "Line one\nLine two",
  publishedAt: "2026-08-26T02:30:00.000Z",
  mediaKind: "image",
  mediaMimeType: "image/jpeg",
  mediaDescription: "Orange IronClad shield on a dark field",
  mediaUrl: "https://example.supabase.co/storage/v1/object/public/announcement-media/media/223e4567-e89b-42d3-a456-426614174000.jpg",
  tournamentHref: null,
};
const video: PublicAnnouncement = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Short briefing",
  body: "Video update",
  publishedAt: "2026-08-25T02:30:00.000Z",
  mediaKind: "video",
  mediaMimeType: "video/webm",
  mediaDescription: "Admin briefing with captions",
  mediaUrl: "https://example.supabase.co/storage/v1/object/public/announcement-media/media/123e4567-e89b-42d3-a456-426614174000.webm",
  tournamentHref: null,
};

describe("AnnouncementsFeed", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    markAnnouncementSeenMock.mockResolvedValue({ ok: true });
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps a load failure distinct from the empty state and retries", () => {
    render(
      <AnnouncementsFeed announcements={[]} copy={copy} loadFailed />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(copy.loadErrorTitle);
    expect(screen.queryByText(copy.emptyTitle)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("renders a clean empty state without recording a marker", () => {
    render(
      <AnnouncementsFeed announcements={[]} copy={copy} loadFailed={false} />
    );
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
    expect(localStorage.getItem(ANNOUNCEMENT_SEEN_STORAGE_KEY)).toBeNull();
  });

  it("renders plain authored content, accessible media, and date plus time", async () => {
    render(
      <AnnouncementsFeed
        announcements={[latest, video]}
        copy={copy}
        loadFailed={false}
      />
    );

    expect(screen.getByRole("heading", { name: latest.title })).toBeInTheDocument();
    expect(document.querySelector("article b")).toBeNull();
    expect(screen.getByText(/Line one/)).toHaveClass("whitespace-pre-wrap");
    expect(
      screen.getByRole("img", { name: latest.mediaDescription ?? "" })
    ).toHaveAttribute("src", latest.mediaUrl);
    const player = screen.getByLabelText(video.mediaDescription ?? "");
    expect(player.tagName).toBe("VIDEO");
    expect(player).toHaveAttribute("controls");
    expect(player).toHaveAttribute("preload", "metadata");
    expect(document.querySelectorAll("time")).toHaveLength(2);
    expect(document.querySelector("time")).toHaveAttribute(
      "datetime",
      latest.publishedAt
    );

    await waitFor(() => {
      const stored = localStorage.getItem(ANNOUNCEMENT_SEEN_STORAGE_KEY);
      expect(stored).toContain(latest.id);
    });
    expect(markAnnouncementSeenMock).not.toHaveBeenCalled();
  });

  it("uses only authenticated server state while signed in", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    localStorage.setItem(
      ANNOUNCEMENT_SEEN_STORAGE_KEY,
      JSON.stringify(video)
    );

    render(
      <AnnouncementsFeed
        announcements={[latest]}
        copy={copy}
        loadFailed={false}
      />
    );

    await waitFor(() => {
      expect(markAnnouncementSeenMock).toHaveBeenCalledWith(latest.id);
    });
    expect(localStorage.getItem(ANNOUNCEMENT_SEEN_STORAGE_KEY)).toContain(
      video.id
    );
  });

  it("shows a localized canonical CTA only for a linked Tournament", () => {
    const linked = {
      ...latest,
      tournamentHref: "/tournaments?tournament=academy-owner-check",
    };
    const view = render(
      <AnnouncementsFeed
        announcements={[linked]}
        copy={copy}
        loadFailed={false}
      />
    );

    expect(
      screen.getByRole("link", { name: copy.viewTournament })
    ).toHaveAttribute(
      "href",
      "/tournaments?tournament=academy-owner-check"
    );

    view.rerender(
      <AnnouncementsFeed
        announcements={[latest]}
        copy={copy}
        loadFailed={false}
      />
    );
    expect(
      screen.queryByRole("link", { name: copy.viewTournament })
    ).not.toBeInTheDocument();
  });

  it("leaves the feed usable when localStorage is blocked", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    render(
      <AnnouncementsFeed
        announcements={[latest]}
        copy={copy}
        loadFailed={false}
      />
    );
    expect(screen.getByRole("heading", { name: latest.title })).toBeVisible();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
