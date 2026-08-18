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
  steam_id64: "18446744073709551614",
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
    "steam_id64",
    "country",
    "region",
    "timezone",
  ] as const)("still requires %s", (field) => {
    expect(
      isPlayerProfileComplete({ ...completeProfile, [field]: null })
    ).toBe(false);
  });

  it("does not require Discord contact details", () => {
    expect(isPlayerProfileComplete(completeProfile)).toBe(true);
    expect(isPlayerProfileTournamentReady(completeProfile, true)).toBe(true);
  });

  it("requires verified Steam identity rather than a Steam display name", () => {
    const legacyDisplayNameOnly = {
      ...completeProfile,
      steam_id64: null,
      steam_username: "Legacy manual Steam name",
    };

    expect(isPlayerProfileComplete(completeProfile)).toBe(true);
    expect(isPlayerProfileComplete(legacyDisplayNameOnly)).toBe(false);
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
