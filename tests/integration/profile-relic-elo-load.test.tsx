import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerIdentity } from "@/tests/fixtures/auth";
import { loadDictionary } from "@/lib/i18n/loaders";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const getOwnActiveTournamentEloSnapshotsMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const playerProfileFormMock = vi.hoisted(() => vi.fn());
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
  default: playerProfileFormMock,
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

vi.mock("@/lib/active-tournament-elo-snapshots", () => ({
  getOwnActiveTournamentEloSnapshots:
    getOwnActiveTournamentEloSnapshotsMock,
}));

vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: vi.fn(async () => "en"),
}));

import ProfilePage from "@/app/profile/page";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const STEAM_ID64 = "76561198012345678";
const VERIFIED_AT = "2026-08-03T23:55:00.000Z";
const LAST_ATTEMPT_AT = "2026-08-04T00:00:00.000Z";
const activeTournamentEloSnapshots = [
  {
    tournamentTitle: "IronClad August Open",
    elo: 1325,
    division: "Challenge",
  },
];

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
  relic_verified_elo: "1375",
  relic_verified_faction: "British Forces",
  relic_verified_division: "Challenge",
  relic_elo_calculation_version: "relic-highest-1v1-v1",
  relic_elo_verified_at: VERIFIED_AT,
  relic_elo_last_attempt_at: LAST_ATTEMPT_AT,
};

function createSingleRowClient(data: Record<string, unknown> | null, delayMs = 0) {
  const maybeSingle = vi.fn(async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { data, error: null };
  });
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
  beforeEach(async () => {
    await loadDictionary("en", "account-dashboard");
    authMock.mockResolvedValue(playerIdentity);
    getOwnActiveTournamentEloSnapshotsMock.mockReset();
    getOwnActiveTournamentEloSnapshotsMock.mockResolvedValue(
      activeTournamentEloSnapshots
    );
  });

  it("measures 30 delayed profile loads while retaining safe fields and caller scope", async () => {
    vi.useFakeTimers();
    try {
      const samples: number[] = [];
      let firstProps: unknown;
      for (let sample = 0; sample < 30; sample++) {
        const profile = createSingleRowClient(profileRow, 20);
        const protectedProfile = createSingleRowClient(protectedProfileRow, 20);
        createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
        createSupabaseAdminClientMock.mockReturnValue(protectedProfile.client);
        getOwnActiveTournamentEloSnapshotsMock.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return activeTournamentEloSnapshots;
        });
        const start = Date.now();
        const pending = ProfilePage({ searchParams: Promise.resolve({}) });
        await vi.runAllTimersAsync();
        const page = await pending;
        samples.push(Date.now() - start);
        const props = {
          form: findElementByType(page, playerProfileFormMock)?.props,
          card: findElementByType(page, relicEloVerificationCardMock)?.props,
        };
        firstProps ??= props;
        expect(props).toEqual(firstProps);
        expect(profile.eq).toHaveBeenCalledWith("clerk_user_id", playerIdentity.userId);
        expect(protectedProfile.eq).toHaveBeenCalledWith("clerk_user_id", playerIdentity.userId);
        expect(profile.select).toHaveBeenCalledOnce();
        expect(protectedProfile.select).toHaveBeenCalledOnce();
        expect(getOwnActiveTournamentEloSnapshotsMock).toHaveBeenLastCalledWith(profile.client, playerIdentity.userId);
        expect(JSON.stringify(props.card)).not.toContain(STEAM_ID64);
      }
      expect(samples).toEqual(Array(30).fill(40));
      console.info("PROFILE_DELAYED_BENCHMARK", JSON.stringify({ samples: samples.length, artificialQueryLatencyMs: 20, virtualP50Ms: samples[15], virtualP95Ms: samples[28], protectedProfileReadsPerRequest: 1, ownSnapshotReadsPerRequest: 1, memberProfileReadsPerRequest: 1 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not acquire private status or snapshot data for a missing profile", async () => {
    const profile = createSingleRowClient(null);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    expect(findElementByType(page, relicEloVerificationCardMock)?.props).toMatchObject({ hasPlayer: false, initialVerification: null });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(getOwnActiveTournamentEloSnapshotsMock).not.toHaveBeenCalled();
  });

  it("retains own snapshots when protected status acquisition fails", async () => {
    const profile = createSingleRowClient(profileRow);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
    createSupabaseAdminClientMock.mockImplementation(() => { throw new Error("synthetic private diagnostic"); });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    expect(findElementByType(page, playerProfileFormMock)?.props.activeTournamentEloSnapshots).toEqual(activeTournamentEloSnapshots);
    expect(findElementByType(page, relicEloVerificationCardMock)?.props).toMatchObject({ statusAvailable: false, initialVerification: null });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("synthetic private diagnostic");
  });

  it("preserves already-validated status fields if later cooldown normalization fails", async () => {
    createAuthenticatedSupabaseClientMock.mockResolvedValue(createSingleRowClient(profileRow).client);
    createSupabaseAdminClientMock.mockReturnValue(createSingleRowClient({ ...protectedProfileRow, relic_elo_last_attempt_at: "+275760-09-13T00:00:00.000Z" }).client);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    expect(findElementByType(page, relicEloVerificationCardMock)?.props).toMatchObject({
      steamConnected: true, statusAvailable: false, initialVerification: { elo: 1375 }, initialRefreshAvailableAt: null,
    });
  });

  it("keeps simultaneous private owner loads scoped to each authenticated identity", async () => {
    const ownerUser = playerIdentity.userId;
    if (!ownerUser) throw new Error("Synthetic owner identity is required");
    const otherUser = "user_synthetic_other_profile";
    const profiles: Record<string, Record<string, unknown>> = {
      [ownerUser]: profileRow,
      [otherUser]: { ...profileRow, id: "22222222-2222-4222-8222-222222222222", clerk_user_id: otherUser, in_game_name: "OtherSyntheticPlayer" },
    };
    const protectedProfiles: Record<string, Record<string, unknown>> = {
      [ownerUser]: protectedProfileRow,
      [otherUser]: { ...protectedProfileRow, relic_verified_elo: 1000, relic_verified_division: "Academy" },
    };
    const filters: string[] = [];
    const scopedClient = (rows: typeof profiles) => ({ from: () => ({ select: () => ({ eq: (column: string, identity: string) => {
      expect(column).toBe("clerk_user_id");
      filters.push(identity);
      return { maybeSingle: async () => ({ data: rows[identity], error: null }) };
    } }) }) });
    const member = scopedClient(profiles);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(member);
    createSupabaseAdminClientMock.mockReturnValue(scopedClient(protectedProfiles));
    authMock.mockResolvedValueOnce(playerIdentity).mockResolvedValueOnce({ ...playerIdentity, userId: otherUser });
    getOwnActiveTournamentEloSnapshotsMock.mockImplementation(async (_client: unknown, identity: string) => [{ tournamentTitle: identity === otherUser ? "Other synthetic event" : "Original synthetic event", elo: 1000, division: "Academy" }]);
    const [first, second] = await Promise.all([ProfilePage({ searchParams: Promise.resolve({}) }), ProfilePage({ searchParams: Promise.resolve({}) })]);
    const firstForm = findElementByType(first, playerProfileFormMock)?.props;
    const secondForm = findElementByType(second, playerProfileFormMock)?.props;
    expect(firstForm).toMatchObject({ profile: { clerk_user_id: playerIdentity.userId }, verifiedCurrentElo: 1375, activeTournamentEloSnapshots: [{ tournamentTitle: "Original synthetic event" }] });
    expect(secondForm).toMatchObject({ profile: { clerk_user_id: otherUser }, verifiedCurrentElo: 1000, activeTournamentEloSnapshots: [{ tournamentTitle: "Other synthetic event" }] });
    expect(filters.filter((identity) => identity === playerIdentity.userId)).toHaveLength(2);
    expect(filters.filter((identity) => identity === otherUser)).toHaveLength(2);
  });

  it("loads protected fields with the admin client and passes only normalized safe props", async () => {
    const profile = createSingleRowClient(profileRow);
    const protectedProfile = createSingleRowClient(protectedProfileRow);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
    createSupabaseAdminClientMock.mockReturnValue(protectedProfile.client);

    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    const form = findElementByType(page, playerProfileFormMock);
    const card = findElementByType(page, relicEloVerificationCardMock);

    expect(form).not.toBeNull();
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
    expect(authenticatedSelection).not.toContain("coh3_player_card_url");
    expect(authenticatedSelection).not.toContain("current_elo");

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
        elo: 1375,
        faction: "British Forces",
        division: "Challenge",
        calculationVersion: "relic-highest-1v1-v1",
        verifiedAt: VERIFIED_AT,
      },
      initialRefreshAvailableAt: "2026-08-04T00:15:00.000Z",
    });
    expect(form?.props).toMatchObject({
      profile: profileRow,
      verifiedCurrentElo: 1375,
      activeTournamentEloSnapshots,
    });
    expect(getOwnActiveTournamentEloSnapshotsMock).toHaveBeenCalledWith(
      profile.client,
      playerIdentity.userId
    );
    expect(form?.props.verifiedCurrentElo).not.toBe(profileRow.current_elo);
    expect(JSON.stringify(card?.props)).not.toContain(STEAM_ID64);
    expect(JSON.stringify(card?.props)).not.toContain(PLAYER_ID);
    expect(JSON.stringify(card?.props)).not.toContain(playerIdentity.userId);
    expect(JSON.stringify(form?.props.activeTournamentEloSnapshots)).not.toContain(
      PLAYER_ID
    );
    expect(JSON.stringify(form?.props.activeTournamentEloSnapshots)).not.toContain(
      playerIdentity.userId
    );
    expect(JSON.stringify(form?.props.activeTournamentEloSnapshots)).not.toContain(
      STEAM_ID64
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    ["relic-highest-1v1-v1", "Main / Pro"],
    ["relic-highest-1v1-v2", "Pro"],
  ])("preserves a 1750 snapshot under its original %s contract", async (version, division) => {
    const profile = createSingleRowClient(profileRow);
    const protectedProfile = createSingleRowClient({
      ...protectedProfileRow,
      relic_verified_elo: 1750,
      relic_verified_division: division,
      relic_elo_calculation_version: version,
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
    createSupabaseAdminClientMock.mockReturnValue(protectedProfile.client);
    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    const card = findElementByType(page, relicEloVerificationCardMock);
    expect(card?.props.initialVerification).toMatchObject({
      elo: 1750,
      division,
      calculationVersion: version,
    });
  });

  it.each([
    ["relic-highest-1v1-v2", "Main / Pro"],
    ["relic-highest-1v1-v1", "Pro"],
    ["staging-synthetic-v2", "Pro"],
    ["unknown-v3", "Pro"],
  ])("rejects mismatched or synthetic %s/%s profile evidence", async (version, division) => {
    const profile = createSingleRowClient(profileRow);
    const protectedProfile = createSingleRowClient({
      ...protectedProfileRow,
      relic_verified_elo: 1750,
      relic_verified_division: division,
      relic_elo_calculation_version: version,
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(profile.client);
    createSupabaseAdminClientMock.mockReturnValue(protectedProfile.client);
    const page = await ProfilePage({ searchParams: Promise.resolve({}) });
    const card = findElementByType(page, relicEloVerificationCardMock);
    expect(card?.props.initialVerification).toBeNull();
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
    const form = findElementByType(page, playerProfileFormMock);
    const card = findElementByType(page, relicEloVerificationCardMock);

    expect(form?.props).toMatchObject({ verifiedCurrentElo: null });
    expect(card?.props).toMatchObject({
      initialVerification: null,
      initialRefreshAvailableAt: null,
    });
  });
});
