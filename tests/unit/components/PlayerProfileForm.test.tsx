// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayerProfileForm from "@/components/PlayerProfileForm";
import type { PlayerProfile } from "@/lib/player-profile";

vi.mock("@/app/profile/actions", () => ({
  savePlayerProfile: vi.fn(),
}));

const profile: PlayerProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  clerk_user_id: "user_profile_form",
  display_name: "Profile Tester",
  in_game_name: "ProfileTester",
  discord_username: "profile-tester",
  steam_username: "鋼鉄の司令官 ✨",
  coh3_player_card_url: "https://coh3stats.com/players/legacy-value",
  country: "Australia",
  region: "Oceania",
  timezone: "Australia/Sydney",
  current_elo: 4999,
  avatar_url: null,
  bio: null,
  profile_completed: true,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("PlayerProfileForm Relic cutover", () => {
  afterEach(() => {
    cleanup();
  });

  it("removes the CoH3 URL control and displays only verified ELO read-only", () => {
    render(
      <PlayerProfileForm
        profile={profile}
        verifiedCurrentElo={1375}
        activeTournamentEloSnapshots={[
          {
            tournamentTitle: "IronClad August Open",
            elo: 1300,
            division: "Challenge",
          },
        ]}
      />
    );

    expect(
      screen.queryByText("CoH3 Player Card URL")
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[name="coh3PlayerCardUrl"]')
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[name="currentElo"]')
    ).not.toBeInTheDocument();

    const currentElo = screen.getByLabelText("Current ELO");
    expect(currentElo.tagName).toBe("OUTPUT");
    expect(currentElo).toHaveTextContent("1375");
    expect(currentElo).not.toHaveAttribute("name");
    expect(currentElo).not.toHaveTextContent("4999");
    expect(
      screen.getByRole("button", {
        name: "View active tournament ELO snapshots",
      })
    ).toBeInTheDocument();
  });

  it("displays the synchronized Steam Display Name as read-only", () => {
    render(
      <PlayerProfileForm
        profile={profile}
        verifiedCurrentElo={1375}
        activeTournamentEloSnapshots={[]}
      />
    );

    const steamDisplayName = screen.getByLabelText("Steam Display Name");

    expect(steamDisplayName.tagName).toBe("OUTPUT");
    expect(steamDisplayName).toHaveTextContent("鋼鉄の司令官 ✨");
    expect(steamDisplayName).not.toHaveAttribute("name");
    expect(screen.queryByLabelText("Steam Username")).not.toBeInTheDocument();
    expect(
      document.querySelector('input[name="steamUsername"]')
    ).not.toBeInTheDocument();
  });

  it("displays N/A when no successful Relic verification exists", () => {
    render(
      <PlayerProfileForm
        profile={profile}
        verifiedCurrentElo={null}
        activeTournamentEloSnapshots={[]}
      />
    );

    expect(screen.getByLabelText("Current ELO")).toHaveTextContent("N/A");
    expect(
      screen.queryByRole("button", {
        name: "View active tournament ELO snapshots",
      })
    ).not.toBeInTheDocument();
  });

  it("presents Discord contact as optional", () => {
    render(
      <PlayerProfileForm
        profile={profile}
        verifiedCurrentElo={1375}
        activeTournamentEloSnapshots={[]}
      />
    );

    const discordUsername = document.querySelector<HTMLInputElement>(
      'input[name="discordUsername"]'
    );

    expect(discordUsername).not.toBeNull();
    expect(discordUsername).not.toBeRequired();
    expect(discordUsername).toHaveAttribute("maxlength", "100");
    expect(screen.getByText("Discord Username (optional)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Discord is optional but strongly recommended for coordination. Public visibility is controlled separately from your dashboard."
      )
    ).toBeInTheDocument();
  });

  it("states the 4 MiB avatar application boundary", () => {
    render(
      <PlayerProfileForm
        profile={profile}
        verifiedCurrentElo={1375}
        activeTournamentEloSnapshots={[]}
      />
    );

    expect(
      screen.getByText(/Maximum file size\s+4 MiB\./)
    ).toBeInTheDocument();
  });

  it("rejects a client-selected avatar over 4 MiB with matching copy", () => {
    render(
      <PlayerProfileForm
        profile={profile}
        verifiedCurrentElo={1375}
        activeTournamentEloSnapshots={[]}
      />
    );
    const avatarInput = document.querySelector<HTMLInputElement>(
      'input[name="avatar"]'
    );

    expect(avatarInput).not.toBeNull();
    fireEvent.change(avatarInput!, {
      target: {
        files: [
          new File([new Uint8Array(4 * 1024 * 1024 + 1)], "avatar.png", {
            type: "image/png",
          }),
        ],
      },
    });

    expect(
      screen.getByText("Avatar image must be 4 MiB or smaller.")
    ).toBeInTheDocument();
    expect(avatarInput).toHaveValue("");
  });
});
