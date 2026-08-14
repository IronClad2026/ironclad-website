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

vi.mock("@/lib/tournaments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tournaments")>();

  return {
    ...actual,
    getPublicTournamentRowsForRequest: <
      Tournament extends {
        id: string;
        slug: string;
        status: string;
      },
    >(
      tournaments: Tournament[],
      requestedReference: string | null
    ) => {
      const requested = requestedReference
        ? tournaments.find(
            (tournament) =>
              tournament.id === requestedReference ||
              tournament.slug === requestedReference
          )
        : null;

      return tournaments.filter(
        (tournament) =>
          !["cancelled", "voided"].includes(tournament.status) ||
          tournament.id === requested?.id
      );
    },
    getTournamentBracketDisplayName: (name: string) => name,
    isTournamentBracketPublic: (launchedAt: string | null) =>
      launchedAt !== null,
    mapTournamentRow: mapTournamentRowMock,
  };
});

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
    createdAt: "value",
    waitlistPosition: "value",
    waitlistOfferStatus: "value",
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
  participantCurrentElo = 1500,
  tournamentStatus = "in_progress",
  activeRegistrationCount = 2,
  includeWaitlistedRegistration = false,
  viewerRegistrationStatus:
    | "pending"
    | "manual_review"
    | "approved"
    | "rejected"
    | "waitlisted" = "approved",
  waitlistOfferStatus: "offered" | null = null,
  participantProfiles: Record<
    string,
    {
      accountClosedAt?: string | null;
      country?: string | null;
      currentElo?: number | null;
      inGameName?: string;
      publicProfileEnabled?: boolean;
    }
  > = {},
  viewerEloVerificationSource: string | null = "relic",
  viewerVerifiedElo: number | null = 1500
) {
  const rawTournament = {
    id: TOURNAMENT_ID,
    slug: "synthetic-tournament",
    title: "Synthetic Tournament",
    created_at: "2026-07-25T00:00:00.000Z",
    status: tournamentStatus,
    tournament_brackets: [
      {
        id: BRACKET_ID,
        tournament_id: TOURNAMENT_ID,
        name: "Main",
        launched_at:
          tournamentStatus === "registration_open"
            ? null
            : "2026-07-25T00:00:00.000Z",
        registered_players: 0,
        waitlisted_players: 0,
      },
    ],
  };
  const registrations: Array<{
    id: string;
    clerk_user_id: string;
    tournament_id: string;
    tournament_bracket_id: string;
    player_name: string;
    country: string | null;
    submitted_elo: number;
    elo_verified_elo: number | null;
    elo_verification_source: string | null;
    registration_status:
      | "pending"
      | "manual_review"
      | "approved"
      | "rejected"
      | "waitlisted";
    waitlist_offer_status: "offered" | null;
    admin_notes: string | null;
    created_at: string;
  }> = [
    {
      id: VIEWER_REGISTRATION_ID,
      clerk_user_id: viewerClerkUserId,
      tournament_id: TOURNAMENT_ID,
      tournament_bracket_id: BRACKET_ID,
      player_name: "Safe Viewer",
      country: "Australia",
      submitted_elo: 1500,
      elo_verified_elo: viewerVerifiedElo,
      elo_verification_source: viewerEloVerificationSource,
      registration_status: viewerRegistrationStatus,
      waitlist_offer_status: null,
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
      waitlist_offer_status: null,
      admin_notes: SECRET_ADMIN_ID,
      created_at: "2026-07-25T00:00:00.000Z",
    },
  ];
  for (let index = registrations.length; index < activeRegistrationCount; index += 1) {
    registrations.push({
      id: `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`,
      clerk_user_id: `user_synthetic_pending_${index}`,
      tournament_id: TOURNAMENT_ID,
      tournament_bracket_id: BRACKET_ID,
      player_name: `Pending Player ${index}`,
      country: null,
      submitted_elo: 1400 - index,
      elo_verified_elo: 1400 - index,
      elo_verification_source: "relic",
      registration_status: "pending",
      waitlist_offer_status: null,
      admin_notes: null,
      created_at: `2026-07-25T00:00:0${index}.000Z`,
    });
  }
  if (includeWaitlistedRegistration) {
    registrations.push({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clerk_user_id: "user_synthetic_waitlisted",
      tournament_id: TOURNAMENT_ID,
      tournament_bracket_id: BRACKET_ID,
      player_name: "Waitlisted Player",
      country: null,
      submitted_elo: 1300,
      elo_verified_elo: 1300,
      elo_verification_source: "relic",
      registration_status: "waitlisted",
      waitlist_offer_status: waitlistOfferStatus,
      admin_notes: null,
      created_at: "2026-07-25T00:00:08.000Z",
    });
  }
  const players = registrations.map((registration) => {
    const profile = participantProfiles[registration.clerk_user_id];

    return {
      account_closed_at: profile?.accountClosedAt ?? null,
      clerk_user_id: registration.clerk_user_id,
      country: profile?.country ?? registration.country,
      current_elo: profile?.currentElo ?? participantCurrentElo,
      in_game_name: profile?.inGameName ?? registration.player_name,
      public_profile_enabled: profile?.publicProfileEnabled ?? true,
    };
  });
  const results: Record<string, QueryResult> = {
    tournaments: { data: [rawTournament], error: null },
    registrations: { data: registrations, error: null },
    players: { data: players, error: null },
  };
  const viewerDivisionQuery = createQuery({
    data: { relic_verified_division: verifiedDivision },
    error: verifiedDivisionError,
  });
  const registrationQuery = createQuery(results.registrations);
  const participantPlayersQuery = createQuery(results.players);
  let playerQueryCount = 0;
  const from = vi.fn((table: string) => {
    if (table === "players") {
      playerQueryCount += 1;
      return playerQueryCount === 1
        ? viewerDivisionQuery
        : participantPlayersQuery;
    }

    if (table === "registrations") {
      return registrationQuery;
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
    registrationQuery,
    rpc: vi.fn(async () => ({
      data: [
        {
          bracket_id: BRACKET_ID,
          tournament_id: TOURNAMENT_ID,
          registered_players: 2,
          max_players: 32,
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
  tournamentStatus,
  activeRegistrationCount,
  includeWaitlistedRegistration,
  viewerRegistrationStatus,
  waitlistOfferStatus,
  requestedTournament,
  participantProfiles,
  viewerEloVerificationSource,
  viewerVerifiedElo,
}: {
  admin: boolean;
  participantCurrentElo?: number;
  verifiedDivision?: unknown;
  verifiedDivisionError?: QueryResult["error"];
  tournamentStatus?: string;
  activeRegistrationCount?: number;
  includeWaitlistedRegistration?: boolean;
  waitlistOfferStatus?: "offered" | null;
  requestedTournament?: string;
  participantProfiles?: Parameters<typeof createPageClient>[9];
  viewerEloVerificationSource?: string | null;
  viewerVerifiedElo?: number | null;
  viewerRegistrationStatus?:
    | "pending"
    | "manual_review"
    | "approved"
    | "rejected"
    | "waitlisted";
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
    participantCurrentElo,
    tournamentStatus,
    activeRegistrationCount,
    includeWaitlistedRegistration,
    viewerRegistrationStatus,
    waitlistOfferStatus,
    participantProfiles,
    viewerEloVerificationSource,
    viewerVerifiedElo
  );
  createSupabaseAdminClientMock.mockReturnValue(client);

  const element = await TournamentsPage({
    searchParams: Promise.resolve(
      requestedTournament ? { tournament: requestedTournament } : {}
    ),
  });
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
    getGeneratedBracketRegistrationIdsMock.mockImplementation(
      (rows: unknown[]) =>
        rows.length > 0
          ? new Set([VIEWER_REGISTRATION_ID, OPPONENT_REGISTRATION_ID])
          : new Set()
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
    mapGeneratedBracketsMock.mockImplementation((rows: unknown[]) =>
      rows.length > 0
        ? new Map([[TOURNAMENT_ID, [safeGeneratedBracket]]])
        : new Map()
    );
    mapTournamentRowMock.mockImplementation(
      (row: {
        created_at: string;
        id: string;
        status: string;
        title: string;
      }) => ({
        id: row.id,
        title: row.title,
        statusValue: row.status,
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

  it("keeps private administrator notes out of rejected-player payloads", async () => {
    const { client, props } = await loadClientProps({
      admin: false,
      viewerRegistrationStatus: "rejected",
    });
    const viewer = props.viewer as {
      registrations: Array<Record<string, unknown>>;
    };
    const [registrationColumns] = vi.mocked(
      client.registrationQuery.select
    ).mock.calls[0];

    expect(registrationColumns).toEqual(expect.any(String));
    expect(String(registrationColumns)).not.toContain("admin_notes");
    expect(viewer.registrations).toHaveLength(1);
    expect(viewer.registrations[0]).not.toHaveProperty("adminNotes");
    expect(serializePrivacyValue(viewer.registrations)).not.toContain(
      SECRET_RESULT_PATH
    );
    expect(serializePrivacyValue(viewer.registrations)).not.toContain(
      SECRET_SUPABASE_URL
    );
  });

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

  it("uses opted-in registration snapshots instead of later current-profile edits", async () => {
    const { client, props } = await loadClientProps({
      admin: false,
      participantCurrentElo: 1605,
      participantProfiles: {
        [SECRET_PLAYER_ID]: {
          country: "Italy",
          currentElo: 1605,
          inGameName: "NewCurrentIGN",
          publicProfileEnabled: true,
        },
      },
      viewerEloVerificationSource: null,
      viewerVerifiedElo: null,
    });
    const [tournament] = props.tournaments as Array<{
      participants: Array<{ country: string | null; elo: number | null; name: string }>;
    }>;
    const participant = tournament.participants.find(
      (entry) => entry.name === "Safe Viewer"
    );
    const [selectedColumns] = vi.mocked(
      client.participantPlayersQuery.select
    ).mock.calls[0];

    expect(selectedColumns).toBe(
      "clerk_user_id, public_profile_enabled, account_closed_at"
    );
    expect(participant).toEqual(
      expect.objectContaining({
        name: "Safe Viewer",
        country: "Australia",
        elo: 1500,
      })
    );
    expect(serializePrivacyValue(tournament.participants)).not.toContain(
      "NewCurrentIGN"
    );
    expect(serializePrivacyValue(tournament.participants)).not.toContain("Italy");
    expect(serializePrivacyValue(tournament.participants)).not.toContain("1605");
  });

  it("keeps opted-out competition identity while masking optional profile facts", async () => {
    const { props } = await loadClientProps({
      admin: false,
      participantProfiles: {
        [SECRET_PLAYER_ID]: {
          country: "Italy",
          currentElo: 1605,
          inGameName: "PrivateCurrentIGN",
          publicProfileEnabled: false,
        },
      },
    });
    const [tournament] = props.tournaments as Array<{
      participants: Array<{ country: string | null; elo: number | null; name: string }>;
    }>;
    const participant = tournament.participants.find(
      (entry) => entry.name === "Safe Viewer"
    );

    expect(participant).toEqual(
      expect.objectContaining({ name: "Safe Viewer", country: null, elo: null })
    );
    expect(serializePrivacyValue(tournament.participants)).not.toContain(
      "PrivateCurrentIGN"
    );
    expect(serializePrivacyValue(tournament.participants)).not.toContain("Italy");
    expect(serializePrivacyValue(tournament.participants)).not.toContain("1605");
  });

  it("uses explicit account closure state for historical competitors", async () => {
    const { props } = await loadClientProps({
      admin: false,
      participantProfiles: {
        [SECRET_PLAYER_ID]: {
          accountClosedAt: "2026-08-14T00:00:00.000Z",
          country: "Italy",
          currentElo: 1605,
          inGameName: "FormerPrivateIGN",
          publicProfileEnabled: false,
        },
      },
    });
    const [tournament] = props.tournaments as Array<{
      participants: Array<{
        country: string | null;
        elo: number | null;
        name: string;
        registrationId: string;
      }>;
    }>;
    const participant = tournament.participants.find(
      (entry) => entry.registrationId === VIEWER_REGISTRATION_ID
    );

    expect(participant).toEqual(
      expect.objectContaining({
        name: "Former Competitor",
        country: null,
        elo: null,
        registrationId: VIEWER_REGISTRATION_ID,
      })
    );
    expect(serializePrivacyValue(tournament.participants)).not.toContain(
      "FormerPrivateIGN"
    );
    expect(serializePrivacyValue(tournament.participants)).not.toContain("Italy");
    expect(serializePrivacyValue(tournament.participants)).not.toContain("1605");
  });

  it("excludes generated brackets from the prelaunch public payload", async () => {
    const { props } = await loadClientProps({
      admin: false,
      tournamentStatus: "registration_open",
    });
    const [tournament] = props.tournaments as Array<{
      generatedBrackets: unknown[];
    }>;

    expect(getGeneratedBracketRegistrationIdsMock).toHaveBeenCalledWith([]);
    expect(mapGeneratedBracketsMock).toHaveBeenCalledWith(
      [],
      expect.any(Array)
    );
    expect(tournament.generatedBrackets).toEqual([]);
  });

  it("loads an explicitly deep-linked terminal tournament with its factual history", async () => {
    const { props } = await loadClientProps({
      admin: false,
      tournamentStatus: "voided",
      requestedTournament: "synthetic-tournament",
    });

    expect(props.tournaments).toEqual([
      expect.objectContaining({
        id: TOURNAMENT_ID,
        statusValue: "voided",
      }),
    ]);
    expect(props.matchResultSubmissions).toEqual([safeSubmission]);
    expect(props.matchResultReportGroups).toEqual([safeReportGroup]);
  });

  it("derives the waitlist count from registrations when the capacity RPC omits it", async () => {
    await loadClientProps({
      admin: false,
      activeRegistrationCount: 7,
      includeWaitlistedRegistration: true,
    });

    expect(mapTournamentRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tournament_brackets: [
          expect.objectContaining({
            active_cohort_players: 7,
            registered_players: 2,
            waitlisted_players: 1,
          }),
        ],
      })
    );
  });

  it("counts an offer as reserved capacity but excludes it from the FIFO waitlist display", async () => {
    await loadClientProps({
      admin: false,
      activeRegistrationCount: 7,
      includeWaitlistedRegistration: true,
      waitlistOfferStatus: "offered",
    });

    expect(mapTournamentRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tournament_brackets: [
          expect.objectContaining({
            active_cohort_players: 8,
            waitlisted_players: 0,
          }),
        ],
      })
    );
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
