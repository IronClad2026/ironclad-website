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
import {
  AdminMatchManagementModal,
  MatchDeadlinePresentation,
} from "@/components/TournamentsExperience";

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
  it("contains the administrator match dialog and wraps long identities on narrow layouts", () => {
    const longPlayerOne = {
      ...participantOne,
      name: "PHASE4_TEST_PLAYER_WITH_A_DELIBERATELY_LONG_UNBROKEN_IDENTITY_0001",
    };
    const longPlayerTwo = {
      ...participantTwo,
      name: "Another deliberately long administrator-visible player identity",
    };
    type ModalProps = Parameters<typeof AdminMatchManagementModal>[0];

    render(
      <AdminMatchManagementModal
        tournament={
          {
            title: "Responsive Match Management Validation",
          } as ModalProps["tournament"]
        }
        match={matchFixture()}
        bracketFormat="single_elimination"
        participantsById={participants(longPlayerOne, longPlayerTwo)}
        viewer={
          {
            isAdmin: true,
            relicVerifiedDivision: null,
            registrationIds: [],
            registrations: [],
          } as ModalProps["viewer"]
        }
        submissions={[]}
        reportGroups={[]}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("w-full", "max-w-5xl", "min-w-0");
    expect(dialog).not.toHaveClass("w-[94vw]");

    const scrollport = dialog.querySelector("[data-admin-match-scrollport]");
    const overviewGrid = dialog.querySelector(
      "[data-admin-match-overview-grid]"
    );
    const actionsGrid = dialog.querySelector("[data-admin-match-actions-grid]");

    expect(scrollport).toHaveClass("w-full", "max-w-full", "min-w-0");
    expect(scrollport).not.toHaveClass("overflow-x-auto", "overflow-x-hidden");
    expect(overviewGrid).toHaveClass(
      "w-full",
      "max-w-full",
      "min-w-0",
      "grid-cols-[minmax(0,1fr)]",
      "lg:grid-cols-[minmax(0,1fr)_320px]"
    );
    expect(actionsGrid).toHaveClass(
      "w-full",
      "max-w-full",
      "min-w-0",
      "grid-cols-[minmax(0,1fr)]",
      "lg:grid-cols-2"
    );

    const playerRows = dialog.querySelectorAll("[data-admin-match-player-row]");
    expect(playerRows).toHaveLength(2);
    [longPlayerOne.name, longPlayerTwo.name].forEach((name, index) => {
      const playerName = playerRows[index].querySelector(
        "[data-admin-match-player-name]"
      );
      expect(playerRows[index]).toHaveClass(
        "w-full",
        "max-w-full",
        "min-w-0"
      );
      expect(playerName).toHaveTextContent(name);
      expect(playerName).toHaveClass(
        "whitespace-normal",
        "[overflow-wrap:anywhere]"
      );
      expect(playerName).not.toHaveClass("truncate", "whitespace-nowrap");
    });

    const deadlineSection = screen.getByText("Match Deadline").closest("section");
    expect(deadlineSection?.parentElement).toHaveClass(
      "w-full",
      "max-w-full",
      "min-w-0"
    );
    expect(screen.getByLabelText("Extension minutes")).toHaveClass(
      "min-h-11",
      "w-full"
    );
    expect(screen.getByLabelText("Administrator reason")).toHaveClass(
      "min-h-11",
      "w-full"
    );
    expect(screen.getByLabelText("Exceptional hold reason")).toHaveClass(
      "min-h-11",
      "w-full"
    );
    expect(
      screen.getByRole("button", { name: "Apply One-Time Extension" })
    ).toHaveClass("min-h-11", "w-full", "sm:w-auto");
    expect(
      screen.getByRole("button", { name: "Place Match On Hold" })
    ).toHaveClass("min-h-11", "w-full", "sm:w-auto");

    expect(dialog.querySelector('input[name="playerOneScore"]')).toHaveClass(
      "w-full"
    );
    expect(dialog.querySelector('input[name="playerTwoScore"]')).toHaveClass(
      "w-full"
    );
    expect(
      dialog.querySelector('select[name="winnerRegistrationId"]')
    ).toHaveClass("w-full");
    expect(
      screen.getByRole("button", { name: "Complete Match & Advance Winner" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Match" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Close match management" })
    ).toHaveLength(2);
  });

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
      "Quarter Finals",
      "deadline_double_forfeit",
      "Quarter Finals double forfeit — no player advanced",
      "Quarterfinal double forfeit — no player advances from this feeder",
      /^Final double forfeit/,
    ],
    [
      "Semi Finals",
      "deadline_double_forfeit",
      "Semi Finals double forfeit — no player advanced",
      "Semifinal double forfeit — no player advances from this matchup",
      /^Final double forfeit/,
    ],
    [
      "Final",
      "deadline_double_forfeit",
      "Final double forfeit — completed without a champion",
      "Final double forfeit — division completed without a champion",
      null,
    ],
    [
      "Grand Final",
      "deadline_double_forfeit",
      "Final double forfeit — completed without a champion",
      "Final double forfeit — division completed without a champion",
      null,
    ],
    [
      "Quarter Finals",
      "automatic_bye",
      "Quarter Finals automatic bye — no match was played",
      "Automatic bye — sole eligible player advances without a played match",
      /^Final walkover/,
    ],
    [
      "Semi Finals",
      "automatic_bye",
      "Semi Finals automatic bye — no match was played",
      "Semifinal automatic bye — sole eligible player advances to the Final",
      /^Final walkover/,
    ],
    [
      "Final",
      "automatic_bye",
      "Final walkover — champion advanced without a played match",
      "Final walkover — champion advanced without a played match",
      null,
    ],
    [
      "Grand Final",
      "automatic_bye",
      "Final walkover — champion advanced without a played match",
      "Final walkover — champion advanced without a played match",
      null,
    ],
    [
      "Quarter Finals",
      "empty_feeder",
      "Quarter Finals closed — no eligible player advanced",
      "Match closed — no eligible player advances",
      /^Final closed/,
    ],
    [
      "Semi Finals",
      "empty_feeder",
      "Semi Finals closed — no eligible player advanced",
      "Semifinal closed — no eligible player advances",
      /^Final closed/,
    ],
    [
      "Final",
      "empty_feeder",
      "Final closed — completed without a champion",
      "Final closed — division completed without a champion",
      null,
    ],
    [
      "Grand Final",
      "empty_feeder",
      "Final closed — completed without a champion",
      "Final closed — division completed without a champion",
      null,
    ],
  ] as const)(
    "classifies the %s %s outcome on both presentation surfaces",
    (
      roundName,
      outcomeType,
      adminLabel,
      publicLabel,
      forbiddenFinalLabel
    ) => {
      const adminView = render(
        <AdminMatchDeadlineControls
          match={matchFixture({ status: "completed", outcomeType, roundName })}
        />
      );

      expect(screen.getByText(adminLabel)).toBeInTheDocument();
      if (forbiddenFinalLabel) {
        expect(screen.queryByText(forbiddenFinalLabel)).not.toBeInTheDocument();
      }
      adminView.unmount();

      render(
        <MatchDeadlinePresentation
          match={matchFixture({ status: "completed", outcomeType, roundName })}
        />
      );

      expect(screen.getByText(publicLabel)).toBeInTheDocument();
      if (forbiddenFinalLabel) {
        expect(screen.queryByText(forbiddenFinalLabel)).not.toBeInTheDocument();
      }
      if (
        outcomeType === "deadline_double_forfeit" &&
        forbiddenFinalLabel
      ) {
        expect(
          screen.queryByText(/division completed without a champion/)
        ).not.toBeInTheDocument();
      }
    }
  );

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

  it("keeps direct match focus and aggregate outcome handling in the existing bracket surface", () => {
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
    expect(source).toContain("No champion was awarded");
    expect(source).toContain(
      '["deadline_double_forfeit", "empty_feeder"].includes'
    );
  });
});
