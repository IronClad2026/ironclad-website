// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicPlayerCard from "@/components/PublicPlayerCard";
import type { PublicPlayerProfile } from "@/lib/public-players";

const player: PublicPlayerProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Test Commander",
  playerName: "IronTester",
  country: "Australia",
  region: "Oceania",
  currentElo: 1450,
  publicProfileEnabled: true,
  discordPublicEnabled: false,
  discordUsername: null,
  hasAvatar: true,
  avatarUrl: "/players/11111111-1111-4111-8111-111111111111/avatar",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("PublicPlayerCard", () => {
  it("renders the public projection without advertising private Discord data", () => {
    render(<PublicPlayerCard player={player} />);

    expect(
      screen.getByRole("link", { name: /IronTester avatar/i })
    ).toHaveAttribute("href", `/players/${player.id}`);
    expect(screen.getByText("IronTester")).toBeInTheDocument();
    expect(screen.getByText("1450")).toBeInTheDocument();
    expect(
      screen.queryByText("Discord contact available")
    ).not.toBeInTheDocument();
  });

  it("advertises Discord availability only after opt-in", () => {
    render(
      <PublicPlayerCard
        player={{
          ...player,
          discordPublicEnabled: true,
          discordUsername: "safe-public-name",
        }}
      />
    );

    expect(
      screen.getByText("Discord contact available")
    ).toBeInTheDocument();
    expect(screen.queryByText("safe-public-name")).not.toBeInTheDocument();
  });
});
