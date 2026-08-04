import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const getRelic1v1EloMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/notifications", () => ({
  createInAppNotification: createInAppNotificationMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { submitTournamentRegistration } from "@/app/tournaments/actions";

const CLERK_USER_ID = playerIdentity.userId!;
const PLAYER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const BRACKET_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_TOURNAMENT_ID = "55555555-5555-4555-8555-555555555555";
const SECOND_BRACKET_ID = "66666666-6666-4666-8666-666666666666";
const REGISTRATION_ID = "33333333-3333-4333-8333-333333333333";
const OLDER_REGISTRATION_ID = "44444444-4444-4444-8444-444444444444";
const STEAM_ID64 = "76561198000000000";
const CALCULATION_VERSION = "relic-highest-1v1-v1";
const NOW = "2026-08-04T02:00:00.000Z";

type QueryResult = { data: unknown; error: unknown };
type QueryRecord = {
  table: string;
  columns: string;
  filters: Array<[string, unknown]>;
  orders: Array<[string, unknown]>;
};
type ClientOptions = {
  player?: Record<string, unknown> | null;
  playerError?: unknown;
  duplicate?: Record<string, unknown> | null;
  duplicateError?: unknown;
  tournament?: Record<string, unknown> | null;
  tournamentError?: unknown;
  waitlistRows?: Record<string, unknown>[];
  waitlistError?: unknown;
  rpcResults?: QueryResult[];
  rpcHandler?: (
    name: string,
    args: Record<string, unknown>,
    callIndex: number
  ) => QueryResult | Promise<QueryResult>;
};

class SupabaseQueryMock implements PromiseLike<QueryResult> {
  constructor(
    private readonly record: QueryRecord,
    private readonly resolveResult: (record: QueryRecord) => QueryResult
  ) {}

  eq(column: string, value: unknown) {
    this.record.filters.push([column, value]);
    return this;
  }

  order(column: string, options: unknown) {
    this.record.orders.push([column, options]);
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.resolveResult(this.record));
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolveResult(this.record)).then(
      onfulfilled,
      onrejected
    );
  }
}

function createRegistrationClient(options: ClientOptions = {}) {
  const player =
    options.player === undefined ? createPlayer() : options.player;
  const duplicate = options.duplicate ?? null;
  const tournament =
    options.tournament === undefined ? createTournament() : options.tournament;
  const queries: QueryRecord[] = [];
  const rpcResults = [...(options.rpcResults ?? [])];

  const resolveResult = (record: QueryRecord): QueryResult => {
    if (record.table === "players") {
      return { data: player, error: options.playerError ?? null };
    }

    if (record.table === "tournaments") {
      return { data: tournament, error: options.tournamentError ?? null };
    }

    if (record.table === "registrations") {
      const waitlistQuery = record.filters.some(
        ([column, value]) =>
          column === "registration_status" && value === "waitlisted"
      );

      return waitlistQuery
        ? {
            data: options.waitlistRows ?? [],
            error: options.waitlistError ?? null,
          }
        : { data: duplicate, error: options.duplicateError ?? null };
    }

    throw new Error(`Unexpected table: ${record.table}`);
  };

  const from = vi.fn((table: string) => ({
    select: (columns: string) => {
      const record: QueryRecord = {
        table,
        columns,
        filters: [],
        orders: [],
      };
      queries.push(record);
      return new SupabaseQueryMock(record, resolveResult);
    },
  }));
  let rpcCallIndex = 0;
  const rpc = vi.fn(
    async (name: string, args: Record<string, unknown>): Promise<QueryResult> => {
      const currentIndex = rpcCallIndex;
      rpcCallIndex += 1;

      if (options.rpcHandler) {
        return options.rpcHandler(name, args, currentIndex);
      }

      if (rpcResults.length > 0) {
        return rpcResults.shift()!;
      }

      return successfulRpcResult(args);
    }
  );

  return {
    client: { from, rpc },
    from,
    queries,
    rpc,
  };
}

function createPlayer(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: PLAYER_ID,
    clerk_user_id: CLERK_USER_ID,
    in_game_name: "IronPlayer",
    steam_id64: STEAM_ID64,
    profile_completed: true,
    ...overrides,
  };
}

function createTournament(
  bracketName = "Challenge",
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: TOURNAMENT_ID,
    title: "IronClad Open",
    status: "registration_open",
    registration_open_at: "2026-08-01T00:00:00.000Z",
    registration_close_at: "2026-08-10T00:00:00.000Z",
    registration_enabled: true,
    tournament_brackets: [{ id: BRACKET_ID, name: bracketName }],
    ...overrides,
  };
}

function registrationInput(overrides: Record<string, unknown> = {}) {
  return {
    tournamentId: TOURNAMENT_ID,
    bracketId: BRACKET_ID,
    tournamentTitle: "Untrusted tournament title",
    bracketName: "Untrusted bracket name",
    rulebookAgreement: true,
    playerParticipationAgreement: true,
    adminFinalDecisionAgreement: true,
    ownershipConfirmation: true,
    ...overrides,
  };
}

function ratedResult({
  elo = 1_200,
  faction = "US Forces",
  division = "Challenge",
}: {
  elo?: number;
  faction?: string;
  division?: string;
} = {}) {
  return {
    status: "rated",
    elo,
    faction,
    division,
    calculationVersion: CALCULATION_VERSION,
  };
}

function successfulRpcResult(
  args: Record<string, unknown>,
  registrationStatus: "pending" | "waitlisted" = "pending"
): QueryResult {
  return {
    data: [
      {
        id: REGISTRATION_ID,
        tournament_id: args.p_tournament_id,
        tournament_bracket_id: args.p_tournament_bracket_id,
        registration_status: registrationStatus,
        submitted_elo: args.p_relic_elo,
      },
    ],
    error: null,
  };
}

describe("Relic-authoritative tournament registration action", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    authMock.mockResolvedValue(playerIdentity);
    getRelic1v1EloMock.mockResolvedValue(ratedResult());
    createInAppNotificationMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires Clerk authentication before any protected lookup", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message: "Sign in before registering for a tournament.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("rejects malformed input and missing agreements before loading private data", async () => {
    const result = await submitTournamentRegistration(
      registrationInput({ rulebookAgreement: false })
    );

    expect(result).toEqual({
      success: false,
      message: "Complete the tournament selection and required agreements.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("requires a canonical completed player profile", async () => {
    const client = createRegistrationClient({
      player: createPlayer({ profile_completed: false }),
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message: "Complete your player profile before registering.",
      requiresProfile: true,
    });
    expect(client.queries[0]).toMatchObject({
      table: "players",
      filters: [["clerk_user_id", CLERK_USER_ID]],
    });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("fails closed before Relic when protected Steam identity is absent", async () => {
    const client = createRegistrationClient({
      player: createPlayer({ steam_id64: null }),
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message: "Connect your Steam account before registering for a tournament.",
    });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("prechecks duplicates before tournament lookup or fresh Relic verification", async () => {
    const client = createRegistrationClient({
      duplicate: { id: REGISTRATION_ID },
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message: "You are already registered for this tournament.",
    });
    expect(client.queries.map((query) => query.table)).toEqual([
      "players",
      "registrations",
    ]);
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("validates the current registration window before calling Relic", async () => {
    const client = createRegistrationClient({
      tournament: createTournament("Challenge", {
        registration_close_at: "2026-08-03T00:00:00.000Z",
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message:
        "This tournament is full or already in progress. We hope to see you in the next one.",
    });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("honors the authoritative registration-enabled state before calling Relic", async () => {
    const client = createRegistrationClient({
      tournament: createTournament("Challenge", {
        registration_enabled: false,
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message:
        "This tournament is full or already in progress. We hope to see you in the next one.",
    });
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      bracket: "Academy",
      elo: 0,
      division: "Academy",
      faction: "US Forces",
    },
    {
      bracket: "Academy",
      elo: 1_099,
      division: "Academy",
      faction: "British Forces",
    },
    {
      bracket: "Challenge",
      elo: 1_100,
      division: "Challenge",
      faction: "US Forces",
    },
    {
      bracket: "Challenge",
      elo: 1_399,
      division: "Challenge",
      faction: "Deutsches Afrikakorps",
    },
    {
      bracket: "Main",
      elo: 1_400,
      division: "Main / Pro",
      faction: "Wehrmacht",
    },
  ])(
    "uses exactly one fresh Relic result for the $division registration snapshot",
    async ({ bracket, elo, division, faction }) => {
      const client = createRegistrationClient({
        tournament: createTournament(bracket),
      });
      createSupabaseAdminClientMock.mockReturnValue(client.client);
      getRelic1v1EloMock.mockResolvedValue(
        ratedResult({ elo, division, faction })
      );

      const result = await submitTournamentRegistration(registrationInput());

      expect(result).toEqual({
        success: true,
        message: "Registration submitted.",
      });
      expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
      expect(getRelic1v1EloMock).toHaveBeenCalledWith(STEAM_ID64);
      expect(client.rpc).toHaveBeenCalledOnce();
      expect(client.rpc).toHaveBeenCalledWith(
        "submit_verified_player_registration",
        {
          p_profile_id: PLAYER_ID,
          p_clerk_user_id: CLERK_USER_ID,
          p_steam_id64: STEAM_ID64,
          p_tournament_id: TOURNAMENT_ID,
          p_tournament_bracket_id: BRACKET_ID,
          p_relic_elo: elo,
          p_relic_faction: faction,
          p_relic_division: division,
          p_relic_calculation_version: CALCULATION_VERSION,
        }
      );

      const playerQuery = client.queries.find(
        (query) => query.table === "players"
      );
      expect(playerQuery?.columns).toContain("steam_id64");
      expect(playerQuery?.columns).not.toMatch(
        /current_elo|coh3|relic_verified|relic_elo_last_attempt/i
      );
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
      expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments");
    }
  );

  it("performs another independent fresh Relic request for another tournament", async () => {
    const firstClient = createRegistrationClient();
    const secondClient = createRegistrationClient({
      tournament: createTournament("Challenge", {
        id: SECOND_TOURNAMENT_ID,
        tournament_brackets: [
          { id: SECOND_BRACKET_ID, name: "Challenge" },
        ],
      }),
    });
    createSupabaseAdminClientMock
      .mockReturnValueOnce(firstClient.client)
      .mockReturnValueOnce(secondClient.client);

    const firstResult = await submitTournamentRegistration(
      registrationInput()
    );
    const secondResult = await submitTournamentRegistration(
      registrationInput({
        tournamentId: SECOND_TOURNAMENT_ID,
        bracketId: SECOND_BRACKET_ID,
      })
    );

    expect(firstResult.success).toBe(true);
    expect(secondResult.success).toBe(true);
    expect(getRelic1v1EloMock).toHaveBeenCalledTimes(2);
    expect(getRelic1v1EloMock).toHaveBeenNthCalledWith(1, STEAM_ID64);
    expect(getRelic1v1EloMock).toHaveBeenNthCalledWith(2, STEAM_ID64);
    expect(firstClient.rpc).toHaveBeenCalledOnce();
    expect(secondClient.rpc).toHaveBeenCalledOnce();
    expect(secondClient.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_tournament_id: SECOND_TOURNAMENT_ID,
      p_tournament_bracket_id: SECOND_BRACKET_ID,
    });
  });

  it("never reuses an earlier profile Relic snapshot as registration authority", async () => {
    const client = createRegistrationClient({
      player: createPlayer({
        relic_verified_elo: 900,
        relic_verified_faction: "British Forces",
        relic_verified_division: "Academy",
        relic_elo_calculation_version: "stale-version",
        relic_elo_verified_at: "2026-08-04T01:59:00.000Z",
      }),
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);
    getRelic1v1EloMock.mockResolvedValue(
      ratedResult({
        elo: 1_250,
        faction: "Deutsches Afrikakorps",
        division: "Challenge",
      })
    );

    const result = await submitTournamentRegistration(registrationInput());

    expect(result.success).toBe(true);
    expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
    expect(client.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_relic_elo: 1_250,
      p_relic_faction: "Deutsches Afrikakorps",
      p_relic_division: "Challenge",
      p_relic_calculation_version: CALCULATION_VERSION,
    });
  });

  it("rejects a strict division mismatch after one fresh lookup and before mutation", async () => {
    const client = createRegistrationClient();
    createSupabaseAdminClientMock.mockReturnValue(client.client);
    getRelic1v1EloMock.mockResolvedValue(
      ratedResult({ elo: 1_400, division: "Main / Pro" })
    );

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message:
        "Your fresh Relic ELO does not match the selected tournament division. Choose the matching division and try again.",
    });
    expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects inconsistent Relic division metadata even when the bracket matches it", async () => {
    const client = createRegistrationClient({
      tournament: createTournament("Challenge"),
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);
    getRelic1v1EloMock.mockResolvedValue(
      ratedResult({ elo: 1_099, division: "Challenge" })
    );

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message:
        "Your fresh Relic ELO does not match the selected tournament division. Choose the matching division and try again.",
    });
    expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "invalid_steam_input",
      "Your connected Steam identity could not be verified.",
    ],
    [
      "profile_not_found",
      "No Company of Heroes 3 profile was found for your connected Steam account.",
    ],
    [
      "steam_identity_mismatch",
      "Relic could not confirm your connected game identity.",
    ],
    ["unranked", "No rated 1v1 ELO is currently available."],
    [
      "invalid_relic_response",
      "ELO verification could not be completed right now.",
    ],
    [
      "relic_integration_error",
      "ELO verification could not be completed right now.",
    ],
    [
      "external_relic_unavailable",
      "Relic is temporarily unavailable. Please try registering again later.",
    ],
  ])("maps the %s Relic failure without a database mutation", async (status, message) => {
    const client = createRegistrationClient();
    createSupabaseAdminClientMock.mockReturnValue(client.client);
    getRelic1v1EloMock.mockResolvedValue({ status });

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({ success: false, message });
    expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps a concurrent unique violation to a fixed duplicate result", async () => {
    const client = createRegistrationClient({
      rpcResults: [
        {
          data: null,
          error: {
            code: "23505",
            message: "duplicate key provider detail",
          },
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message: "You are already registered for this tournament.",
    });
    expect(getRelic1v1EloMock).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledOnce();
  });

  it("allows at most one success when concurrent requests pass the duplicate precheck", async () => {
    const client = createRegistrationClient({
      rpcHandler: (_name, args, callIndex) =>
        callIndex === 0
          ? successfulRpcResult(args)
          : {
              data: null,
              error: {
                code: "23505",
                message: "Already registered for this tournament",
              },
            },
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const results = await Promise.all([
      submitTournamentRegistration(registrationInput()),
      submitTournamentRegistration(registrationInput()),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toEqual([
      {
        success: false,
        message: "You are already registered for this tournament.",
      },
    ]);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("preserves waitlist position and notification behavior after the atomic RPC", async () => {
    const client = createRegistrationClient({
      rpcHandler: (_name, args) =>
        successfulRpcResult(args, "waitlisted"),
      waitlistRows: [
        { id: OLDER_REGISTRATION_ID },
        { id: REGISTRATION_ID },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: true,
      message: "Registration submitted to waitlist position #2.",
    });
    expect(createInAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentId: TOURNAMENT_ID,
        registrationId: REGISTRATION_ID,
        metadata: {
          bracketId: BRACKET_ID,
          bracketName: "Challenge",
          registrationStatus: "waitlisted",
          waitlistPosition: 2,
        },
      })
    );
  });

  it("reports success after commit when cache invalidation fails", async () => {
    const rawMarker = "private cache failure detail";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = createRegistrationClient();
    createSupabaseAdminClientMock.mockReturnValue(client.client);
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error(rawMarker);
    });

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: true,
      message: "Registration submitted.",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments");
    expect(createInAppNotificationMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(rawMarker);
  });

  it("fails closed when the atomic RPC does not confirm the fresh ELO snapshot", async () => {
    const client = createRegistrationClient({
      rpcResults: [
        {
          data: [
            {
              id: REGISTRATION_ID,
              tournament_id: TOURNAMENT_ID,
              tournament_bracket_id: BRACKET_ID,
              registration_status: "pending",
              submitted_elo: 1_199,
            },
          ],
          error: null,
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(result).toEqual({
      success: false,
      message:
        "Registration could not be submitted. Please try again or contact an admin.",
    });
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("never exposes or logs raw Relic or database failure details", async () => {
    const rawMarker =
      "steam=76561199999999999 https://provider.invalid raw_database_detail";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = createRegistrationClient({
      rpcResults: [
        {
          data: null,
          error: { code: "XX999", message: rawMarker },
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(client.client);

    const result = await submitTournamentRegistration(registrationInput());

    expect(JSON.stringify(result)).not.toContain(rawMarker);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(rawMarker);
    expect(result.message).toBe(
      "Registration could not be submitted. Please try again or contact an admin."
    );
  });
});
