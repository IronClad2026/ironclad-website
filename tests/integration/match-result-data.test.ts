import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";
import {
  expectExactShape,
  expectNoSensitiveBrowserData,
  type ExactShape,
} from "@/tests/helpers/privacy-assertions";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  buildReportGroupPresentation,
  buildSubmissionPresentation,
  loadAdminMatchResultAudit,
  loadMatchResultData,
} from "@/lib/match-result-data";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_GROUP_ID = "33333333-3333-4333-8333-333333333333";
const PROOF_ONE_ID = "44444444-4444-4444-8444-444444444444";
const PROOF_TWO_ID = "55555555-5555-4555-8555-555555555555";
const SUBMITTER_REGISTRATION_ID =
  "66666666-6666-4666-8666-666666666666";
const OPPONENT_REGISTRATION_ID =
  "77777777-7777-4777-8777-777777777777";
const WINNER_REGISTRATION_ID =
  "88888888-8888-4888-8888-888888888888";
const SECRET_SUBMITTER_ID = "user_synthetic_private_submitter";
const SECRET_REVIEWER_ID = "user_synthetic_private_reviewer";
const SECRET_RESOLVER_ID = "user_synthetic_private_resolver";
const SECRET_REPLAY_PATH =
  `${MATCH_ID}/${SECRET_SUBMITTER_ID}/legacy/game-one.rec`;
const SECRET_SCREENSHOT_PATH =
  `${MATCH_ID}/${SECRET_SUBMITTER_ID}/legacy/screenshot.png`;

const submissionRow = {
  id: SUBMISSION_ID,
  submission_number: 4,
  game_number: 1,
  match_id: MATCH_ID,
  submitted_by_registration_id: SUBMITTER_REGISTRATION_ID,
  claimed_winner_registration_id: WINNER_REGISTRATION_ID,
  player_one_score: 2,
  player_two_score: 1,
  replay_storage_path: SECRET_REPLAY_PATH,
  screenshot_storage_path: SECRET_SCREENSHOT_PATH,
  notes: "Synthetic player note",
  status: "approved" as const,
  review_notes: "Synthetic safe review message",
  reviewed_at: "2026-07-25T01:00:00.000Z",
  created_at: "2026-07-25T00:00:00.000Z",
  report_group_id: null,
};

const reportGroupRow = {
  id: REPORT_GROUP_ID,
  match_id: MATCH_ID,
  tournament_id: "99999999-9999-4999-8999-999999999999",
  result_type: "normal" as const,
  submitted_by_registration_id: SUBMITTER_REGISTRATION_ID,
  opponent_registration_id: OPPONENT_REGISTRATION_ID,
  winner_registration_id: WINNER_REGISTRATION_ID,
  player_one_score: 2,
  player_two_score: 1,
  replay_storage_path: SECRET_REPLAY_PATH,
  status: "approved" as const,
  confirmation_deadline_at: "2026-07-25T02:00:00.000Z",
  confirmed_at: null,
  disputed_at: null,
  dispute_notes: null,
  reviewed_at: "2026-07-25T03:00:00.000Z",
  review_notes: "Synthetic safe group review",
  no_show_reported_by_registration_id: null,
  no_show_registration_id: null,
  no_show_status: null,
  no_show_note: null,
  no_show_resolved_at: "2026-07-25T03:00:00.000Z",
  finalized_at: "2026-07-25T03:00:00.000Z",
  finalized_source: "admin_review",
  created_at: "2026-07-25T00:00:00.000Z",
};

const replayProofRows = [
  {
    id: PROOF_TWO_ID,
    report_group_id: REPORT_GROUP_ID,
    match_id: MATCH_ID,
    game_number: 2,
    claimed_winner_registration_id: WINNER_REGISTRATION_ID,
    replay_storage_path:
      `${MATCH_ID}/${SECRET_SUBMITTER_ID}/legacy/game-two.rec`,
  },
  {
    id: PROOF_ONE_ID,
    report_group_id: REPORT_GROUP_ID,
    match_id: MATCH_ID,
    game_number: 1,
    claimed_winner_registration_id: WINNER_REGISTRATION_ID,
    replay_storage_path: SECRET_REPLAY_PATH,
  },
];

const adminAudit = {
  submissions: new Map([
    [
      SUBMISSION_ID,
      {
        submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
        reviewed_by: SECRET_REVIEWER_ID,
      },
    ],
  ]),
  reportGroups: new Map([
    [
      REPORT_GROUP_ID,
      {
        submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
        reviewed_by: SECRET_REVIEWER_ID,
        no_show_resolved_by: SECRET_RESOLVER_ID,
      },
    ],
  ]),
};

const submissionShape = {
  object: {
    id: "value",
    submissionNumber: "value",
    gameNumber: "value",
    matchId: "value",
    submittedByRegistrationId: "value",
    submittedByViewer: "value",
    claimedWinnerRegistrationId: "value",
    playerOneScore: "value",
    playerTwoScore: "value",
    hasReplay: "value",
    hasScreenshot: "value",
    replayAccessHref: "value",
    screenshotAccessHref: "value",
    notes: "value",
    status: "value",
    reviewNotes: "value",
    reviewerLabel: "value",
    reviewedAt: "value",
    createdAt: "value",
  },
} satisfies ExactShape;

const replayProofShape = {
  object: {
    id: "value",
    gameNumber: "value",
    proofAvailable: "value",
    winnerRegistrationId: "value",
    replayAccessHref: "value",
  },
} satisfies ExactShape;

const reportGroupShape = {
  object: {
    id: "value",
    matchId: "value",
    tournamentId: "value",
    resultType: "value",
    submittedByRegistrationId: "value",
    submittedByViewer: "value",
    opponentRegistrationId: "value",
    winnerRegistrationId: "value",
    playerOneScore: "value",
    playerTwoScore: "value",
    hasReplay: "value",
    replayAccessHref: "value",
    replayProofs: { array: replayProofShape },
    status: "value",
    confirmationDeadlineAt: "value",
    confirmedAt: "value",
    disputedAt: "value",
    disputeNotes: "value",
    reviewerLabel: "value",
    reviewedAt: "value",
    reviewNotes: "value",
    noShowReportedByRegistrationId: "value",
    noShowRegistrationId: "value",
    noShowStatus: "value",
    noShowNote: "value",
    noShowResolvedAt: "value",
    noShowResolverLabel: "value",
    finalizedAt: "value",
    finalizedSource: "value",
    createdAt: "value",
  },
} satisfies ExactShape;

const matchResultDataShape = {
  object: {
    submissions: { array: submissionShape },
    reportGroups: { array: reportGroupShape },
    viewerRole: "value",
    error: "value",
  },
} satisfies ExactShape;

type QueryError = { message: string } | null;
type QueryResult = {
  data: unknown;
  error: QueryError;
};
type QueryCall = {
  args: unknown[];
  method: string;
  table: string;
};
type Query = PromiseLike<QueryResult> & {
  eq: (...args: unknown[]) => Query;
  in: (...args: unknown[]) => Query;
  is: (...args: unknown[]) => Query;
  not: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  select: (...args: unknown[]) => Query;
};

function createQueuedClient(
  queues: Record<string, QueryResult[]>
) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const result = queues[table]?.shift();

    if (!result) {
      throw new Error(`Unexpected mocked table query: ${table}`);
    }

    const query = {} as Query;
    for (const method of [
      "eq",
      "in",
      "is",
      "not",
      "order",
      "select",
    ] as const) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return query;
      };
    }
    query.then = (resolve, reject) =>
      Promise.resolve(result).then(resolve, reject);

    return query;
  });

  return {
    calls,
    client: { from },
    from,
  };
}

function participantClient(viewerRegistrationId: string) {
  return createQueuedClient({
    registrations: [
      {
        data: [{ id: viewerRegistrationId }],
        error: null,
      },
    ],
    tournament_matches: [
      { data: [{ id: MATCH_ID }], error: null },
      { data: [], error: null },
    ],
    match_result_report_groups: [
      {
        data:
          viewerRegistrationId === SUBMITTER_REGISTRATION_ID
            ? [reportGroupRow]
            : [],
        error: null,
      },
      {
        data:
          viewerRegistrationId === OPPONENT_REGISTRATION_ID
            ? [reportGroupRow]
            : [],
        error: null,
      },
    ],
    match_result_submissions: [
      { data: [submissionRow], error: null },
      { data: replayProofRows, error: null },
    ],
  });
}

describe("match-result server data boundary", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("builds an exact participant submission DTO without raw audit or proof data", () => {
    const presentation = buildSubmissionPresentation(
      submissionRow,
      new Set([SUBMITTER_REGISTRATION_ID]),
      adminAudit
    );

    expectExactShape(presentation, submissionShape);
    expect(presentation).toMatchObject({
      submittedByViewer: true,
      hasReplay: true,
      hasScreenshot: true,
      reviewerLabel: "Administrator",
      replayAccessHref:
        `/api/match-proofs/${MATCH_ID}/submission/${SUBMISSION_ID}/replay`,
      screenshotAccessHref:
        `/api/match-proofs/${MATCH_ID}/submission/${SUBMISSION_ID}/screenshot`,
    });
    expectNoSensitiveBrowserData(presentation, [
      SECRET_REPLAY_PATH,
      SECRET_SCREENSHOT_PATH,
      SECRET_SUBMITTER_ID,
      SECRET_REVIEWER_ID,
    ]);
  });

  it("builds exact, ordered replay DTOs while hiding historical paths and resolver IDs", () => {
    const presentation = buildReportGroupPresentation(
      reportGroupRow,
      replayProofRows,
      new Set([OPPONENT_REGISTRATION_ID]),
      adminAudit
    );

    expectExactShape(presentation, reportGroupShape);
    expect(presentation.submittedByViewer).toBe(false);
    expect(presentation.reviewerLabel).toBe("Administrator");
    expect(presentation.noShowResolverLabel).toBe("Administrator");
    expect(presentation.replayProofs.map((proof) => proof.id)).toEqual([
      PROOF_ONE_ID,
      PROOF_TWO_ID,
    ]);
    expect(presentation.replayProofs.map((proof) => proof.gameNumber)).toEqual([
      1,
      2,
    ]);
    expectNoSensitiveBrowserData(presentation, [
      SECRET_REPLAY_PATH,
      SECRET_SUBMITTER_ID,
      SECRET_REVIEWER_ID,
      SECRET_RESOLVER_ID,
    ]);
  });

  it("rejects a replay proof that is attached to another match", () => {
    expect(() =>
      buildReportGroupPresentation(
        reportGroupRow,
        [
          {
            ...replayProofRows[0],
            match_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
        ],
        new Set([SUBMITTER_REGISTRATION_ID])
      )
    ).toThrow("Replay proof scope mismatch.");
  });

  it("returns an exact empty projection anonymously without service access", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await loadMatchResultData();

    expectExactShape(result, matchResultDataShape);
    expect(result).toEqual({
      submissions: [],
      reportGroups: [],
      viewerRole: "anonymous",
      error: null,
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed for an authenticated viewer with no tournament registration", async () => {
    const supabase = createQueuedClient({
      registrations: [{ data: [], error: null }],
    });
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const result = await loadMatchResultData();

    expectExactShape(result, matchResultDataShape);
    expect(result).toEqual({
      submissions: [],
      reportGroups: [],
      viewerRole: "participant",
      error: null,
    });
    expect(supabase.from).toHaveBeenCalledOnce();
    expect(supabase.from).toHaveBeenCalledWith("registrations");
  });

  it("distinguishes an authenticated load failure from a genuine empty result", async () => {
    const supabase = createQueuedClient({
      registrations: [
        { data: null, error: { message: SECRET_REPLAY_PATH } },
      ],
    });
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const result = await loadMatchResultData();

    expect(result).toEqual({
      submissions: [],
      reportGroups: [],
      viewerRole: "participant",
      error: "load-failed",
    });
    expectNoSensitiveBrowserData(result, [SECRET_REPLAY_PATH]);
  });

  it.each([
    ["submitting player", SUBMITTER_REGISTRATION_ID, true],
    ["same-match opponent", OPPONENT_REGISTRATION_ID, false],
  ])(
    "returns only allowlisted data to the %s",
    async (_name, viewerRegistrationId, submittedByViewer) => {
      const supabase = participantClient(viewerRegistrationId);
      authMock.mockResolvedValue(playerIdentity);
      createSupabaseAdminClientMock.mockReturnValue(supabase.client);

      const result = await loadMatchResultData();

      expectExactShape(result, matchResultDataShape);
      expect(result.viewerRole).toBe("participant");
      expect(result.submissions).toHaveLength(1);
      expect(result.reportGroups).toHaveLength(1);
      expect(result.submissions[0].submittedByViewer).toBe(submittedByViewer);
      expect(result.reportGroups[0].submittedByViewer).toBe(
        submittedByViewer
      );
      expect(result.reportGroups[0].replayProofs.map((proof) => proof.id))
        .toEqual([PROOF_ONE_ID, PROOF_TWO_ID]);
      expectNoSensitiveBrowserData(result, [
        SECRET_REPLAY_PATH,
        SECRET_SCREENSHOT_PATH,
        SECRET_SUBMITTER_ID,
        SECRET_REVIEWER_ID,
        SECRET_RESOLVER_ID,
      ]);
    }
  );

  it("rejects unexpected database fields and preserves a safe load-failure signal", async () => {
    const supabase = participantClient(SUBMITTER_REGISTRATION_ID);
    const submissionQueue = [
      {
        data: [
          {
            ...submissionRow,
            submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
          },
        ],
        error: null,
      },
    ];
    const failingSupabase = createQueuedClient({
      registrations: [
        {
          data: [{ id: SUBMITTER_REGISTRATION_ID }],
          error: null,
        },
      ],
      tournament_matches: [
        { data: [{ id: MATCH_ID }], error: null },
        { data: [], error: null },
      ],
      match_result_report_groups: [
        { data: [reportGroupRow], error: null },
        { data: [], error: null },
      ],
      match_result_submissions: submissionQueue,
    });
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(failingSupabase.client);

    const result = await loadMatchResultData();

    expect(result).toEqual({
      submissions: [],
      reportGroups: [],
      viewerRole: "participant",
      error: "load-failed",
    });
    expectNoSensitiveBrowserData(result, [
      SECRET_REPLAY_PATH,
      SECRET_SUBMITTER_ID,
    ]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("scopes Admin archive result reads to the selected Tournament match IDs", async () => {
    const supabase = createQueuedClient({
      match_result_report_groups: [
        { data: [reportGroupRow], error: null },
        {
          data: [
            {
              id: REPORT_GROUP_ID,
              submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
              reviewed_by: SECRET_REVIEWER_ID,
              no_show_resolved_by: SECRET_RESOLVER_ID,
            },
          ],
          error: null,
        },
      ],
      match_result_submissions: [
        { data: [submissionRow], error: null },
        { data: replayProofRows, error: null },
        {
          data: [
            {
              id: SUBMISSION_ID,
              submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
              reviewed_by: SECRET_REVIEWER_ID,
            },
          ],
          error: null,
        },
      ],
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const result = await loadMatchResultData({
      adminMatchIds: [MATCH_ID, MATCH_ID, ""],
    });

    expect(result.viewerRole).toBe("admin");
    expect(result.error).toBeNull();
    expect(result.submissions).toHaveLength(1);
    expect(result.reportGroups).toHaveLength(1);
    expect(supabase.calls.filter((call) => call.method === "in")).toEqual(
      expect.arrayContaining([
        {
          table: "match_result_report_groups",
          method: "in",
          args: ["match_id", [MATCH_ID]],
        },
        {
          table: "match_result_submissions",
          method: "in",
          args: ["match_id", [MATCH_ID]],
        },
      ])
    );
  });
});

describe("administrator match-result audit boundary", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    ["anonymous", anonymousIdentity],
    ["ordinary player", playerIdentity],
  ])(
    "rejects the %s before creating a service-role client",
    async (_name, identity) => {
      authMock.mockResolvedValue(identity);

      await expect(
        loadAdminMatchResultAudit({
          submissionIds: [SUBMISSION_ID],
          reportGroupIds: [REPORT_GROUP_ID],
        })
      ).rejects.toThrow("Unauthorized");
      expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it("returns an empty audit for an admin with no scoped result IDs", async () => {
    authMock.mockResolvedValue(adminIdentity);

    const result = await loadAdminMatchResultAudit({
      submissionIds: [],
      reportGroupIds: [],
    });

    expect(result.submissions.size).toBe(0);
    expect(result.reportGroups.size).toBe(0);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("deduplicates and scopes the two server-only audit queries", async () => {
    const supabase = createQueuedClient({
      match_result_submissions: [
        {
          data: [
            {
              id: SUBMISSION_ID,
              submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
              reviewed_by: SECRET_REVIEWER_ID,
            },
          ],
          error: null,
        },
      ],
      match_result_report_groups: [
        {
          data: [
            {
              id: REPORT_GROUP_ID,
              submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
              reviewed_by: SECRET_REVIEWER_ID,
              no_show_resolved_by: SECRET_RESOLVER_ID,
            },
          ],
          error: null,
        },
      ],
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const result = await loadAdminMatchResultAudit({
      submissionIds: [SUBMISSION_ID, SUBMISSION_ID, ""],
      reportGroupIds: [REPORT_GROUP_ID, REPORT_GROUP_ID, ""],
    });

    expect(supabase.calls).toContainEqual({
      table: "match_result_submissions",
      method: "in",
      args: ["id", [SUBMISSION_ID]],
    });
    expect(supabase.calls).toContainEqual({
      table: "match_result_report_groups",
      method: "in",
      args: ["id", [REPORT_GROUP_ID]],
    });
    expect(result.submissions.get(SUBMISSION_ID)).toEqual({
      submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
      reviewed_by: SECRET_REVIEWER_ID,
    });
    expect(result.reportGroups.get(REPORT_GROUP_ID)).toEqual({
      submitted_by_clerk_user_id: SECRET_SUBMITTER_ID,
      reviewed_by: SECRET_REVIEWER_ID,
      no_show_resolved_by: SECRET_RESOLVER_ID,
    });
  });

  it("fails closed when either scoped audit query fails", async () => {
    const supabase = createQueuedClient({
      match_result_submissions: [
        { data: null, error: { message: SECRET_REPLAY_PATH } },
      ],
      match_result_report_groups: [
        { data: [], error: null },
      ],
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      loadAdminMatchResultAudit({
        submissionIds: [SUBMISSION_ID],
        reportGroupIds: [REPORT_GROUP_ID],
      })
    ).rejects.toThrow("Match result audit unavailable.");
  });
});
