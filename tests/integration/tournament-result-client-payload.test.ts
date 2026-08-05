import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";
import {
  expectExactShape,
  expectNoSensitiveBrowserData,
  serializePrivacyValue,
  type ExactShape,
} from "@/tests/helpers/privacy-assertions";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const getEloVerificationSettingMock = vi.hoisted(() => vi.fn());
const getGeneratedBracketRegistrationIdsMock = vi.hoisted(() => vi.fn());
const loadGeneratedBracketPageRowsMock = vi.hoisted(() => vi.fn());
const loadMatchResultDataMock = vi.hoisted(() => vi.fn());
const mapGeneratedBracketsMock = vi.hoisted(() => vi.fn());
const mapTournamentRowMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/components/TournamentsExperience", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/lib/match-result-data", () => ({
  loadMatchResultData: loadMatchResultDataMock,
}));

vi.mock("@/lib/platform-settings", () => ({
  getEloVerificationSetting: getEloVerificationSettingMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/tournament-bracket-data", () => ({
  getGeneratedBracketRegistrationIds:
    getGeneratedBracketRegistrationIdsMock,
  loadGeneratedBracketPageRows: loadGeneratedBracketPageRowsMock,
  mapGeneratedBrackets: mapGeneratedBracketsMock,
}));

vi.mock("@/lib/tournaments", () => ({
  getTournamentBracketDisplayName: (name: string) => name,
  mapTournamentRow: mapTournamentRowMock,
}));

import TournamentsPage from "@/app/tournaments/page";

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const BRACKET_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const SUBMISSION_ID = "44444444-4444-4444-8444-444444444444";
const REPORT_GROUP_ID = "55555555-5555-4555-8555-555555555555";
const PROOF_ID = "66666666-6666-4666-8666-666666666666";
const VIEWER_REGISTRATION_ID =
  "77777777-7777-4777-8777-777777777777";
const OPPONENT_REGISTRATION_ID =
  "88888888-8888-4888-8888-888888888888";
const SECRET_PLAYER_ID = "user_synthetic_browser_player";
const SECRET_ADMIN_ID = "user_synthetic_browser_admin";
const SECRET_OPPONENT_ID = "user_synthetic_browser_opponent";
const SECRET_RESULT_PATH =
  `${MATCH_ID}/${SECRET_PLAYER_ID}/legacy/private-game.rec`;
const SECRET_SUPABASE_URL =
  `https://synthetic.supabase.co/storage/v1/object/sign/match-proofs/${SECRET_RESULT_PATH}`;

const safeSubmission = {
  id: SUBMISSION_ID,
  submissionNumber: 2,
  gameNumber: 1,
  matchId: MATCH_ID,
  submittedByRegistrationId: VIEWER_REGISTRATION_ID,
  submittedByViewer: true,
  claimedWinnerRegistrationId: VIEWER_REGISTRATION_ID,
  playerOneScore: 2,
  playerTwoScore: 1,
  hasReplay: true,
  hasScreenshot: false,
  replayAccessHref:
    `/api/match-proofs/${MATCH_ID}/submission/${SUBMISSION_ID}/replay`,
  screenshotAccessHref: null,
  notes: "Synthetic safe note",
  status: "approved" as const,
  reviewNotes: "Synthetic safe review",
  reviewerLabel: "Administrator" as const,
  reviewedAt: "2026-07-25T02:00:00.000Z",
  createdAt: "2026-07-25T00:00:00.000Z",
};

const safeReportGroup = {
  id: REPORT_GROUP_ID,
  matchId: MATCH_ID,
  tournamentId: TOURNAMENT_ID,
  resultType: "normal" as const,
  submittedByRegistrationId: VIEWER_REGISTRATION_ID,
  submittedByViewer: true,
  opponentRegistrationId: OPPONENT_REGISTRATION_ID,
  winnerRegistrationId: VIEWER_REGISTRATION_ID,
  playerOneScore: 2,
  playerTwoScore: 1,
  hasReplay: true,
  replayAccessHref:
    `/api/match-proofs/${MATCH_ID}/report-group/${REPORT_GROUP_ID}/replay`,
  replayProofs: [
    {
      id: PROOF_ID,
      gameNumber: 1,
      proofAvailable: true,
      replayAccessHref:
        `/api/match-proofs/${MATCH_ID}/submission/${PROOF_ID}/replay`,
    },
  ],
  status: "approved" as const,
  confirmationDeadlineAt: "2026-07-25T01:00:00.000Z",
  confirmedAt: null,
  disputedAt: null,
  disputeNotes: null,
  reviewerLabel: "Administrator" as const,
  reviewedAt: "2026-07-25T02:00:00.000Z",
  reviewNotes: "Synthetic safe group review",
  noShowReportedByRegistrationId: null,
  noShowRegistrationId: null,
  noShowStatus: null,
  noShowNote: null,
  noShowResolvedAt: null,
  noShowResolverLabel: null,
  finalizedAt: "2026-07-25T02:00:00.000Z",
  finalizedSource: "admin_review",
  createdAt: "2026-07-25T00:00:00.000Z",
};

const safeGeneratedBracket = {
  id: BRACKET_ID,
  tournamentBracketId: BRACKET_ID,
  format: "single_elimination" as const,
  slotCount: 2,
  generatedAt: "2026-07-25T00:00:00.000Z",
  matches: [
    {
      id: MATCH_ID,
      seriesBestOf: 3,
      roundName: "Final",
      roundNumber: 1,
      matchNumber: 1,
      status: "completed" as const,
      playerOneRegistrationId: VIEWER_REGISTRATION_ID,
      playerTwoRegistrationId: OPPONENT_REGISTRATION_ID,
      playerOneSlot: 1,
      playerTwoSlot: 2,
      playerOneScore: 2,
      playerTwoScore: 1,
      winnerRegistrationId: VIEWER_REGISTRATION_ID,
      officialResultReference: SUBMISSION_ID,
      officialResultDecisionLabel: "Administrator" as const,
      officialResultDecidedAt: "2026-07-25T02:00:00.000Z",
    },
  ],
  standings: [
    {
      registrationId: VIEWER_REGISTRATION_ID,
      wins: 1,
      losses: 0,
      points: 3,
      rank: 1,
    },
  ],
};

const submissionShape = {
  object: Object.fromEntries(
    Object.keys(safeSubmission).map((key) => [key, "value"])
  ),
} as ExactShape;

const proofShape = {
  object: {
    id: "value",
    gameNumber: "value",
    proofAvailable: "value",
    replayAccessHref: "value",
  },
} satisfies ExactShape;

const reportGroupShape = {
  object: {
    ...Object.fromEntries(
      Object.keys(safeReportGroup)
        .filter((key) => key !== "replayProofs")
        .map((key) => [key, "value"])
    ),
    replayProofs: { array: proofShape },
  },
} as ExactShape;

const viewerRegistrationShape = {
  object: {
    id: "value",
    tournamentId: "value",
    tournamentBracketId: "value",
    bracketName: "value",
    status: "value",
    adminNotes: "value",
    createdAt: "value",
    waitlistPosition: "value",
  },
} satisfies ExactShape;

const clientPropsShape = {
  object: {
    tournaments: { array: "value" },
    viewer: {
      object: {
        isAdmin: "value",
        relicVerifiedDivision: "value",
        registrationIds: { array: "value" },
        registrations: { array: viewerRegistrationShape },
      },
    },
    matchResultSubmissions: { array: submissionShape },
    matchResultReportGroups: { array: reportGroupShape },
    eloVerificationEnabled: "value",
  },
} satisfies ExactShape;

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};
type Query = PromiseLike<QueryResult> & {
  eq: (...args: unknown[]) => Query;
  in: (...args: unknown[]) => Query;
  maybeSingle: () => Promise<QueryResult>;
  not: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  select: (...args: unknown[]) => Query;
};

function createQuery(result: QueryResult) {
  const query = {} as Query;
  for (const method of ["eq", "in", "not", "order", "select"] as const) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => result);
  query.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function createPageClient(
  viewerClerkUserId: string,
  verifiedDivision: unknown = "Challenge",
  verifiedDivisionError: QueryResult["error"] = null,
  participantCurrentElo = 1500
) {
  const rawTournament = {
    id: TOURNAMENT_ID,
    slug: "synthetic-tournament",
    title: "Synthetic Tournament",
    created_at: "2026-07-25T00:00:00.000Z",
    tournament_brackets: [
      {
        id: BRACKET_ID,
        tournament_id: TOURNAMENT_ID,
        name: "Main",
        registered_players: 0,
        waitlisted_players: 0,
      },
    ],
  };
  const registrations = [
    {
      id: VIEWER_REGISTRATION_ID,
      clerk_user_id: viewerClerkUserId,
      tournament_id: TOURNAMENT_ID,
      tournament_bracket_id: BRACKET_ID,
      player_name: "Safe Viewer",
      country: "Australia",
      submitted_elo: 1500,
      elo_verified_elo: 1500,
      elo_verification_source: "relic",
      registration_status: "approved",
      admin_notes: `${SECRET_RESULT_PATH} ${SECRET_SUPABASE_URL}`,
      created_at: "2026-07-25T00:00:00.000Z",
    },
    {
      id: OPPONENT_REGISTRATION_ID,
      clerk_user_id: SECRET_OPPONENT_ID,
      tournament_id: TOURNAMENT_ID,
      tournament_bracket_id: BRACKET_ID,
      player_name: "Safe Opponent",
      country: "New Zealand",
      submitted_elo: 1450,
      elo_verified_elo: 1450,
      elo_verification_source: "relic",
      registration_status: "approved",
      admin_notes: SECRET_ADMIN_ID,
      created_at: "2026-07-25T00:00:00.000Z",
    },
  ];
  const players = registrations.map((registration) => ({
    clerk_user_id: registration.clerk_user_id,
    in_game_name: registration.player_name,
    country: registration.country,
    current_elo: participantCurrentElo,
  }));
  const results: Record<string, QueryResult> = {
    tournaments: { data: [rawTournament], error: null },
    registrations: { data: registrations, error: null },
    players: { data: players, error: null },
  };
  const viewerDivisionQuery = createQuery({
    data: { relic_verified_division: verifiedDivision },
    error: verifiedDivisionError,
  });
  const participantPlayersQuery = createQuery(results.players);
  let playerQueryCount = 0;
  const from = vi.fn((table: string) => {
    if (table === "players") {
      playerQueryCount += 1;
      return playerQueryCount === 1
        ? viewerDivisionQuery
        : participantPlayersQuery;
    }

    const result = results[table];

    if (!result) {
      throw new Error(`Unexpected mocked page table: ${table}`);
    }

    return createQuery(result);
  });

  return {
    from,
    participantPlayersQuery,
    rpc: vi.fn(async () => ({
      data: [
        {
          bracket_id: BRACKET_ID,
          registered_players: 2,
          waitlisted_players: 0,
        },
      ],
      error: null,
    })),
    viewerDivisionQuery,
  };
}

async function loadClientProps({
  admin,
  participantCurrentElo,
  verifiedDivision,
  verifiedDivisionError,
}: {
  admin: boolean;
  participantCurrentElo?: number;
  verifiedDivision?: unknown;
  verifiedDivisionError?: QueryResult["error"];
}) {
  const viewerClerkUserId = admin ? SECRET_ADMIN_ID : SECRET_PLAYER_ID;
  authMock.mockResolvedValue({
    ...(admin ? adminIdentity : playerIdentity),
    userId: viewerClerkUserId,
  });
  const client = createPageClient(
    viewerClerkUserId,
    verifiedDivision,
    verifiedDivisionError,
    participantCurrentElo
  );
  createSupabaseAdminClientMock.mockReturnValue(client);

  const element = await TournamentsPage();
  expect(isValidElement(element)).toBe(true);

  if (!isValidElement(element)) {
    throw new Error("TournamentsPage did not return a React element.");
  }

  return {
    client,
    props: element.props as Record<string, unknown>,
  };
}

describe("tournament Client Component result payload", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    getEloVerificationSettingMock.mockReset();
    getGeneratedBracketRegistrationIdsMock.mockReset();
    loadGeneratedBracketPageRowsMock.mockReset();
    loadMatchResultDataMock.mockReset();
    mapGeneratedBracketsMock.mockReset();
    mapTournamentRowMock.mockReset();

    getEloVerificationSettingMock.mockResolvedValue({
      enabled: true,
      error: null,
    });
    getGeneratedBracketRegistrationIdsMock.mockReturnValue(
      new Set([VIEWER_REGISTRATION_ID, OPPONENT_REGISTRATION_ID])
    );
    loadGeneratedBracketPageRowsMock.mockResolvedValue({
      data: [
        {
          id: BRACKET_ID,
          tournament_bracket_id: BRACKET_ID,
          format: "single_elimination",
          slot_count: 2,
          generated_at: "2026-07-25T00:00:00.000Z",
          synthetic_server_only_audit: SECRET_ADMIN_ID,
        },
      ],
      error: null,
    });
    loadMatchResultDataMock.mockResolvedValue({
      submissions: [safeSubmission],
      reportGroups: [safeReportGroup],
      viewerRole: "participant",
    });
    mapGeneratedBracketsMock.mockReturnValue(
      new Map([[TOURNAMENT_ID, [safeGeneratedBracket]]])
    );
    mapTournamentRowMock.mockImplementation(
      (row: { created_at: string; id: string; title: string }) => ({
        id: row.id,
        title: row.title,
        statusValue: "active",
        grandFinalAt: null,
        createdAt: row.created_at,
        participants: [],
        bracketParticipants: [],
        generatedBrackets: [],
        players: 0,
      })
    );
  });

  it.each([
    ["participant", false],
    ["administrator", true],
  ])(
    "serializes only allowlisted same-origin result props for an %s",
    async (_name, admin) => {
      const { props } = await loadClientProps({ admin });

      expectExactShape(props, clientPropsShape);
      expectNoSensitiveBrowserData(props, [
        SECRET_PLAYER_ID,
        SECRET_ADMIN_ID,
        SECRET_OPPONENT_ID,
        SECRET_RESULT_PATH,
        SECRET_SUPABASE_URL,
      ]);
      expect(serializePrivacyValue(props)).not.toContain("supabase.co");
      expect(
        (props.matchResultSubmissions as typeof safeSubmission[])[0]
          .replayAccessHref
      ).toMatch(/^\/api\/match-proofs\//);
      expect(
        (props.matchResultReportGroups as typeof safeReportGroup[])[0]
          .replayProofs[0].replayAccessHref
      ).toMatch(/^\/api\/match-proofs\//);
      expect(loadGeneratedBracketPageRowsMock).toHaveBeenCalledWith({
        includeAdminAudit: admin,
      });
      expect(loadMatchResultDataMock).toHaveBeenCalledOnce();
    }
  );

  it("loads only the authenticated player's private verified division", async () => {
    const { client, props } = await loadClientProps({
      admin: false,
      participantCurrentElo: 500,
      verifiedDivision: "Main / Pro",
    });
    const viewer = props.viewer as {
      relicVerifiedDivision: string | null;
    };

    expect(client.viewerDivisionQuery.select).toHaveBeenCalledWith(
      "relic_verified_division"
    );
    expect(client.viewerDivisionQuery.eq).toHaveBeenCalledWith(
      "clerk_user_id",
      SECRET_PLAYER_ID
    );
    expect(client.viewerDivisionQuery.maybeSingle).toHaveBeenCalledOnce();
    expect(viewer.relicVerifiedDivision).toBe("Main / Pro");
  });

  it("keeps Relic registration ELO snapshots frozen when profile Current ELO changes", async () => {
    const { props } = await loadClientProps({
      admin: false,
      participantCurrentElo: 500,
    });
    const [tournament] = props.tournaments as Array<{
      bracketParticipants: Array<{ elo: number }>;
      participants: Array<{ elo: number }>;
    }>;

    expect(tournament.participants.map((participant) => participant.elo)).toEqual([
      1500,
      1450,
    ]);
    expect(
      tournament.bracketParticipants.map((participant) => participant.elo)
    ).toEqual([1500, 1450]);
  });

  it.each([
    ["Academy", "Academy"],
    ["Challenge", "Challenge"],
    ["Main / Pro", "Main / Pro"],
    ["Main", null],
    ["", null],
    [null, null],
  ])(
    "normalizes the private verified division %j to %j",
    async (verifiedDivision, expected) => {
      const { props } = await loadClientProps({
        admin: false,
        verifiedDivision,
      });
      const viewer = props.viewer as {
        relicVerifiedDivision: string | null;
      };

      expect(viewer.relicVerifiedDivision).toBe(expected);
    }
  );

  it("returns a safe null division when the private lookup fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { props } = await loadClientProps({
      admin: false,
      verifiedDivision: "Challenge",
      verifiedDivisionError: {
        message: `${SECRET_PLAYER_ID} private database detail`,
      },
    });
    const viewer = props.viewer as {
      relicVerifiedDivision: string | null;
    };

    expect(viewer.relicVerifiedDivision).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "Tournament verified division load failed."
    );
    expect(serializePrivacyValue(consoleError.mock.calls)).not.toContain(
      SECRET_PLAYER_ID
    );
  });
});
