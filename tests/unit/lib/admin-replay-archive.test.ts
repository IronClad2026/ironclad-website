import { describe, expect, it } from "vitest";
import {
  buildAdminTournamentReplayArchive,
  classifyLegacySubmissionReplay,
  classifyReportGroupReplay,
} from "@/lib/admin-replay-archive";
import type {
  GeneratedTournamentMatch,
  MatchResultReportGroup,
  MatchResultSubmission,
  TournamentCard,
} from "@/lib/tournaments";

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const BRACKET_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const PLAYER_ONE_ID = "44444444-4444-4444-8444-444444444444";
const PLAYER_TWO_ID = "55555555-5555-4555-8555-555555555555";

const match: GeneratedTournamentMatch = {
  id: MATCH_ID,
  seriesBestOf: 3,
  roundName: "Semifinal",
  roundNumber: 2,
  matchNumber: 3,
  status: "completed",
  activationVersion: 1,
  activatedAt: "2026-08-01T00:00:00.000Z",
  deadlineAt: null,
  outcomeType: null,
  deadlineRuledAt: null,
  extensionMinutes: null,
  extendedAt: null,
  holdStartedAt: null,
  holdReleasedAt: null,
  playerOneRegistrationId: PLAYER_ONE_ID,
  playerTwoRegistrationId: PLAYER_TWO_ID,
  playerOneSlot: 1,
  playerTwoSlot: 2,
  playerOneScore: 2,
  playerTwoScore: 1,
  winnerRegistrationId: PLAYER_ONE_ID,
  officialResultReference: "77777777-7777-4777-8777-777777777777",
  officialResultDecidedAt: "2026-08-02T00:00:00.000Z",
};

const tournament = {
  id: TOURNAMENT_ID,
  title: "Summer Open",
  brackets: [{ id: BRACKET_ID, name: "Academy" }],
  participants: [
    { registrationId: PLAYER_ONE_ID, name: "Alpha" },
    { registrationId: PLAYER_TWO_ID, name: "Bravo" },
  ],
  bracketParticipants: [],
  generatedBrackets: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      tournamentBracketId: BRACKET_ID,
      format: "single_elimination",
      slotCount: 8,
      generatedAt: "2026-08-01T00:00:00.000Z",
      matches: [match],
      standings: [],
    },
  ],
} as unknown as TournamentCard;

function reportGroup(
  overrides: Partial<MatchResultReportGroup> = {}
): MatchResultReportGroup {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    matchId: MATCH_ID,
    tournamentId: TOURNAMENT_ID,
    resultType: "normal",
    submittedByRegistrationId: PLAYER_ONE_ID,
    submittedByViewer: false,
    opponentRegistrationId: PLAYER_TWO_ID,
    winnerRegistrationId: PLAYER_ONE_ID,
    playerOneScore: 2,
    playerTwoScore: 1,
    hasReplay: true,
    replayAccessHref: `/api/match-proofs/${MATCH_ID}/report-group/77777777-7777-4777-8777-777777777777/replay`,
    replayProofs: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        gameNumber: 1,
        proofAvailable: true,
        replayAccessHref: `/api/match-proofs/${MATCH_ID}/submission/88888888-8888-4888-8888-888888888888/replay`,
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        gameNumber: 2,
        proofAvailable: true,
        replayAccessHref: `/api/match-proofs/${MATCH_ID}/submission/99999999-9999-4999-8999-999999999999/replay`,
      },
    ],
    status: "confirmed",
    confirmationDeadlineAt: "2026-08-01T01:00:00.000Z",
    confirmedAt: "2026-08-01T00:30:00.000Z",
    disputedAt: null,
    disputeNotes: null,
    reviewerLabel: null,
    reviewedAt: null,
    reviewNotes: null,
    noShowReportedByRegistrationId: null,
    noShowRegistrationId: null,
    noShowStatus: null,
    noShowNote: null,
    noShowResolvedAt: null,
    noShowResolverLabel: null,
    finalizedAt: "2026-08-01T00:30:00.000Z",
    finalizedSource: "opponent_confirmation",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function submission(
  overrides: Partial<MatchResultSubmission> = {}
): MatchResultSubmission {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    submissionNumber: 1,
    gameNumber: 1,
    matchId: MATCH_ID,
    submittedByRegistrationId: PLAYER_ONE_ID,
    submittedByViewer: false,
    claimedWinnerRegistrationId: PLAYER_ONE_ID,
    playerOneScore: 2,
    playerTwoScore: 1,
    hasReplay: true,
    hasScreenshot: false,
    replayAccessHref: `/api/match-proofs/${MATCH_ID}/submission/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/replay`,
    screenshotAccessHref: null,
    notes: null,
    status: "approved",
    reviewNotes: null,
    reviewerLabel: "Administrator",
    reviewedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Admin Tournament Replay Archive projection", () => {
  it("uses finalized per-game evidence as official without duplicating its compatibility path", () => {
    const archive = buildAdminTournamentReplayArchive({
      tournament,
      submissions: [],
      reportGroups: [reportGroup()],
    });

    expect(archive.officialCount).toBe(2);
    expect(archive.auditCount).toBe(0);
    expect(archive.items.map((item) => item.replayLabel)).toEqual([
      "Game 1",
      "Game 2",
    ]);
    expect(archive.items.every((item) => item.category === "official")).toBe(
      true
    );
    expect(archive.items[0]).toMatchObject({
      divisionName: "Academy",
      roundName: "Semifinal",
      matchNumber: 3,
      playerOneName: "Alpha",
      playerTwoName: "Bravo",
      scoreLabel: "2–1",
      evidenceSource: "Modern per-game",
    });
  });

  it("retains a legacy group replay as one Series Replay", () => {
    const archive = buildAdminTournamentReplayArchive({
      tournament,
      submissions: [],
      reportGroups: [reportGroup({ replayProofs: [] })],
    });

    expect(archive.items).toHaveLength(1);
    expect(archive.items[0]).toMatchObject({
      category: "official",
      replayLabel: "Series Replay",
      evidenceSource: "Legacy Series Replay",
    });
  });

  it("keeps unresolved and rejected evidence in explicit audit categories", () => {
    expect(
      classifyReportGroupReplay(
        reportGroup({ status: "disputed", finalizedAt: null })
      )
    ).toEqual({ category: "disputed", label: "Disputed evidence" });
    expect(
      classifyReportGroupReplay(
        reportGroup({ status: "reset", finalizedAt: null })
      )
    ).toEqual({ category: "superseded", label: "Superseded / reset" });
    expect(
      classifyLegacySubmissionReplay(
        submission({ status: "resubmission_requested" }),
        match
      )
    ).toEqual({
      category: "resubmission_requested",
      label: "Resubmission requested",
    });
  });

  it("recognizes only the match-authoritative legacy approval as official", () => {
    const official = submission({ id: match.officialResultReference ?? "" });
    const superseded = submission({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(classifyLegacySubmissionReplay(official, match).category).toBe(
      "official"
    );
    expect(classifyLegacySubmissionReplay(superseded, match).category).toBe(
      "superseded"
    );
  });

  it("fails closed when report evidence escapes the selected Tournament", () => {
    expect(() =>
      buildAdminTournamentReplayArchive({
        tournament,
        submissions: [],
        reportGroups: [
          reportGroup({
            tournamentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          }),
        ],
      })
    ).toThrow("Replay report group escaped its Tournament scope.");
  });
});
