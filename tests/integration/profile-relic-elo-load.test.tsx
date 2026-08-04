import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const relicEloVerificationCardMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/components/DeleteAccountSection", () => ({
  default: vi.fn(),
}));

vi.mock("@/components/PlayerProfileForm", () => ({
  default: vi.fn(),
}));

vi.mock("@/components/RelicEloVerificationCard", () => ({
  default: relicEloVerificationCardMock,
}));

vi.mock("@/components/SteamConnectionCard", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient:
    createAuthenticatedSupabaseClientMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import ProfilePage from "@/app/profile/page";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const STEAM_ID64 = "76561198012345678";
const VERIFIED_AT = "2026-08-03T23:55:00.000Z";
const LAST_ATTEMPT_AT = "2026-08-04T00:00:00.000Z";

const profileRow = {
  id: PLAYER_ID,
  clerk_user_id: playerIdentity.userId,
  display_name: "Relic Tester",
  in_game_name: "RelicTester",
  discord_username: "relic-tester",
  steam_username: "private-display-name",
  coh3_player_card_url: null,
  country: "Australia",
  region: "Oceania",
  timezone: "Australia/Sydney",
  current_elo: 1400,
  avatar_url: null,
  bio: null,
  profile_completed: false,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const protectedProfileRow = {
  steam_id64: STEAM_ID64,
  relic_verified_elo: "1675",
  relic_verified_faction: "British Forces",
  relic_verified_division: "Challenge",
  relic_elo_calculation_version: "relic-1v1-v1",
  relic_elo_verified_at: VERIFIED_AT,
  relic_elo_last_attempt_at: LAST_ATTEMPT_AT,
};

function createSingleRowClient(data: Record<string, unknown> | null) {
  const maybeSingle = vi.fn(async () => ({ data, error: null }));
  const eq = vi.fn((column: string, value: unknown) => {
    void column;
    void value;
    return { maybeSingle };
  });
  const select = vi.fn((columns: string) => {
    void columns;
    return { eq };
  });
  const from = vi.fn((table: string) => {
    void table;
    return { select };
  });

  return {
    client: { from },
    eq,
    from,
    select,
  };
}

function findElementByType(
  node: ReactNode,
  type: unknown
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, type);

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === type) {
    return node as ReactElement<Record<string, unknown>>;
  }

  return findElementByType(
    (node.props as { children?: ReactNode }).children,
    type
  );
}

describe("profile Relic ELO protected load", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(playerIdentity);
  });

  it("loads protected fields with the admin client and passes only normalized safe props", async () => {
    const profile = createSingleRowClient(profileRow);
    const protectedProfile = createSingleRowClient(protectedProfileRow);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
    createSupabaseAdminClientMock.mockReturnValue(protectedProfile.client);

    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    const card = findElementByType(page, relicEloVerificationCardMock);

    expect(card).not.toBeNull();
    expect(profile.from).toHaveBeenCalledWith("players");
    expect(profile.eq).toHaveBeenCalledWith(
      "clerk_user_id",
      playerIdentity.userId
    );
    expect(profile.select).toHaveBeenCalledOnce();
    const authenticatedSelection = profile.select.mock.calls[0][0];
    expect(authenticatedSelection).not.toContain("steam_id64");
    expect(authenticatedSelection).not.toContain("relic_verified_elo");

    expect(protectedProfile.from).toHaveBeenCalledWith("players");
    expect(protectedProfile.select).toHaveBeenCalledWith(
      "steam_id64, relic_verified_elo, relic_verified_faction, relic_verified_division, relic_elo_calculation_version, relic_elo_verified_at, relic_elo_last_attempt_at"
    );
    expect(protectedProfile.eq).toHaveBeenCalledWith(
      "clerk_user_id",
      playerIdentity.userId
    );

    expect(card?.props).toEqual({
      hasPlayer: true,
      steamConnected: true,
      statusAvailable: true,
      initialVerification: {
        elo: 1675,
        faction: "British Forces",
        division: "Challenge",
        calculationVersion: "relic-1v1-v1",
        verifiedAt: VERIFIED_AT,
      },
      initialRefreshAvailableAt: "2026-08-04T00:15:00.000Z",
    });
    expect(JSON.stringify(card?.props)).not.toContain(STEAM_ID64);
    expect(JSON.stringify(card?.props)).not.toContain(PLAYER_ID);
    expect(JSON.stringify(card?.props)).not.toContain(playerIdentity.userId);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does not construct a verification snapshot from invalid protected data", async () => {
    const profile = createSingleRowClient(profileRow);
    const protectedProfile = createSingleRowClient({
      ...protectedProfileRow,
      relic_verified_elo: Number.MAX_SAFE_INTEGER + 1,
      relic_elo_last_attempt_at: "not-a-timestamp",
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
    createSupabaseAdminClientMock.mockReturnValue(protectedProfile.client);

    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    const card = findElementByType(page, relicEloVerificationCardMock);

    expect(card?.props).toMatchObject({
      initialVerification: null,
      initialRefreshAvailableAt: null,
    });
  });
});
