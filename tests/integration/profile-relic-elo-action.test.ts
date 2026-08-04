import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const getRelic1v1EloMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/elo-verification/relic", () => ({
  getRelic1v1Elo: getRelic1v1EloMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { verifyRelicProfileElo } from "@/app/profile/relic-elo-action";

const PLAYER_ID = "player-private-id";
const CLERK_USER_ID = playerIdentity.userId!;
const STEAM_ID64 = "18446744073709551615";
const OTHER_STEAM_ID64 = "18446744073709551614";
const CLAIMED_AT = "2026-08-04T02:00:00.000Z";
const VERIFIED_AT = "2026-08-04T02:00:05.000Z";
const REFRESH_AVAILABLE_AT = "2026-08-04T02:15:00.000Z";
const OLD_ATTEMPT_AT = "2026-08-04T01:00:00.000Z";
const CALCULATION_VERSION = "relic-highest-1v1-v1";

type PlayerState = {
  id: string;
  clerk_user_id: string;
  steam_id64: string | null;
  relic_verified_elo: number | null;
  relic_verified_faction: string | null;
  relic_verified_division: string | null;
  relic_elo_calculation_version: string | null;
  relic_elo_verified_at: string | null;
  relic_elo_last_attempt_at: string | null;
};

type QueryRecord = {
  kind: "select" | "update";
  columns: string | null;
  payload: Record<string, unknown> | null;
  filters: Array<[string, unknown]>;
};

type VerificationClientOptions = {
  player?: PlayerState | null;
  claimedAt?: string;
  claimShape?: "array" | "row";
  claimError?: boolean;
  loadError?: boolean;
  updateError?: boolean;
  conflictOnUpdate?: boolean;
  serializeEloAsString?: boolean;
};

function createPlayer(
  overrides: Partial<PlayerState> = {}
): PlayerState {
  return {
    id: PLAYER_ID,
    clerk_user_id: CLERK_USER_ID,
    steam_id64: STEAM_ID64,
    relic_verified_elo: null,
    relic_verified_faction: null,
    relic_verified_division: null,
    relic_elo_calculation_version: null,
    relic_elo_verified_at: null,
    relic_elo_last_attempt_at: null,
    ...overrides,
  };
}

function createVerifiedPlayer(
  overrides: Partial<PlayerState> = {}
): PlayerState {
  return createPlayer({
    relic_verified_elo: 1_200,
    relic_verified_faction: "US Forces",
    relic_verified_division: "Challenge",
    relic_elo_calculation_version: CALCULATION_VERSION,
    relic_elo_verified_at: "2026-08-01T02:00:00.000Z",
    relic_elo_last_attempt_at: OLD_ATTEMPT_AT,
    ...overrides,
  });
}

function createVerificationClient(
  options: VerificationClientOptions = {}
) {
  let player =
    options.player === undefined ? createPlayer() : options.player;
  const claimedAt = options.claimedAt ?? CLAIMED_AT;
  const queries: QueryRecord[] = [];
  const updatePayloads: Record<string, unknown>[] = [];

  const maybeSingle = async (query: QueryRecord) => {
    if (query.kind === "select") {
      if (options.loadError) {
        return { data: null, error: { code: "select_failed" } };
      }

      if (!player || !matchesFilters(player, query.filters)) {
        return { data: null, error: null };
      }

      return { data: { ...player }, error: null };
    }

    if (options.updateError) {
      return { data: null, error: { code: "update_failed" } };
    }

    if (
      !player ||
      options.conflictOnUpdate ||
      !matchesFilters(player, query.filters)
    ) {
      return { data: null, error: null };
    }

    player = { ...player, ...query.payload } as PlayerState;
    return {
      data: {
        ...player,
        ...(options.serializeEloAsString && player.relic_verified_elo !== null
          ? { relic_verified_elo: String(player.relic_verified_elo) }
          : {}),
      },
      error: null,
    };
  };

  const createQuery = (
    kind: QueryRecord["kind"],
    columns: string | null,
    payload: Record<string, unknown> | null
  ) => {
    const record: QueryRecord = { kind, columns, payload, filters: [] };
    queries.push(record);

    const query = {
      eq: vi.fn((column: string, value: unknown) => {
        record.filters.push([column, value]);
        return query;
      }),
      select: vi.fn((selectedColumns: string) => {
        record.columns = selectedColumns;
        return query;
      }),
      maybeSingle: vi.fn(() => maybeSingle(record)),
    };

    return query;
  };

  const from = vi.fn((table: string) => {
    if (table !== "players") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: vi.fn((columns: string) =>
        createQuery("select", columns, null)
      ),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        return createQuery("update", null, payload);
      }),
    };
  });

  const rpc = vi.fn(
    async (name: string, args: Record<string, unknown>) => {
      if (name !== "claim_relic_elo_verification_attempt") {
        throw new Error(`Unexpected RPC: ${name}`);
      }

      if (options.claimError) {
        return { data: null, error: { code: "claim_failed" } };
      }

      if (
        !player ||
        args.p_player_id !== player.id ||
        args.p_clerk_user_id !== player.clerk_user_id ||
        args.p_steam_id64 !== player.steam_id64 ||
        !canClaim(player.relic_elo_last_attempt_at, claimedAt)
      ) {
        return { data: [], error: null };
      }

      player = {
        ...player,
        relic_elo_last_attempt_at: claimedAt,
      };
      const row = { claimed_at: claimedAt };
      return {
        data: options.claimShape === "row" ? row : [row],
        error: null,
      };
    }
  );

  return {
    client: { from, rpc },
    from,
    rpc,
    queries,
    updatePayloads,
    getPlayer: () => player,
  };
}

function matchesFilters(
  player: PlayerState,
  filters: Array<[string, unknown]>
) {
  return filters.every(
    ([column, expected]) =>
      player[column as keyof PlayerState] === expected
  );
}

function canClaim(lastAttemptAt: string | null, claimedAt: string) {
  return (
    lastAttemptAt === null ||
    Date.parse(lastAttemptAt) <= Date.parse(claimedAt) - 15 * 60 * 1_000
  );
}

function ratedResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "rated",
    elo: 1_450,
    faction: "Wehrmacht",
    division: "Main / Pro",
    calculationVersion: CALCULATION_VERSION,
    ...overrides,
  };
}

describe("profile Relic ELO verification action", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(VERIFIED_AT));
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReset();
    getRelic1v1EloMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects an unauthenticated request before service-role access", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await verifyRelicProfileElo();

    expect(result).toEqual({
      status: "error",
      message: "Sign in before verifying your ELO.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("returns a safe error when the authenticated player row is missing", async () => {
    const fixture = createVerificationClient({ player: null });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await verifyRelicProfileElo();

    expect(result).toEqual({
      status: "error",
      message: "Complete your player profile before verifying your ELO.",
    });
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("requires a server-loaded connected Steam identity", async () => {
    const fixture = createVerificationClient({
      player: createPlayer({ steam_id64: null }),
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await verifyRelicProfileElo();

    expect(result).toEqual({
      status: "requires_steam",
      message: "Connect your Steam account before verifying your ELO.",
    });
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("claims and saves a first rated verification with only normalized fields", async () => {
    const fixture = createVerificationClient({ serializeEloAsString: true });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    getRelic1v1EloMock.mockResolvedValue(ratedResult());

    const result = await verifyRelicProfileElo();

    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith(
      "claim_relic_elo_verification_attempt",
      {
        p_player_id: PLAYER_ID,
        p_clerk_user_id: CLERK_USER_ID,
        p_steam_id64: STEAM_ID64,
      }
    );
    expect(getRelic1v1EloMock).toHaveBeenCalledExactlyOnceWith(STEAM_ID64);
    expect(fixture.updatePayloads).toEqual([
      {
        relic_verified_elo: 1_450,
        relic_verified_faction: "Wehrmacht",
        relic_verified_division: "Main / Pro",
        relic_elo_calculation_version: CALCULATION_VERSION,
        relic_elo_verified_at: VERIFIED_AT,
      },
    ]);
    expect(result).toEqual({
      status: "success",
      message: "Your Relic ELO has been verified.",
      snapshot: {
        elo: 1_450,
        faction: "Wehrmacht",
        division: "Main / Pro",
        calculationVersion: CALCULATION_VERSION,
        verifiedAt: VERIFIED_AT,
      },
      refreshAvailableAt: REFRESH_AVAILABLE_AT,
    });
    expect(revalidatePathMock).toHaveBeenCalledExactlyOnceWith("/profile");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(PLAYER_ID);
    expect(serialized).not.toContain(CLERK_USER_ID);
    expect(serialized).not.toContain(STEAM_ID64);
  });

  it("refreshes an existing snapshot after the cooldown using a single-row RPC result", async () => {
    const fixture = createVerificationClient({
      player: createVerifiedPlayer(),
      claimShape: "row",
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    getRelic1v1EloMock.mockResolvedValue(
      ratedResult({
        elo: 1_380,
        faction: "British Forces",
        division: "Challenge",
      })
    );

    const result = await verifyRelicProfileElo();

    expect(result).toMatchObject({
      status: "success",
      snapshot: {
        elo: 1_380,
        faction: "British Forces",
        division: "Challenge",
        verifiedAt: VERIFIED_AT,
      },
    });
    expect(fixture.getPlayer()).toMatchObject({
      relic_verified_elo: 1_380,
      relic_verified_faction: "British Forces",
      relic_verified_division: "Challenge",
      relic_elo_verified_at: VERIFIED_AT,
    });
    expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
  });

  it("re-reads the claimed attempt after losing a concurrent cooldown race", async () => {
    const fixture = createVerificationClient({
      player: createPlayer({ relic_elo_last_attempt_at: CLAIMED_AT }),
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await verifyRelicProfileElo();

    expect(result).toEqual({
      status: "cooldown",
      message: "ELO verification is temporarily on cooldown.",
      refreshAvailableAt: REFRESH_AVAILABLE_AT,
    });
    expect(fixture.queries).toHaveLength(2);
    expect(fixture.queries[1]).toMatchObject({
      kind: "select",
      columns: "relic_elo_last_attempt_at",
      filters: [
        ["id", PLAYER_ID],
        ["clerk_user_id", CLERK_USER_ID],
        ["steam_id64", STEAM_ID64],
      ],
    });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
    expect(fixture.updatePayloads).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("allows only one Relic call across two concurrent attempts", async () => {
    const fixture = createVerificationClient();
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    getRelic1v1EloMock.mockResolvedValue(ratedResult());

    const results = await Promise.all([
      verifyRelicProfileElo(),
      verifyRelicProfileElo(),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "cooldown",
      "success",
    ]);
    expect(fixture.rpc).toHaveBeenCalledTimes(2);
    expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
    expect(fixture.updatePayloads).toHaveLength(1);
  });

  it.each([
    [
      "invalid_steam_input",
      "error",
      "Your connected Steam identity could not be verified.",
    ],
    [
      "profile_not_found",
      "error",
      "No Company of Heroes 3 profile was found",
    ],
    [
      "steam_identity_mismatch",
      "error",
      "Relic could not confirm your connected game identity.",
    ],
    ["unranked", "error", "No rated 1v1 ELO is currently available."],
    [
      "invalid_relic_response",
      "unavailable",
      "ELO verification could not be completed right now.",
    ],
    [
      "relic_integration_error",
      "unavailable",
      "ELO verification could not be completed right now.",
    ],
    [
      "external_relic_unavailable",
      "unavailable",
      "Relic is temporarily unavailable.",
    ],
  ] as const)(
    "maps %s to a safe %s result and preserves the previous snapshot",
    async (relicStatus, actionStatus, message) => {
      const originalPlayer = createVerifiedPlayer();
      const fixture = createVerificationClient({ player: originalPlayer });
      createSupabaseAdminClientMock.mockReturnValue(fixture.client);
      getRelic1v1EloMock.mockResolvedValue({ status: relicStatus });

      const result = await verifyRelicProfileElo();

      expect(result).toMatchObject({
        status: actionStatus,
        message: expect.stringContaining(message),
        refreshAvailableAt: REFRESH_AVAILABLE_AT,
      });
      expect(JSON.stringify(result)).not.toContain(relicStatus);
      expect(fixture.updatePayloads).toHaveLength(0);
      expect(fixture.getPlayer()).toMatchObject({
        relic_verified_elo: originalPlayer.relic_verified_elo,
        relic_verified_faction: originalPlayer.relic_verified_faction,
        relic_verified_division: originalPlayer.relic_verified_division,
        relic_elo_calculation_version:
          originalPlayer.relic_elo_calculation_version,
        relic_elo_verified_at: originalPlayer.relic_elo_verified_at,
        relic_elo_last_attempt_at: CLAIMED_AT,
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    }
  );

  it("treats a zero-row conditional save as a safe identity conflict", async () => {
    const originalPlayer = createVerifiedPlayer();
    const fixture = createVerificationClient({
      player: originalPlayer,
      conflictOnUpdate: true,
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    getRelic1v1EloMock.mockResolvedValue(ratedResult());

    const result = await verifyRelicProfileElo();

    expect(result).toMatchObject({
      status: "error",
      refreshAvailableAt: REFRESH_AVAILABLE_AT,
    });
    const saveQuery = fixture.queries.find(
      (query) => query.kind === "update"
    );
    expect(saveQuery?.filters).toEqual([
      ["id", PLAYER_ID],
      ["clerk_user_id", CLERK_USER_ID],
      ["steam_id64", STEAM_ID64],
      ["relic_elo_last_attempt_at", CLAIMED_AT],
    ]);
    expect(fixture.getPlayer()).toMatchObject({
      relic_verified_elo: originalPlayer.relic_verified_elo,
      relic_verified_faction: originalPlayer.relic_verified_faction,
      relic_verified_division: originalPlayer.relic_verified_division,
      relic_elo_calculation_version:
        originalPlayer.relic_elo_calculation_version,
      relic_elo_verified_at: originalPlayer.relic_elo_verified_at,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not call Relic when the database cooldown claim fails", async () => {
    const fixture = createVerificationClient({ claimError: true });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await verifyRelicProfileElo();

    expect(result).toMatchObject({ status: "error" });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
    expect(fixture.updatePayloads).toHaveLength(0);
  });

  it("maps a thrown database lookup to a safe result without logging details", async () => {
    const rawMarker = `${PLAYER_ID}:${CLERK_USER_ID}:${STEAM_ID64}:database-body`;
    const maybeSingle = vi.fn().mockRejectedValue(new Error(rawMarker));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    createSupabaseAdminClientMock.mockReturnValue({ from });

    const result = await verifyRelicProfileElo();

    expect(result).toEqual({
      status: "error",
      message: "Your player profile could not be loaded.",
    });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(rawMarker);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      rawMarker
    );
  });

  it("does not expose private values or thrown Relic details", async () => {
    const rawMarker = `${PLAYER_ID}:${CLERK_USER_ID}:${STEAM_ID64}:private-body`;
    const fixture = createVerificationClient();
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);
    getRelic1v1EloMock.mockRejectedValue(new Error(rawMarker));

    const result = await verifyRelicProfileElo();

    expect(result).toEqual({
      status: "unavailable",
      message:
        "Relic is temporarily unavailable. Your previous ELO result remains unchanged.",
      refreshAvailableAt: REFRESH_AVAILABLE_AT,
    });
    expect(JSON.stringify(result)).not.toContain(rawMarker);
    expect(console.error).toHaveBeenCalledWith(
      "Relic ELO request failed unexpectedly."
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      rawMarker
    );
    expect(fixture.updatePayloads).toHaveLength(0);
  });

  it("rejects a claim that does not contain exactly one timestamp row", async () => {
    const fixture = createVerificationClient();
    fixture.rpc.mockResolvedValueOnce({
      data: [
        { claimed_at: CLAIMED_AT },
        { claimed_at: CLAIMED_AT },
      ],
      error: null,
    });
    createSupabaseAdminClientMock.mockReturnValue(fixture.client);

    const result = await verifyRelicProfileElo();

    expect(result).toMatchObject({ status: "error" });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("never trusts a caller-supplied identity because the action accepts no arguments", () => {
    expect(verifyRelicProfileElo.length).toBe(0);
    expect(STEAM_ID64).not.toBe(OTHER_STEAM_ID64);
  });
});
