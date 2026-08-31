// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TournamentMediaAdminItem } from "@/lib/tournament-media";

const createTournamentMediaMock = vi.hoisted(() => vi.fn());
const updateTournamentMediaMock = vi.hoisted(() => vi.fn());
const setTournamentMediaPublishedMock = vi.hoisted(() => vi.fn());
const removeTournamentMediaMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/admin/tournaments/media-actions", () => ({
  createTournamentMedia: createTournamentMediaMock,
  updateTournamentMedia: updateTournamentMediaMock,
  setTournamentMediaPublished: setTournamentMediaPublishedMock,
  removeTournamentMedia: removeTournamentMediaMock,
}));

import AdminTournamentMedia from "@/components/admin/tournaments/AdminTournamentMedia";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const matchId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const item: TournamentMediaAdminItem = {
  id: mediaId,
  tournamentId,
  title: "Grand Final Cast",
  url: "https://video.example/final",
  mediaType: "match_cast",
  description: "Official Grand Final broadcast.",
  matchId,
  published: false,
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T01:00:00.000Z",
};

function renderMedia(items: TournamentMediaAdminItem[] = []) {
  return render(
    <AdminTournamentMedia
      tournamentId={tournamentId}
      tournamentTitle="IronClad Championship"
      items={items}
      matchOptions={[{ id: matchId, label: "Main / Pro · Match 7" }]}
      loadFailed={false}
    />
  );
}

describe("AdminTournamentMedia", () => {
  beforeEach(() => {
    createTournamentMediaMock.mockReset();
    updateTournamentMediaMock.mockReset();
    setTournamentMediaPublishedMock.mockReset();
    removeTournamentMediaMock.mockReset();
    refreshMock.mockReset();
    createTournamentMediaMock.mockResolvedValue({ ok: true });
    updateTournamentMediaMock.mockResolvedValue({ ok: true });
    setTournamentMediaPublishedMock.mockResolvedValue({ ok: true });
    removeTournamentMediaMock.mockResolvedValue({ ok: true });
  });

  afterEach(cleanup);

  it("opens a touch-safe create form with hidden publication as the default", async () => {
    renderMedia();

    fireEvent.click(screen.getByRole("button", { name: "Add Media" }));

    const title = screen.getByLabelText("Title");
    const url = screen.getByLabelText("URL");
    const type = screen.getByLabelText("Type");
    const match = screen.getByLabelText("Associated Match (optional)");
    const publication = screen.getByLabelText("Publication state");
    expect(publication).toHaveValue("hidden");
    expect(url).toHaveAttribute("pattern", "https://.*");
    expect(url).toHaveAccessibleDescription(
      "Use a complete HTTPS link beginning with https://."
    );
    expect(match).toHaveTextContent("Main / Pro · Match 7");
    expect(screen.getByRole("button", { name: "Save Media" })).toHaveClass(
      "min-h-11"
    );

    fireEvent.change(title, { target: { value: "Tournament recap" } });
    fireEvent.change(url, {
      target: { value: "https://video.example/recap" },
    });
    fireEvent.change(type, { target: { value: "video" } });
    fireEvent.change(match, { target: { value: matchId } });
    fireEvent.submit(title.closest("form")!);

    await waitFor(() =>
      expect(createTournamentMediaMock).toHaveBeenCalledWith({
        mediaId: null,
        tournamentId,
        title: "Tournament recap",
        url: "https://video.example/recap",
        mediaType: "video",
        description: null,
        matchId,
        published: false,
      })
    );
    expect(refreshMock).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add Media" })).toHaveFocus()
    );
  });

  it("keeps edit and publication controls separate", async () => {
    renderMedia([item]);

    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByText("Main / Pro · Match 7")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish Grand Final Cast" })
    );

    await waitFor(() =>
      expect(setTournamentMediaPublishedMock).toHaveBeenCalledWith({
        mediaId,
        tournamentId,
        published: true,
      })
    );

    const editButton = screen.getByRole("button", {
      name: "Edit Grand Final Cast",
    });
    fireEvent.click(editButton);
    expect(screen.getByLabelText("Title")).toHaveValue("Grand Final Cast");
    expect(screen.getByLabelText("Publication state")).toHaveValue("hidden");
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(editButton).toHaveFocus());
  });

  it("requires an explicit inline confirmation before removal", async () => {
    renderMedia([item]);

    const removeButton = screen.getByRole("button", {
      name: "Remove Grand Final Cast",
    });
    fireEvent.click(removeButton);
    expect(removeTournamentMediaMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("group", { name: "Remove Grand Final Cast" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm Remove" })).toHaveFocus()
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(removeButton).toHaveFocus());

    fireEvent.click(removeButton);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Remove" }));

    await waitFor(() =>
      expect(removeTournamentMediaMock).toHaveBeenCalledWith({
        mediaId,
        tournamentId,
      })
    );
    expect(refreshMock).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add Media" })).toHaveFocus()
    );
  });

  it("distinguishes a load failure from an empty media list", () => {
    const { rerender } = render(
      <AdminTournamentMedia
        tournamentId={tournamentId}
        tournamentTitle="IronClad Championship"
        items={[]}
        matchOptions={[]}
        loadFailed
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tournament media could not be loaded"
    );
    expect(screen.getByRole("button", { name: "Add Media" })).toBeDisabled();
    expect(screen.queryByText("No Tournament media links")).not.toBeInTheDocument();

    rerender(
      <AdminTournamentMedia
        tournamentId={tournamentId}
        tournamentTitle="IronClad Championship"
        items={[]}
        matchOptions={[]}
        loadFailed={false}
      />
    );
    expect(screen.getByText("No Tournament media links have been added yet."))
      .toBeInTheDocument();
  });
});
