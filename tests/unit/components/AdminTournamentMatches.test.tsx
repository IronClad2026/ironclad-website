// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminTournamentMatches from "@/components/admin/tournaments/AdminTournamentMatches";
import type {
  GeneratedTournamentMatch,
  MatchResultSubmission,
  TournamentCard,
} from "@/lib/tournaments";
import { createDisabledTournamentDivisionStates } from "@/tests/fixtures/tournament-division-states";

vi.mock("@/components/TournamentsExperience", () => ({
  AdminMatchManagementModal: ({
    match,
    readOnly,
    submissions,
    onClose,
  }: {
    match: { id: string };
    readOnly?: boolean;
    submissions: unknown[];
    onClose: () => void;
  }) => (
    <div
      role="dialog"
      data-match-id={match.id}
      data-read-only={String(Boolean(readOnly))}
      data-submission-count={String(submissions.length)}
    >
      Match management
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

const viewer = {
  isAdmin: true,
  relicVerifiedDivision: null,
  registrationIds: [],
  registrations: [],
};

describe("AdminTournamentMatches", () => {
  afterEach(cleanup);

  it("renders every generated bracket match and opens the existing management modal with match-scoped results", () => {
    render(
      <AdminTournamentMatches
        tournament={makeTournament()}
        viewer={viewer}
        submissions={[
          makeSubmission("submission-1", "match-1"),
          makeSubmission("submission-2", "match-2"),
        ]}
      />
    );

    expect(screen.getByText("Academy Bracket")).toBeInTheDocument();
    expect(screen.getByText("Main / Pro Bracket")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Manage Semi Final, match 1: Alpha versus Bravo/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Manage Final, match 2: Slot 1 versus Slot 2/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Manage Round 1, match 1: Alpha versus Bravo/,
      })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Manage Semi Final, match 1: Alpha versus Bravo/,
      })
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-match-id", "match-1");
    expect(dialog).toHaveAttribute("data-read-only", "false");
    expect(dialog).toHaveAttribute("data-submission-count", "1");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps cancelled and voided Tournament match history reachable but read-only", () => {
    const tournament = makeTournament();
    tournament.statusValue = "voided";
    tournament.status = "Voided";

    render(
      <AdminTournamentMatches tournament={tournament} viewer={viewer} />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /View Semi Final, match 1: Alpha versus Bravo/,
      })
    );

    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-read-only",
      "true"
    );
  });

  it("distinguishes load failures from a generated-bracket empty state", () => {
    const tournament = makeTournament();
    tournament.generatedBrackets = [];
    const { rerender } = render(
      <AdminTournamentMatches tournament={tournament} viewer={viewer} />
    );

    expect(screen.getByText("No generated brackets yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(
      <AdminTournamentMatches
        tournament={tournament}
        viewer={viewer}
        loadError
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Matches / Results unavailable"
    );
    expect(
      screen.queryByText("No generated brackets yet")
    ).not.toBeInTheDocument();
  });
});

function makeTournament(): TournamentCard {
  const academyMatches = [
    makeMatch({
      id: "match-1",
      roundName: "Semi Final",
      roundNumber: 1,
      matchNumber: 1,
      playerOneRegistrationId: "registration-alpha",
      playerTwoRegistrationId: "registration-bravo",
      playerOneSlot: 1,
      playerTwoSlot: 2,
    }),
    makeMatch({
      id: "match-2",
      roundName: "Final",
      roundNumber: 2,
      matchNumber: 2,
      playerOneSlot: 1,
      playerTwoSlot: 2,
    }),
  ];

  return {
    id: "tournament-1",
    slug: "owner-ux-tournament",
    title: "Owner UX Tournament",
    format: "1v1",
    ruleFormat: "format_a",
    ruleFormatLabel: "Format A",
    status: "In Progress",
    statusValue: "in_progress",
    image: "/images/tournaments/example.jpg",
    description: "Tournament workspace fixture.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    prizePool: "",
    players: 2,
    maxPlayers: 16,
    brackets: [
      makeBracket("bracket-academy", "Academy Bracket"),
      makeBracket("bracket-main", "Main / Pro Bracket"),
    ],
    divisionStates: createDisabledTournamentDivisionStates(
      "tournament-1",
      "in_progress"
    ),
    details: "Tournament workspace fixture.",
    rules: "Managed rules.",
    schedule: [],
    contact: "IronClad",
    registrationEnabled: false,
    registrationOpenAt: "",
    registrationCloseAt: "",
    createdAt: "2026-08-27T00:00:00.000Z",
    resultConfirmationWindowMinutes: 30,
    rulesUrl: null,
    battlefyUrl: null,
    participants: [
      makeParticipant("registration-alpha", "Alpha", "bracket-academy"),
      makeParticipant("registration-bravo", "Bravo", "bracket-academy"),
    ],
    bracketParticipants: [
      makeParticipant("registration-alpha", "Alpha", "bracket-academy"),
      makeParticipant("registration-bravo", "Bravo", "bracket-academy"),
    ],
    generatedBrackets: [
      {
        id: "generated-academy",
        tournamentBracketId: "bracket-academy",
        format: "single_elimination",
        slotCount: 8,
        generatedAt: "2026-08-27T00:00:00.000Z",
        matches: academyMatches,
        standings: [],
      },
      {
        id: "generated-main",
        tournamentBracketId: "bracket-main",
        format: "round_robin",
        slotCount: 8,
        generatedAt: "2026-08-27T00:01:00.000Z",
        matches: [
          makeMatch({
            id: "match-main-1",
            roundName: "Round 1",
            roundNumber: 1,
            matchNumber: 1,
            playerOneRegistrationId: "registration-alpha",
            playerTwoRegistrationId: "registration-bravo",
          }),
        ],
        standings: [],
      },
    ],
    mapPools: [],
  };
}

function makeBracket(id: string, name: string) {
  return {
    id,
    name,
    requirement: "Eligible Division",
    maxPlayers: "Max 8 players",
    registeredPlayers: 2,
    activeCohortPlayers: 2,
    activeCohortSize: 8,
    waitlistedPlayers: 0,
    isFull: false,
    isWaitlistOnly: false,
    launchedAt: "2026-08-27T00:00:00.000Z",
    prize: "No prize is published for this Event",
  };
}

function makeParticipant(
  registrationId: string,
  name: string,
  bracketId: string
) {
  return {
    registrationId,
    name,
    country: null,
    elo: null,
    status: "approved" as const,
    bracketId,
    bracketName: "Academy Bracket",
  };
}

function makeMatch(
  overrides: Partial<GeneratedTournamentMatch> &
    Pick<
      GeneratedTournamentMatch,
      "id" | "roundName" | "roundNumber" | "matchNumber"
    >
): GeneratedTournamentMatch {
  return {
    seriesBestOf: 3,
    status: "scheduled",
    activationVersion: 0,
    activatedAt: null,
    deadlineAt: null,
    outcomeType: null,
    deadlineRuledAt: null,
    extensionMinutes: null,
    extendedAt: null,
    holdStartedAt: null,
    holdReleasedAt: null,
    playerOneRegistrationId: null,
    playerTwoRegistrationId: null,
    playerOneSlot: null,
    playerTwoSlot: null,
    playerOneScore: null,
    playerTwoScore: null,
    winnerRegistrationId: null,
    ...overrides,
  };
}

function makeSubmission(
  id: string,
  matchId: string
): MatchResultSubmission {
  return {
    id,
    submissionNumber: 1,
    gameNumber: 1,
    matchId,
    submittedByRegistrationId: "registration-alpha",
    submittedByViewer: false,
    claimedWinnerRegistrationId: "registration-alpha",
    playerOneScore: 2,
    playerTwoScore: 0,
    hasReplay: true,
    hasScreenshot: false,
    replayAccessHref: `/api/match-proofs/${matchId}/submission/${id}/replay`,
    screenshotAccessHref: null,
    notes: null,
    status: "pending",
    reviewNotes: null,
    reviewerLabel: null,
    reviewedAt: null,
    createdAt: "2026-08-27T00:00:00.000Z",
  };
}
