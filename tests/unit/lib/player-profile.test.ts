import { describe, expect, it } from "vitest";
import {
  isPlayerProfileComplete,
  isPlayerProfileTournamentReady,
  type PlayerProfileCompletionData,
} from "@/lib/player-profile";

const completeProfile: PlayerProfileCompletionData = {
  avatar_url: "/api/players/player-1/avatar",
  display_name: "Test Player",
  in_game_name: "TestPlayer",
  discord_username: "test-player",
  steam_username: "steam-display-name",
  country: "Australia",
  region: "Oceania",
  timezone: "Australia/Sydney",
};

describe("player profile completion", () => {
  it("does not require a CoH3 Player Card URL or Current ELO", () => {
    expect(isPlayerProfileComplete(completeProfile)).toBe(true);
    expect(isPlayerProfileTournamentReady(completeProfile, true)).toBe(true);
  });

  it.each([
    "avatar_url",
    "discord_username",
    "steam_username",
    "country",
    "region",
    "timezone",
  ] as const)("still requires %s", (field) => {
    expect(
      isPlayerProfileComplete({ ...completeProfile, [field]: null })
    ).toBe(false);
  });

  it("preserves the existing display-name-or-IGN identity rule", () => {
    expect(
      isPlayerProfileComplete({ ...completeProfile, display_name: "" })
    ).toBe(true);
    expect(
      isPlayerProfileComplete({ ...completeProfile, in_game_name: "" })
    ).toBe(true);
    expect(
      isPlayerProfileComplete({
        ...completeProfile,
        display_name: "",
        in_game_name: "",
      })
    ).toBe(false);
  });
});
