// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AdminTournamentReplayArchive from "@/components/admin/tournaments/AdminTournamentReplayArchive";
import type { AdminTournamentReplayArchive as ReplayArchive } from "@/lib/admin-replay-archive";

const replayHref =
  "/api/match-proofs/11111111-1111-4111-8111-111111111111/submission/22222222-2222-4222-8222-222222222222/replay";

const archive: ReplayArchive = {
  tournamentId: "33333333-3333-4333-8333-333333333333",
  tournamentTitle: "Summer Open",
  officialCount: 1,
  auditCount: 1,
  items: [
    {
      key: "official-game",
      category: "official",
      categoryLabel: "Official · Opponent confirmed",
      divisionName: "Academy",
      divisionOrder: 0,
      roundName: "Semifinal",
      roundNumber: 2,
      matchNumber: 3,
      playerOneName: "Alpha",
      playerTwoName: "Bravo",
      scoreLabel: "2–1",
      matchStatus: "completed",
      replayLabel: "Game 1",
      evidenceSource: "Modern per-game",
      submittedAt: "2026-08-01T00:00:00.000Z",
      finalizedAt: "2026-08-01T00:30:00.000Z",
      downloadHref: replayHref,
    },
    {
      key: "audit-game",
      category: "disputed",
      categoryLabel: "Disputed evidence",
      divisionName: "Academy",
      divisionOrder: 0,
      roundName: "Semifinal",
      roundNumber: 2,
      matchNumber: 3,
      playerOneName: "Alpha",
      playerTwoName: "Bravo",
      scoreLabel: "2–1",
      matchStatus: "pending_review",
      replayLabel: "Game 2",
      evidenceSource: "Modern per-game",
      submittedAt: "2026-08-01T01:00:00.000Z",
      finalizedAt: null,
      downloadHref: `${replayHref}-audit`,
    },
  ],
};

describe("AdminTournamentReplayArchive", () => {
  afterEach(cleanup);

  it("shows official casting evidence first and keeps audit evidence collapsed", () => {
    const { container } = render(
      <AdminTournamentReplayArchive archive={archive} />
    );

    expect(
      screen.getByRole("heading", { name: "Replay Archive" })
    ).toBeInTheDocument();
    expect(screen.getByText("Official casting replays")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha vs Bravo")).toHaveLength(2);

    const officialLink = screen.getAllByRole("link", {
      name: "Download Replay",
    })[0];
    expect(officialLink).toHaveAttribute("href", replayHref);
    expect(officialLink).toHaveAttribute("download");
    expect(officialLink).toHaveClass("min-h-11");

    const auditDetails = container.querySelector(
      "details[data-replay-audit-evidence]"
    );
    expect(auditDetails).not.toHaveAttribute("open");
    expect(within(auditDetails as HTMLElement).getByText("Disputed · 1"))
      .toBeInTheDocument();
  });

  it("renders safe load and empty states without any Storage details", () => {
    const { rerender } = render(
      <AdminTournamentReplayArchive archive={null} loadError />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Replay Archive unavailable"
    );
    expect(document.body.textContent).not.toContain("replay_storage_path");

    rerender(<AdminTournamentReplayArchive archive={null} />);
    expect(screen.getByText(/Select an available Tournament/)).toBeInTheDocument();
  });
});
