// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GeneratedTournamentMatch,
  TournamentParticipant,
} from "@/lib/tournaments";

vi.mock("@/app/admin/tournaments/deadline-actions", () => ({
  extendTournamentMatchDeadline: vi.fn(),
  holdTournamentMatchDeadline: vi.fn(),
  releaseTournamentMatchDeadline: vi.fn(),
}));

vi.mock("@/app/tournaments/match-actions", () => ({
  resetAdminMatch: vi.fn(),
  saveAdminMatchResult: vi.fn(),
  reviewMatchResult: vi.fn(),
  reviewMatchResultReportGroup: vi.fn(),
}));

vi.mock("@/components/AdminMatchResultSummaries", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/PlayerMatchResultForm", () => ({
  default: vi.fn(() => <div>Player result form marker</div>),
}));

import AdminMatchDeadlineControls from "@/components/AdminMatchDeadlineControls";
import MatchResultControls from "@/components/MatchResultControls";

afterEach(() => cleanup());

const participantOne: TournamentParticipant = {
  registrationId: "11111111-1111-4111-8111-111111111111",
  name: "Player One",
  country: "Australia",
  elo: 1080,
  status: "approved",
  bracketId: "bracket-1",
  bracketName: "Academy",
};
const participantTwo: TournamentParticipant = {
  registrationId: "22222222-2222-4222-8222-222222222222",
  name: "Player Two",
  country: "New Zealand",
  elo: 1090,
  status: "approved",
  bracketId: "bracket-1",
  bracketName: "Academy",
};

function matchFixture(
  overrides: Partial<GeneratedTournamentMatch> = {}
): GeneratedTournamentMatch {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    seriesBestOf: 3,
    roundName: "Quarterfinals",
    roundNumber: 1,
    matchNumber: 1,
    status: "in_progress",
    activationVersion: 1,
    activatedAt: "2099-08-01T00:00:00.000Z",
    deadlineAt: "2099-08-08T00:00:00.000Z",
    outcomeType: null,
    deadlineRuledAt: null,
    extensionMinutes: null,
    extendedAt: null,
    holdStartedAt: null,
    holdReleasedAt: null,
    playerOneRegistrationId: participantOne.registrationId,
    playerTwoRegistrationId: participantTwo.registrationId,
    playerOneSlot: 1,
    playerTwoSlot: 2,
    playerOneScore: null,
    playerTwoScore: null,
    winnerRegistrationId: null,
    ...overrides,
  };
}

function participants(...values: TournamentParticipant[]) {
  return new Map(values.map((participant) => [participant.registrationId, participant]));
}

describe("matchup deadline player and administrator presentation", () => {
  it("shows one-time responsive extension and hold controls only for an active match", () => {
    render(<AdminMatchDeadlineControls match={matchFixture()} />);

    expect(screen.getByText("Active matchup")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply One-Time Extension" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Place Match On Hold" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Extension minutes")).toHaveAttribute(
      "max",
      "2880"
    );
    expect(screen.getAllByText("Unused")).toHaveLength(2);
  });

  it("shows a held match and only the release transition", () => {
    render(
      <AdminMatchDeadlineControls
        match={matchFixture({
          holdStartedAt: "2099-08-03T00:00:00.000Z",
          holdReason: "Exceptional platform incident",
        })}
      />
    );

    expect(screen.getByText("Paused by administrator")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Release Hold & Resume Deadline" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply One-Time Extension" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Place Match On Hold" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Exceptional platform incident")).toBeInTheDocument();
  });

  it.each([
    [
      "deadline_double_forfeit",
      "Final double forfeit — completed without a champion",
    ],
    [
      "automatic_bye",
      "Final walkover — champion advanced without a played match",
    ],
    ["empty_feeder", "Final closed — completed without a champion"],
  ] as const)("presents the %s terminal outcome", (outcomeType, label) => {
    render(
      <AdminMatchDeadlineControls
        match={matchFixture({
          status: "completed",
          outcomeType,
          roundName: "Final",
          roundNumber: 3,
        })}
      />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply One-Time Extension" })
    ).not.toBeInTheDocument();
  });

  it("tells an early downstream player that no deadline has started", () => {
    render(
      <MatchResultControls
        match={matchFixture({
          status: "scheduled",
          activationVersion: 0,
          activatedAt: null,
          deadlineAt: null,
          playerTwoRegistrationId: null,
          playerTwoSlot: null,
        })}
        deadlineManaged
        participantsById={participants(participantOne)}
        isAdmin
        canSubmit={false}
        submissions={[]}
        reportGroups={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Waiting for Participants/ })
    );
    expect(
      screen.getByText("Waiting for opponent — your deadline has not started.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Player result form marker")).not.toBeInTheDocument();
  });

  it("blocks player result controls while an administrative hold is active", () => {
    render(
      <MatchResultControls
        match={matchFixture({
          holdStartedAt: "2099-08-03T00:00:00.000Z",
        })}
        deadlineManaged
        participantsById={participants(participantOne, participantTwo)}
        isAdmin={false}
        canSubmit
        submissions={[]}
        reportGroups={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Match Deadline Paused/ })
    );
    expect(
      screen.getByText(/This match is on an administrative hold/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Player result form marker")).not.toBeInTheDocument();
  });

  it("preserves scheduled round-robin player result entry without a matchup deadline", () => {
    render(
      <MatchResultControls
        match={matchFixture({
          status: "scheduled",
          activationVersion: 0,
          activatedAt: null,
          deadlineAt: null,
        })}
        deadlineManaged={false}
        participantsById={participants(participantOne, participantTwo)}
        isAdmin={false}
        canSubmit
        submissions={[]}
        reportGroups={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Submit Match Result/ })
    );
    expect(screen.getByText("Player result form marker")).toBeInTheDocument();
    expect(
      screen.queryByText(/This matchup has not activated/)
    ).not.toBeInTheDocument();
  });

  it("keeps scheduled deadline-managed matches blocked until activation", () => {
    render(
      <MatchResultControls
        match={matchFixture({
          status: "scheduled",
          activationVersion: 0,
          activatedAt: null,
          deadlineAt: null,
        })}
        deadlineManaged
        participantsById={participants(participantOne, participantTwo)}
        isAdmin={false}
        canSubmit
        submissions={[]}
        reportGroups={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Match Not Active/ })
    );
    expect(screen.queryByText("Player result form marker")).not.toBeInTheDocument();
    expect(screen.getByText(/This matchup has not activated/)).toBeInTheDocument();
  });

  it("keeps direct match focus and all deadline outcome labels in the existing bracket surface", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/TournamentsExperience.tsx"),
      "utf8"
    );

    expect(source).toContain('searchParams.get("match")');
    expect(source).toContain("match-desktop-${focusedMatchId}");
    expect(source).toContain("match-mobile-${focusedMatchId}");
    expect(source).toContain(
      "Waiting for opponent — your deadline has not started"
    );
    expect(source).toContain("Deadline passed — awaiting authoritative ruling");
    expect(source).toContain(
      "Quarterfinal double forfeit — no player advances from this feeder"
    );
    expect(source).toContain(
      "Semifinal automatic bye — sole eligible player advances to the Final"
    );
    expect(source).toContain(
      "Final walkover — champion advanced without a played match"
    );
    expect(source).toContain(
      "Final closed — division completed without a champion"
    );
    expect(source).toContain("No champion was awarded");
    expect(source).toContain(
      '["deadline_double_forfeit", "empty_feeder"].includes'
    );
  });
});
