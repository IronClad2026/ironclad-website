import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  checkTransactionalEmailEligibility,
  TransactionalEmailEligibilityLookupError,
  type TransactionalEmailEligibilityClaim,
} from "@/lib/transactional-email/eligibility";

const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000001";
const CLAIM_TOKEN = "00000000-0000-4000-8000-000000000002";
const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";
const OPPONENT_REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const TOURNAMENT_ID = "44444444-4444-4444-8444-444444444444";
const BRACKET_ID = "55555555-5555-4555-8555-555555555555";
const GENERATED_BRACKET_ID = "66666666-6666-4666-8666-666666666666";
const ROUND_ID = "77777777-7777-4777-8777-777777777777";
const RECIPIENT_CLERK_ID = "user_email_recipient";
const NOW = new Date("2026-08-10T00:00:00.000Z");
const READY_DEADLINE = "2026-08-17T00:00:00.000Z";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryCall = {
  table: string;
  method: string;
  args: unknown[];
};

function createSupabaseMock(
  responses: Record<string, QueryResult | QueryResult[]>
) {
  const queues = new Map(
    Object.entries(responses).map(([table, value]) => [
      table,
      Array.isArray(value) ? [...value] : [value],
    ])
  );
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const result = queues.get(table)?.shift() ?? { data: null, error: null };
    const query = {} as Record<string, unknown> &
      PromiseLike<QueryResult>;
    for (const method of [
      "select",
      "eq",
      "in",
      "order",
      "limit",
      "maybeSingle",
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === "maybeSingle") return Promise.resolve(result);
        return query;
      };
    }
    query.then = (resolve, reject) =>
      Promise.resolve(result).then(resolve, reject);
    return query;
  });

  return { client: { from }, calls, from };
}

function registrationClaim(
  overrides: Partial<TransactionalEmailEligibilityClaim> = {}
): TransactionalEmailEligibilityClaim {
  return {
    id: NOTIFICATION_ID,
    recipientClerkUserId: RECIPIENT_CLERK_ID,
    type: "registration.approved",
    eventKey: `registration:${REGISTRATION_ID}:approved`,
    templateKey: "registration_approved",
    tournamentId: TOURNAMENT_ID,
    registrationId: REGISTRATION_ID,
    matchId: null,
    metadata: {
      registrationId: REGISTRATION_ID,
      tournamentId: TOURNAMENT_ID,
      bracketId: BRACKET_ID,
      tournamentName: "stale notification title",
      bracketName: "stale division",
    },
    attemptCount: 1,
    claimToken: CLAIM_TOKEN,
    ...overrides,
  };
}

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REGISTRATION_ID,
    clerk_user_id: RECIPIENT_CLERK_ID,
    registration_status: "approved",
    tournament_id: TOURNAMENT_ID,
    tournament_bracket_id: BRACKET_ID,
    ...overrides,
  };
}

function registrationDatabase(
  row: unknown,
  extras: Partial<Record<string, QueryResult>> = {}
) {
  return createSupabaseMock({
    registrations: { data: row, error: null },
    tournaments: {
      data: { id: TOURNAMENT_ID, title: "Current Open" },
      error: null,
    },
    tournament_brackets: {
      data: {
        id: BRACKET_ID,
        tournament_id: TOURNAMENT_ID,
        name: "Challenge",
      },
      error: null,
    },
    ...extras,
  });
}

type MatchTemplateKey =
  | "division_started_first_match"
  | "later_round_match_ready"
  | "deadline_reminder_72h"
  | "deadline_reminder_24h";

function matchClaim({
  templateKey = "division_started_first_match",
  deadlineAt = READY_DEADLINE,
  roundNumber = 1,
  activationVersion = 1,
  metadata = {},
}: {
  templateKey?: MatchTemplateKey;
  deadlineAt?: string;
  roundNumber?: number;
  activationVersion?: number;
  metadata?: Record<string, unknown>;
} = {}): TransactionalEmailEligibilityClaim {
  const reminderOrdinal =
    templateKey === "deadline_reminder_72h"
      ? 1
      : templateKey === "deadline_reminder_24h"
        ? 2
        : null;
  const type =
    reminderOrdinal === null ? "match.ready" : "match.deadline_reminder";
  const suffix =
    reminderOrdinal === null ? "ready" : `reminder:${reminderOrdinal}`;

  return {
    id: NOTIFICATION_ID,
    recipientClerkUserId: RECIPIENT_CLERK_ID,
    type,
    eventKey: `match:${MATCH_ID}:activation:${activationVersion}:${suffix}`,
    templateKey,
    tournamentId: TOURNAMENT_ID,
    registrationId: REGISTRATION_ID,
    matchId: MATCH_ID,
    metadata: {
      tournamentId: TOURNAMENT_ID,
      bracketId: BRACKET_ID,
      matchId: MATCH_ID,
      activationVersion,
      deadlineAt,
      deadlineEvent: reminderOrdinal === null ? "ready" : "reminder",
      ...(reminderOrdinal === null
        ? { roundNumber }
        : { reminderOrdinal }),
      ...metadata,
    },
    attemptCount: 1,
    claimToken: CLAIM_TOKEN,
  };
}

function matchRow(
  claim: TransactionalEmailEligibilityClaim,
  overrides: Record<string, unknown> = {}
) {
  const deadlineAt = claim.metadata.deadlineAt as string;
  const roundNumber =
    typeof claim.metadata.roundNumber === "number"
      ? claim.metadata.roundNumber
      : 2;

  return {
    id: MATCH_ID,
    generated_bracket_id: GENERATED_BRACKET_ID,
    match_number: 1,
    status: "in_progress",
    activation_version: 1,
    activated_at: "2026-08-09T00:00:00.000Z",
    deadline_at: deadlineAt,
    outcome_type: null,
    deadline_ruled_at: null,
    player_one_registration_id: REGISTRATION_ID,
    player_two_registration_id: OPPONENT_REGISTRATION_ID,
    player_one_score: null,
    player_two_score: null,
    winner_registration_id: null,
    official_result_submission_id: null,
    official_result_decided_by: null,
    official_result_decided_at: null,
    hold_started_at: null,
    hold_released_at: null,
    player_one: {
      id: REGISTRATION_ID,
      clerk_user_id: RECIPIENT_CLERK_ID,
      player_name: "Recipient Player",
    },
    player_two: {
      id: OPPONENT_REGISTRATION_ID,
      clerk_user_id: "user_opponent",
      player_name: "Current Opponent",
    },
    bracket_rounds: {
      id: ROUND_ID,
      generated_bracket_id: GENERATED_BRACKET_ID,
      round_number: roundNumber,
      name: roundNumber === 1 ? "Quarterfinal" : "Semifinal",
    },
    generated_brackets: {
      id: GENERATED_BRACKET_ID,
      format: "single_elimination",
      tournament_brackets: {
        id: BRACKET_ID,
        tournament_id: TOURNAMENT_ID,
        name: "Main",
        launched_at: "2026-08-09T00:00:00.000Z",
        tournaments: {
          id: TOURNAMENT_ID,
          title: "Current Championship",
        },
      },
    },
    ...overrides,
  };
}

function matchDatabase(
  claim: TransactionalEmailEligibilityClaim,
  {
    matchOverrides = {},
    reportGroups = [],
    submissions = [],
    lastRoundNumber = 3,
    feeders,
  }: {
    matchOverrides?: Record<string, unknown>;
    reportGroups?: unknown[];
    submissions?: unknown[];
    lastRoundNumber?: number;
    feeders?: unknown[];
  } = {}
) {
  const currentMatch = matchRow(claim, matchOverrides);
  const defaultFeeders = [
    {
      match_number: (currentMatch.match_number * 2) - 1,
      status: "completed",
      winner_registration_id: currentMatch.player_one_registration_id,
      outcome_type: null,
    },
    {
      match_number: currentMatch.match_number * 2,
      status: "completed",
      winner_registration_id: currentMatch.player_two_registration_id,
      outcome_type: null,
    },
  ];

  return createSupabaseMock({
    tournament_matches: [
      { data: currentMatch, error: null },
      { data: feeders ?? defaultFeeders, error: null },
    ],
    bracket_rounds: [
      { data: { round_number: lastRoundNumber }, error: null },
      { data: { id: ROUND_ID }, error: null },
    ],
    match_result_report_groups: { data: reportGroups, error: null },
    match_result_submissions: { data: submissions, error: null },
  });
}

describe("transactional email current-state eligibility", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("renders an approved registration only from current authoritative data", async () => {
    const database = registrationDatabase(registrationRow());
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(registrationClaim(), NOW)
    ).resolves.toEqual({
      eligible: true,
      templateKey: "registration_approved",
      data: {
        templateKey: "registration_approved",
        tournamentName: "Current Open",
        divisionName: "Challenge",
        registrationId: REGISTRATION_ID,
      },
    });
    expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
  });

  it("skips a registration that is no longer approved", async () => {
    const database = registrationDatabase(
      registrationRow({ registration_status: "withdrawn" })
    );
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(registrationClaim(), NOW)
    ).resolves.toEqual({
      eligible: false,
      disposition: "skipped",
      code: "REGISTRATION_OBSOLETE",
    });
    expect(database.from).toHaveBeenCalledTimes(1);
  });

  it("skips when the registration recipient no longer owns the row", async () => {
    const database = registrationDatabase(
      registrationRow({ clerk_user_id: "user_reassigned" })
    );
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(registrationClaim(), NOW)
    ).resolves.toMatchObject({
      eligible: false,
      disposition: "skipped",
      code: "RECIPIENT_MISMATCH",
    });
  });

  it("permanently rejects a noncanonical registration event key", async () => {
    const database = registrationDatabase(registrationRow());
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(
        registrationClaim({ eventKey: "registration:legacy:approved" }),
        NOW
      )
    ).resolves.toMatchObject({
      eligible: false,
      disposition: "permanent_failure",
      code: "CANONICAL_EVENT_INVALID",
    });
    expect(database.from).not.toHaveBeenCalled();
  });

  it("returns current first-round matchup render data", async () => {
    const claim = matchClaim();
    const database = matchDatabase(claim);
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toEqual({
      eligible: true,
      templateKey: "division_started_first_match",
      data: {
        templateKey: "division_started_first_match",
        tournamentName: "Current Championship",
        tournamentId: TOURNAMENT_ID,
        divisionName: "Main",
        roundName: "Quarterfinal",
        opponentName: "Current Opponent",
        matchId: MATCH_ID,
        deadlineAt: READY_DEADLINE,
      },
    });
  });

  it("allows only semifinal/final topology for later-round readiness", async () => {
    const claim = matchClaim({
      templateKey: "later_round_match_ready",
      roundNumber: 3,
    });
    const database = matchDatabase(claim, { lastRoundNumber: 4 });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: true,
      templateKey: "later_round_match_ready",
    });

    const quarterfinalClaim = matchClaim({
      templateKey: "later_round_match_ready",
      roundNumber: 2,
    });
    const quarterfinalDatabase = matchDatabase(quarterfinalClaim, {
      lastRoundNumber: 4,
    });
    createSupabaseAdminClientMock.mockReturnValue(quarterfinalDatabase.client);

    await expect(
      checkTransactionalEmailEligibility(quarterfinalClaim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "ROUND_NOT_ELIGIBLE",
    });
  });

  it("skips an activation-version mismatch", async () => {
    const claim = matchClaim();
    const database = matchDatabase(claim, {
      matchOverrides: { activation_version: 2 },
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "ACTIVATION_MISMATCH",
    });
  });

  it("skips reopened activations before querying match state", async () => {
    const claim = matchClaim({
      activationVersion: 2,
      metadata: { reopened: true },
    });
    const database = matchDatabase(claim);
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "REOPENED_ACTIVATION",
    });
    expect(database.from).not.toHaveBeenCalled();
  });

  it("treats even reopened=false metadata as a noncanonical activation", async () => {
    const claim = matchClaim({ metadata: { reopened: false } });
    const database = matchDatabase(claim);
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      disposition: "skipped",
      code: "REOPENED_ACTIVATION",
    });
    expect(database.from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a missing feeder",
      [
        {
          match_number: 1,
          status: "completed",
          winner_registration_id: REGISTRATION_ID,
          outcome_type: null,
        },
      ],
    ],
    [
      "a feeder winner mismatch",
      [
        {
          match_number: 1,
          status: "completed",
          winner_registration_id: OPPONENT_REGISTRATION_ID,
          outcome_type: null,
        },
        {
          match_number: 2,
          status: "completed",
          winner_registration_id: REGISTRATION_ID,
          outcome_type: null,
        },
      ],
    ],
    [
      "an unfinished feeder",
      [
        {
          match_number: 1,
          status: "in_progress",
          winner_registration_id: REGISTRATION_ID,
          outcome_type: null,
        },
        {
          match_number: 2,
          status: "completed",
          winner_registration_id: OPPONENT_REGISTRATION_ID,
          outcome_type: null,
        },
      ],
    ],
    [
      "an automatically derived feeder",
      [
        {
          match_number: 1,
          status: "completed",
          winner_registration_id: REGISTRATION_ID,
          outcome_type: "automatic_bye",
        },
        {
          match_number: 2,
          status: "completed",
          winner_registration_id: OPPONENT_REGISTRATION_ID,
          outcome_type: null,
        },
      ],
    ],
  ])("skips later-round readiness with %s", async (_label, feeders) => {
    const claim = matchClaim({
      templateKey: "later_round_match_ready",
      roundNumber: 2,
    });
    const database = matchDatabase(claim, {
      feeders,
      lastRoundNumber: 3,
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      disposition: "skipped",
      code: "MATCH_NOT_ACTIONABLE",
    });
  });

  it.each([
    ["completed match", { status: "completed" }],
    ["terminal outcome", { outcome_type: "deadline_double_forfeit" }],
    [
      "official result",
      { official_result_submission_id: "88888888-8888-4888-8888-888888888888" },
    ],
  ])("skips a %s", async (_label, matchOverrides) => {
    const claim = matchClaim();
    const database = matchDatabase(claim, { matchOverrides });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "MATCH_NOT_ACTIONABLE",
    });
  });

  it("skips an active administrative hold", async () => {
    const claim = matchClaim();
    const database = matchDatabase(claim, {
      matchOverrides: {
        hold_started_at: "2026-08-09T02:00:00.000Z",
        hold_released_at: null,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "MATCH_NOT_ACTIONABLE",
    });
  });

  it("skips a pending result submission", async () => {
    const claim = matchClaim();
    const database = matchDatabase(claim, {
      submissions: [{ status: "pending" }],
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "RESULT_ACTIVITY_PRESENT",
    });
  });

  it.each([
    [
      "pending confirmation",
      {
        status: "pending_confirmation",
        finalized_at: null,
        result_type: "normal",
        no_show_status: null,
      },
    ],
    [
      "dispute",
      {
        status: "disputed",
        finalized_at: null,
        result_type: "normal",
        no_show_status: null,
      },
    ],
    [
      "administrator review",
      {
        status: "under_review",
        finalized_at: null,
        result_type: "normal",
        no_show_status: null,
      },
    ],
    [
      "no-show",
      {
        status: "rejected",
        finalized_at: null,
        result_type: "no_show",
        no_show_status: "pending",
      },
    ],
  ])("skips active %s state", async (_label, reportGroup) => {
    const claim = matchClaim();
    const database = matchDatabase(claim, { reportGroups: [reportGroup] });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "RESULT_ACTIVITY_PRESENT",
    });
  });

  it("renders the current deadline when an actionable ready match was extended", async () => {
    const claim = matchClaim();
    const currentDeadline = "2026-08-18T00:00:00.000Z";
    const database = matchDatabase(claim, {
      matchOverrides: { deadline_at: currentDeadline },
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: true,
      data: { deadlineAt: currentDeadline },
    });
  });

  it("skips a reminder when its canonical deadline has changed", async () => {
    const claim = matchClaim({
      templateKey: "deadline_reminder_72h",
      deadlineAt: "2026-08-12T12:00:00.000Z",
    });
    const database = matchDatabase(claim, {
      matchOverrides: { deadline_at: "2026-08-12T13:00:00.000Z" },
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      disposition: "skipped",
      code: "DEADLINE_CHANGED",
    });
  });

  it.each([
    [
      "deadline_reminder_72h" as const,
      "2026-08-11T00:00:00.000Z",
    ],
    [
      "deadline_reminder_72h" as const,
      "2026-08-13T00:00:00.001Z",
    ],
    [
      "deadline_reminder_24h" as const,
      "2026-08-11T00:00:00.001Z",
    ],
    [
      "deadline_reminder_24h" as const,
      "2026-08-09T23:59:59.999Z",
    ],
  ])("skips an obsolete %s window at %s", async (templateKey, deadlineAt) => {
    const claim = matchClaim({ templateKey, deadlineAt });
    const database = matchDatabase(claim);
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: false,
      code: "REMINDER_WINDOW_OBSOLETE",
    });
  });

  it.each([
    ["deadline_reminder_72h" as const, "2026-08-12T12:00:00.000Z"],
    ["deadline_reminder_24h" as const, "2026-08-10T12:00:00.000Z"],
  ])("accepts a current %s", async (templateKey, deadlineAt) => {
    const claim = matchClaim({ templateKey, deadlineAt });
    const database = matchDatabase(claim);
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      checkTransactionalEmailEligibility(claim, NOW)
    ).resolves.toMatchObject({
      eligible: true,
      templateKey,
      data: { templateKey, deadlineAt },
    });
  });

  it("throws only a sanitized stable lookup error on database failure", async () => {
    const claim = matchClaim();
    const database = createSupabaseMock({
      tournament_matches: {
        data: null,
        error: { message: "sensitive database detail" },
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    const error = await checkTransactionalEmailEligibility(claim, NOW).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(TransactionalEmailEligibilityLookupError);
    expect(error).toMatchObject({ code: "ELIGIBILITY_LOOKUP_FAILED" });
    expect(String(error)).not.toContain("sensitive database detail");
  });
});
