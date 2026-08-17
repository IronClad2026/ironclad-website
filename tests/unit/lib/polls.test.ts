import { describe, expect, it } from "vitest";
import {
  derivePollStatus,
  isSubmitPollVoteInput,
  parsePollDraftInput,
  parsePollListProjection,
  parsePollVoteResult,
  type PollDraftInput,
} from "@/lib/polls";

const POLL_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";
const PLAYER_ONE = "33333333-3333-4333-8333-333333333333";
const PLAYER_TWO = "44444444-4444-4444-8444-444444444444";
const OPTION_ONE = "55555555-5555-4555-8555-555555555555";
const OPTION_TWO = "66666666-6666-4666-8666-666666666666";

const hiddenOpenPoll = {
  id: POLL_ID,
  purpose: "tournament_decision",
  audience_kind: "tournament_approved",
  tournament_id: TOURNAMENT_ID,
  tournament_bracket_id: null,
  question: "Which map should be selected?",
  context: null,
  option_source: "text",
  max_selections: 1,
  winner_count: 1,
  authority: "binding",
  result_visibility: "after_close",
  public_final_totals: false,
  opens_at: "2026-08-18T00:00:00.000Z",
  closes_at: "2026-08-25T00:00:00.000Z",
  published_at: "2026-08-17T23:00:00.000Z",
  cancelled_at: null,
  cancellation_reason: null,
  final_decision_published_at: null,
  final_decision_basis: null,
  final_rationale: null,
  binding_tie_rule_used: false,
  status: "open",
  ballot_revision: 0,
  selected_option_ids: [],
  options: [
    {
      id: OPTION_ONE,
      position: 1,
      label: "Map A",
      map: null,
      poll_result_rank: null,
      final_decision_rank: null,
    },
    {
      id: OPTION_TWO,
      position: 2,
      label: "Map B",
      map: null,
      poll_result_rank: null,
      final_decision_rank: null,
    },
  ],
} as const;

const validDraft: PollDraftInput = {
  pollId: null,
  purpose: "tournament_decision",
  audienceKind: "tournament_approved",
  tournamentId: TOURNAMENT_ID,
  tournamentBracketId: null,
  question: "Which maps should form the next pool?",
  context: "Choose up to five maps.",
  optionSource: "text",
  optionLabels: ["Map A", "Map B", "Map C", "Map D", "Map E", "Map F"],
  mapIds: [],
  selectedPlayerIds: [],
  maxSelections: 5,
  winnerCount: 5,
  authority: "binding",
  resultVisibility: "after_close",
  publicFinalTotals: false,
  opensAt: "2026-08-18T00:00:00.000Z",
  closesAt: "2026-08-25T00:00:00.000Z",
};

describe("Feature C poll draft contract", () => {
  it("accepts the locked top-K approval-voting configuration", () => {
    expect(parsePollDraftInput(validDraft)).toEqual({
      ok: true,
      value: validDraft,
    });
  });

  it("enforces the purpose and audience matrix", () => {
    expect(
      parsePollDraftInput({
        ...validDraft,
        purpose: "community_feedback",
        audienceKind: "tournament_approved",
        tournamentId: null,
        authority: "advisory",
      })
    ).toEqual({ ok: false, error: "The poll audience is invalid for its purpose." });

    expect(
      parsePollDraftInput({
        ...validDraft,
        purpose: "community_feedback",
        audienceKind: "active_players",
        tournamentId: null,
        authority: "binding",
      })
    ).toEqual({ ok: false, error: "Community Feedback must be Advisory." });
  });

  it("enforces option, selection, winner, and duration limits", () => {
    expect(
      parsePollDraftInput({ ...validDraft, optionLabels: ["Only one"] })
    ).toEqual({ ok: false, error: "Polls require between 2 and 24 options." });
    expect(
      parsePollDraftInput({ ...validDraft, maxSelections: 6 })
    ).toEqual({ ok: false, error: "Maximum selections must be between 1 and 5." });
    expect(
      parsePollDraftInput({ ...validDraft, winnerCount: 6 })
    ).toEqual({ ok: false, error: "Winner count must be between 1 and 5." });
    expect(
      parsePollDraftInput({ ...validDraft, maxSelections: 2, winnerCount: 3 })
    ).toEqual({
      ok: false,
      error: "Winner count cannot exceed maximum selections.",
    });
    expect(
      parsePollDraftInput({
        ...validDraft,
        closesAt: "2026-08-18T00:14:59.000Z",
      })
    ).toEqual({
      ok: false,
      error: "Poll duration must be between 15 minutes and 30 days.",
    });
  });

  it("rejects duplicate options and selected players", () => {
    expect(
      parsePollDraftInput({
        ...validDraft,
        optionLabels: ["Map A", " map a "],
      })
    ).toEqual({ ok: false, error: "Poll options must be distinct." });
    expect(
      parsePollDraftInput({
        ...validDraft,
        audienceKind: "selected_tournament_players",
        selectedPlayerIds: [PLAYER_ONE, PLAYER_ONE],
      })
    ).toEqual({ ok: false, error: "Selected players must be distinct." });
  });

  it("requires map mode to contain only distinct map identifiers", () => {
    expect(
      parsePollDraftInput({
        ...validDraft,
        optionSource: "coh3_map",
        optionLabels: [],
        mapIds: [OPTION_ONE, OPTION_TWO],
        maxSelections: 2,
        winnerCount: 2,
      })
    ).toEqual({
      ok: true,
      value: {
        ...validDraft,
        optionSource: "coh3_map",
        optionLabels: [],
        mapIds: [OPTION_ONE, OPTION_TWO],
        maxSelections: 2,
        winnerCount: 2,
      },
    });
  });
});

describe("Feature C vote input", () => {
  it("accepts only poll, revision, and a distinct non-empty option set", () => {
    expect(
      isSubmitPollVoteInput({
        pollId: POLL_ID,
        expectedRevision: 0,
        selectedOptionIds: [OPTION_ONE, OPTION_TWO],
      })
    ).toBe(true);

    expect(
      isSubmitPollVoteInput({
        pollId: POLL_ID,
        expectedRevision: 0,
        selectedOptionIds: [OPTION_ONE, OPTION_ONE],
      })
    ).toBe(false);
    expect(
      isSubmitPollVoteInput({
        pollId: POLL_ID,
        playerId: PLAYER_TWO,
        expectedRevision: 0,
        selectedOptionIds: [OPTION_ONE],
      })
    ).toBe(false);
  });
});

describe("Feature C derived lifecycle", () => {
  const milestones = {
    publishedAt: "2026-08-18T00:00:00.000Z",
    opensAt: "2026-08-19T00:00:00.000Z",
    closesAt: "2026-08-20T00:00:00.000Z",
    cancelledAt: null,
    finalDecisionPublishedAt: null,
  } as const;

  it("derives Draft, Scheduled, Open, Closed, Cancelled, and Final", () => {
    expect(
      derivePollStatus({ ...milestones, publishedAt: null }, "2026-08-18T12:00:00.000Z")
    ).toBe("draft");
    expect(derivePollStatus(milestones, "2026-08-18T12:00:00.000Z")).toBe(
      "scheduled"
    );
    expect(derivePollStatus(milestones, "2026-08-19T00:00:00.000Z")).toBe("open");
    expect(derivePollStatus(milestones, "2026-08-20T00:00:00.000Z")).toBe(
      "closed"
    );
    expect(
      derivePollStatus(
        { ...milestones, cancelledAt: "2026-08-19T12:00:00.000Z" },
        "2026-08-21T00:00:00.000Z"
      )
    ).toBe("cancelled");
    expect(
      derivePollStatus(
        {
          ...milestones,
          finalDecisionPublishedAt: "2026-08-20T01:00:00.000Z",
        },
        "2026-08-21T00:00:00.000Z"
      )
    ).toBe("final_decision_published");
  });
});

describe("Feature C safe projections", () => {
  it("accepts a hidden open viewer projection only when totals are absent", () => {
    expect(
      parsePollListProjection({ polls: [hiddenOpenPoll] }, "viewer")
    ).toMatchObject({
      polls: [
        {
          id: POLL_ID,
          ballotRevision: 0,
          selectedOptionIds: [],
          options: [
            { id: OPTION_ONE, pollResultRank: null, finalDecisionRank: null },
            { id: OPTION_TWO, pollResultRank: null, finalDecisionRank: null },
          ],
        },
      ],
    });

    expect(
      parsePollListProjection(
        {
          polls: [
            {
              ...hiddenOpenPoll,
              options: hiddenOpenPoll.options.map((option) => ({
                ...option,
                vote_count: 1,
                selection_share_percent: 50,
              })),
            },
          ],
        },
        "viewer"
      )
    ).toBeNull();

    expect(
      parsePollListProjection(
        {
          polls: [
            {
              ...hiddenOpenPoll,
              eligible_count: 8,
            },
          ],
        },
        "viewer"
      )
    ).toBeNull();

    expect(
      parsePollListProjection(
        {
          polls: [
            {
              ...hiddenOpenPoll,
              options: hiddenOpenPoll.options.map((option, index) => ({
                ...option,
                poll_result_rank: index === 0 ? 1 : null,
              })),
            },
          ],
        },
        "viewer"
      )
    ).toBeNull();
  });

  it("rejects voter and eligibility fields from the public projection", () => {
    const finalPublic = {
      ...hiddenOpenPoll,
      status: "final_decision_published",
      final_decision_published_at: "2026-08-25T01:00:00.000Z",
      final_decision_basis: "binding_computed",
      eligible_count: undefined,
      ballot_revision: undefined,
      selected_option_ids: undefined,
      options: hiddenOpenPoll.options.map((option, index) => ({
        ...option,
        poll_result_rank: index === 0 ? 1 : null,
        final_decision_rank: index === 0 ? 1 : null,
      })),
    };
    const serialized = JSON.parse(JSON.stringify({ polls: [finalPublic] }));
    expect(parsePollListProjection(serialized, "public")).not.toBeNull();
    serialized.polls[0].player_id = PLAYER_ONE;
    expect(parsePollListProjection(serialized, "public")).toBeNull();
  });

  it("rejects frozen voter IDs after publication and partial aggregate payloads", () => {
    const publishedAdmin = {
      ...hiddenOpenPoll,
      result_visibility: "live",
      eligible_count: 8,
      submitted_ballot_count: 1,
      selected_player_ids: [PLAYER_ONE],
      ballot_revision: undefined,
      selected_option_ids: undefined,
      draft_audience_invalidated: false,
      options: hiddenOpenPoll.options.map((option, index) => ({
        ...option,
        vote_count: index === 0 ? 1 : 0,
        selection_share_percent: index === 0 ? 100 : 0,
      })),
    };
    expect(
      parsePollListProjection(
        JSON.parse(JSON.stringify({ polls: [publishedAdmin] })),
        "admin"
      )
    ).toBeNull();

    const partialTotals = {
      ...publishedAdmin,
      selected_player_ids: undefined,
      options: [
        publishedAdmin.options[0],
        {
          ...publishedAdmin.options[1],
          vote_count: undefined,
          selection_share_percent: undefined,
        },
      ],
    };
    expect(
      parsePollListProjection(
        JSON.parse(JSON.stringify({ polls: [partialTotals] })),
        "admin"
      )
    ).toBeNull();
  });

  it("parses exact vote results without accepting identity fields", () => {
    const result = {
      poll_id: POLL_ID,
      ballot_revision: 1,
      selected_option_ids: [OPTION_ONE],
      first_voted_at: "2026-08-18T01:00:00.000Z",
      ballot_updated_at: "2026-08-18T01:00:00.000Z",
      idempotent: false,
    };
    expect(parsePollVoteResult(result, POLL_ID)).toMatchObject({
      pollId: POLL_ID,
      ballotRevision: 1,
      selectedOptionIds: [OPTION_ONE],
    });
    expect(parsePollVoteResult({ ...result, player_id: PLAYER_ONE }, POLL_ID)).toBeNull();
  });
});
