// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/tournaments/match-actions", () => ({
  reviewMatchResult: vi.fn(),
}));

import AdminMatchResultSummaries from "@/components/AdminMatchResultSummaries";
import type {
  GeneratedTournamentMatch,
  MatchResultSubmission,
  TournamentParticipant,
} from "@/lib/tournaments";

describe("match-result presentation privacy", () => {
  it("uses a neutral legacy reporter label and same-origin proof links", () => {
    const syntheticClerkId = "user_secret_legacy_submitter";
    const match: GeneratedTournamentMatch = {
      id: "match-1",
      seriesBestOf: 3,
      roundName: "Final",
      roundNumber: 1,
      matchNumber: 1,
      status: "completed",
      playerOneRegistrationId: "registration-1",
      playerTwoRegistrationId: "registration-2",
      playerOneSlot: 1,
      playerTwoSlot: 2,
      playerOneScore: 2,
      playerTwoScore: 0,
      winnerRegistrationId: "registration-1",
    };
    const participantsById = new Map<string, TournamentParticipant>([
      [
        "registration-1",
        {
          registrationId: "registration-1",
          name: "Player One",
          country: "Australia",
          elo: 1500,
          status: "approved",
          bracketId: "bracket-1",
          bracketName: "Open",
        },
      ],
      [
        "registration-2",
        {
          registrationId: "registration-2",
          name: "Player Two",
          country: "New Zealand",
          elo: 1450,
          status: "approved",
          bracketId: "bracket-1",
          bracketName: "Open",
        },
      ],
    ]);
    const submission = {
      id: "submission-1",
      submissionNumber: 1,
      gameNumber: 1,
      matchId: "match-1",
      submittedByRegistrationId: null,
      submittedByViewer: false,
      claimedWinnerRegistrationId: "registration-1",
      playerOneScore: 1,
      playerTwoScore: 0,
      hasReplay: true,
      hasScreenshot: false,
      replayAccessHref:
        "/api/match-proofs/22222222-2222-4222-8222-222222222222/submission/11111111-1111-4111-8111-111111111111/replay",
      screenshotAccessHref: null,
      notes: null,
      status: "approved",
      reviewNotes: null,
      reviewerLabel: "Administrator",
      reviewedAt: "2026-07-01T01:00:00.000Z",
      createdAt: "2026-07-01T00:00:00.000Z",
      submittedByClerkUserId: syntheticClerkId,
    } as MatchResultSubmission & {
      submittedByClerkUserId: string;
    };

    const { container } = render(
      <AdminMatchResultSummaries
        match={match}
        submissions={[submission]}
        participantsById={participantsById}
      />
    );

    expect(screen.getAllByText(/Participant/).length).toBeGreaterThan(0);
    expect(screen.queryByText(syntheticClerkId)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain(syntheticClerkId);
    expect(
      screen.getByRole("link", { name: "Replay Proof" })
    ).toHaveAttribute("href", submission.replayAccessHref);
  });
});
