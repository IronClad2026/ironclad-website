// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicPlayerStats from "@/components/PublicPlayerStats";
import type { PublicPlayerProfile } from "@/lib/public-players";

vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

const player: PublicPlayerProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Public Tester",
  playerName: "PublicTester",
  country: "Australia",
  region: "Oceania",
  currentElo: 1550,
  publicProfileEnabled: true,
  discordPublicEnabled: false,
  discordUsername: null,
  hasAvatar: false,
  avatarUrl: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("PublicPlayerStats active tournament ELO snapshot", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not add an indicator without an active registration", () => {
    render(
      <PublicPlayerStats
        player={player}
        activeTournamentEloSnapshots={[]}
      />
    );

    expect(screen.getByText("1,550")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "View active tournament ELO snapshots",
      })
    ).not.toBeInTheDocument();
  });

  it("keeps Current ELO live while showing the frozen registration ELO", () => {
    render(
      <PublicPlayerStats
        player={player}
        activeTournamentEloSnapshots={[
          {
            tournamentTitle: "IronClad August Open",
            elo: 1325,
            division: "Challenge",
          },
        ]}
      />
    );
    const button = screen.getByRole("button", {
      name: "View active tournament ELO snapshots",
    });

    expect(screen.getByText("1,550")).toBeInTheDocument();
    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Snapshot ELO: 1325"
    );
  });
});
