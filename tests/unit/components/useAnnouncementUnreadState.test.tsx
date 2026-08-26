// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadAnnouncementNavigationStateMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/announcements/actions", () => ({
  loadAnnouncementNavigationState: loadAnnouncementNavigationStateMock,
}));

import { useAnnouncementUnreadState } from "@/components/useAnnouncementUnreadState";
import { ANNOUNCEMENT_SEEN_RECONCILE_EVENT } from "@/lib/announcement-contract";

const LATEST_ANNOUNCEMENT = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  publishedAt: "2026-08-26T00:00:00.000Z",
};

function UnreadProbe({
  isSignedIn,
}: {
  isSignedIn: boolean | undefined;
}) {
  const unread = useAnnouncementUnreadState({
    isLoaded: true,
    isSignedIn,
    pathname: "/dashboard",
  });

  return <output data-unread={String(unread)}>{String(unread)}</output>;
}

describe("useAnnouncementUnreadState auth boundaries", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("does not carry anonymous unread truth into a signed-in session when reconciliation fails", async () => {
    loadAnnouncementNavigationStateMock.mockResolvedValueOnce({
      ok: true,
      viewer: "anonymous",
      latest: LATEST_ANNOUNCEMENT,
    });
    const view = render(<UnreadProbe isSignedIn={false} />);

    await waitFor(() => {
      expect(screen.getByText("true")).toHaveAttribute("data-unread", "true");
    });

    loadAnnouncementNavigationStateMock.mockResolvedValue({ ok: false });
    view.rerender(<UnreadProbe isSignedIn />);

    expect(screen.getByText("false")).toHaveAttribute("data-unread", "false");
    await waitFor(() => {
      expect(loadAnnouncementNavigationStateMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("false")).toHaveAttribute("data-unread", "false");
  });

  it("does not carry authenticated unread truth into signed-out browsing when reconciliation fails", async () => {
    loadAnnouncementNavigationStateMock.mockResolvedValueOnce({
      ok: true,
      viewer: "authenticated",
      latest: LATEST_ANNOUNCEMENT,
      unread: true,
    });
    const view = render(<UnreadProbe isSignedIn />);

    await waitFor(() => {
      expect(screen.getByText("true")).toHaveAttribute("data-unread", "true");
    });

    loadAnnouncementNavigationStateMock.mockResolvedValue({ ok: false });
    view.rerender(<UnreadProbe isSignedIn={false} />);

    expect(screen.getByText("false")).toHaveAttribute("data-unread", "false");
    await waitFor(() => {
      expect(loadAnnouncementNavigationStateMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("false")).toHaveAttribute("data-unread", "false");
  });

  it("restarts a reconciliation event queued after the loop exits but before cleanup", async () => {
    let resolveFirstLoad: (
      result: {
        ok: true;
        viewer: "anonymous";
        latest: typeof LATEST_ANNOUNCEMENT;
      }
    ) => void = () => undefined;
    const firstLoad = new Promise<{
      ok: true;
      viewer: "anonymous";
      latest: typeof LATEST_ANNOUNCEMENT;
    }>((resolve) => {
      resolveFirstLoad = resolve;
    });

    loadAnnouncementNavigationStateMock
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValue({
        ok: true,
        viewer: "anonymous",
        latest: null,
      });
    render(<UnreadProbe isSignedIn={false} />);

    await waitFor(() => {
      expect(loadAnnouncementNavigationStateMock).toHaveBeenCalledTimes(1);
    });

    const dispatchAtPromiseBoundary = firstLoad.then(() => {
      window.dispatchEvent(
        new Event(ANNOUNCEMENT_SEEN_RECONCILE_EVENT)
      );
    });

    await act(async () => {
      resolveFirstLoad({
        ok: true,
        viewer: "anonymous",
        latest: LATEST_ANNOUNCEMENT,
      });
      await dispatchAtPromiseBoundary;
    });

    await waitFor(() => {
      expect(loadAnnouncementNavigationStateMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText("false")).toHaveAttribute(
        "data-unread",
        "false"
      );
    });
  });
});
