// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import type {
  GeneratedTournamentMatch,
  TournamentParticipant,
} from "@/lib/tournaments";

const extendTournamentMatchDeadlineMock = vi.hoisted(() => vi.fn());
const holdTournamentMatchDeadlineMock = vi.hoisted(() => vi.fn());
const releaseTournamentMatchDeadlineMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/admin/tournaments/deadline-actions", () => ({
  extendTournamentMatchDeadline: extendTournamentMatchDeadlineMock,
  holdTournamentMatchDeadline: holdTournamentMatchDeadlineMock,
  releaseTournamentMatchDeadline: releaseTournamentMatchDeadlineMock,
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

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn(async () => "test-token"),
    isSignedIn: true,
  }),
}));

vi.mock("@/components/MatchDiceRollOff", () => ({
  default: vi.fn(() => <div>Read-only dice history marker</div>),
}));

import AdminMatchDeadlineControls from "@/components/AdminMatchDeadlineControls";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import MatchResultControls from "@/components/MatchResultControls";
import {
  AdminMatchManagementModal,
  BracketMatchResultsWorkspace,
  MatchDeadlinePresentation,
} from "@/components/TournamentsExperience";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
const bracketCopy = competitionEnglish.tournaments.brackets;
const matchControlsCopy = competitionEnglish.matchControls;

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
  it("hydrates deterministic UTC deadline markup into viewer-local time", async () => {
    const value = "2026-08-16T23:24:00.000Z";
    const originalTimeZone = process.env.TZ;
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    let root: ReturnType<typeof hydrateRoot> | null = null;

    document.body.append(container);

    try {
      process.env.TZ = "UTC";
      const utcMarkup = renderToString(
        <HydrationSafeLocalDateTime value={value} fallback="unavailable" />
      );

      process.env.TZ = "Australia/Sydney";
      const sydneyServerMarkup = renderToString(
        <HydrationSafeLocalDateTime value={value} fallback="unavailable" />
      );

      expect(sydneyServerMarkup).toBe(utcMarkup);
      expect(utcMarkup).toContain("16 Aug 2026, 11:24 pm");
      expect(utcMarkup).toContain(`dateTime="${value}"`);

      container.innerHTML = utcMarkup;
      const initialClientSnapshot = container.innerHTML;
      await act(async () => {
        root = hydrateRoot(
          container,
          <HydrationSafeLocalDateTime value={value} fallback="unavailable" />,
          {
            onRecoverableError: (error) => recoverableErrors.push(error),
          }
        );
        expect(container.innerHTML).toBe(initialClientSnapshot);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(recoverableErrors).toEqual([]);
      expect(container.querySelector("time")).toHaveTextContent(
        "17 Aug 2026, 9:24 am"
      );
      expect(container.querySelector("time")).toHaveAttribute(
        "datetime",
        value
      );
    } finally {
      if (root) {
        await act(async () => root?.unmount());
      }
      container.remove();
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });

  it("crosses a deadline after hydration without changing the first client render", async () => {
    const deadlineAt = "2026-08-16T23:24:00.000Z";
    const deadlineTimestamp = new Date(deadlineAt).getTime();
    const originalTimeZone = process.env.TZ;
    const now = vi.spyOn(Date, "now");
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    let root: ReturnType<typeof hydrateRoot> | null = null;
    const match = matchFixture({ deadlineAt });

    document.body.append(container);

    try {
      process.env.TZ = "UTC";
      now.mockReturnValue(deadlineTimestamp - 1_000);
      const serverMarkup = renderToString(
        <MatchDeadlinePresentation match={match} />
      );

      expect(serverMarkup).toContain("Deadline");
      expect(serverMarkup).toContain(`dateTime="${deadlineAt}"`);
      container.innerHTML = serverMarkup;

      process.env.TZ = "Australia/Sydney";
      now.mockReturnValue(deadlineTimestamp + 1_000);
      await act(async () => {
        root = hydrateRoot(
          container,
          <MatchDeadlinePresentation match={match} />,
          {
            onRecoverableError: (error) => recoverableErrors.push(error),
          }
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(recoverableErrors).toEqual([]);
      expect(container).toHaveTextContent(bracketCopy.deadlinePassed);
    } finally {
      if (root) {
        await act(async () => root?.unmount());
      }
      container.remove();
      now.mockRestore();
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    }
  });

  it("preserves deadline presentation states while localizing the active instant", async () => {
    const activeMatch = matchFixture({
      deadlineAt: "2099-08-08T00:00:00.000Z",
      extensionMinutes: 1_440,
      extendedAt: "2099-08-02T00:00:00.000Z",
    });
    const view = render(<MatchDeadlinePresentation match={activeMatch} />);
    const activeDeadlineLabel = view.container.querySelector(
      "[data-match-deadline-state] p"
    );

    expect(activeDeadlineLabel).toHaveTextContent("Deadline");
    expect(activeDeadlineLabel?.querySelector("time")).toHaveAttribute(
      "datetime",
      activeMatch.deadlineAt
    );
    expect(
      screen.getByText("Includes a 24 hours extension.")
    ).toBeInTheDocument();

    view.rerender(
      <MatchDeadlinePresentation
        match={matchFixture({
          holdStartedAt: "2099-08-03T00:00:00.000Z",
        })}
      />
    );
    expect(
      screen.getByText("Deadline paused by an administrator")
    ).toBeInTheDocument();

    view.rerender(
      <MatchDeadlinePresentation
        match={matchFixture({ status: "pending_review" })}
      />
    );
    expect(
      screen.getByText(
        "Result or ruling under review — deadline enforcement is paused"
      )
    ).toBeInTheDocument();

    view.rerender(
      <MatchDeadlinePresentation
        match={matchFixture({ deadlineAt: "2000-01-01T00:00:00.000Z" })}
      />
    );
    expect(
      await screen.findByText("Deadline passed — awaiting authoritative ruling")
    ).toBeInTheDocument();
  });

  it("contains the administrator match dialog and wraps long identities on narrow layouts", async () => {
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
    expect(dialog).toHaveAccessibleName(
      "Manage Match Responsive Match Management Validation"
    );
    expect(dialog).toHaveAccessibleDescription("Quarterfinals - Match 1");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("w-full", "max-w-4xl", "min-w-0");
    expect(dialog).not.toHaveClass("w-[94vw]");

    const closeButton = screen.getByRole("button", {
      name: "Close match management",
    });
    expect(closeButton).toHaveFocus();
    expect(closeButton).toHaveClass("min-h-11", "min-w-11");
    expect(
      dialog.parentElement?.querySelector("[data-admin-match-dialog-backdrop]")
    ).toHaveAttribute("aria-hidden", "true");

    const scrollport = dialog.querySelector("[data-admin-match-scrollport]");
    expect(scrollport).toHaveClass("w-full", "max-w-full", "min-w-0");
    const names = dialog.querySelectorAll("[data-admin-match-player-name]");
    expect(names).toHaveLength(2);
    expect(names[0]).toHaveTextContent(longPlayerOne.name);
    expect(names[1]).toHaveTextContent(longPlayerTwo.name);
    expect(names[0]).not.toHaveClass("truncate", "whitespace-nowrap");
    const schedule = screen.getByText("Deadline & Scheduling").closest("details")!;
    expect(schedule).not.toHaveAttribute("open");
    schedule.open = true;
    expect(await screen.findByLabelText("Extension minutes")).toHaveClass(
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

    const officialResultForm = screen
      .getByText("Official Result Entry")
      .closest("form") as HTMLFormElement;
    expect(officialResultForm).toBeInTheDocument();

    const scoreInputs = [
      officialResultForm.querySelector<HTMLInputElement>(
        'input[name="playerOneScore"]'
      ),
      officialResultForm.querySelector<HTMLInputElement>(
        'input[name="playerTwoScore"]'
      ),
    ];
    [longPlayerOne.name, longPlayerTwo.name].forEach((name, index) => {
      const scoreInput = scoreInputs[index] as HTMLInputElement;
      const playerLabel = scoreInput.closest("label");
      const playerName = playerLabel?.querySelector("span");

      expect(playerLabel?.parentElement).toHaveClass(
        "grid",
        "grid-cols-[1fr_90px]"
      );
      expect(playerLabel).toHaveClass("min-w-0");
      expect(playerName).toHaveTextContent(name);
      expect(playerName).toHaveClass(
        "whitespace-normal",
        "[overflow-wrap:anywhere]"
      );
      expect(playerName).not.toHaveClass("truncate", "whitespace-nowrap");
      expect(scoreInput).toHaveClass("w-full");
      expect(scoreInput).toBeEnabled();

      fireEvent.change(scoreInput, {
        target: { value: index === 0 ? "2" : "1" },
      });
      expect(scoreInput).toHaveValue(index === 0 ? 2 : 1);
    });

    const winnerSelect = officialResultForm.querySelector<HTMLSelectElement>(
      'select[name="winnerRegistrationId"]'
    ) as HTMLSelectElement;
    expect(winnerSelect).toHaveClass("w-full");
    expect(winnerSelect).toBeEnabled();
    expect(Array.from(winnerSelect.options).map((option) => option.text)).toEqual(
      ["Select winner", longPlayerOne.name, longPlayerTwo.name]
    );
    fireEvent.change(winnerSelect, {
      target: { value: longPlayerOne.registrationId },
    });
    expect(winnerSelect).toHaveValue(longPlayerOne.registrationId);
    expect(
      screen.getByRole("button", { name: "Complete Match & Advance Winner" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Match" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Close match management" })
    ).toHaveLength(1);
  });

  it("traps administrator dialog focus and returns it after Escape, close, and backdrop dismissal", async () => {
    type ModalProps = Parameters<typeof AdminMatchManagementModal>[0];

    function AdminDialogHarness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open administrator adjudication
          </button>
          {open && (
            <AdminMatchManagementModal
              tournament={
                {
                  title: "Accessibility Cup",
                } as ModalProps["tournament"]
              }
              match={matchFixture()}
              bracketFormat="single_elimination"
              participantsById={participants(participantOne, participantTwo)}
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
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<AdminDialogHarness />);
    const opener = screen.getByRole("button", {
      name: "Open administrator adjudication",
    });
    const openDialog = async () => {
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole("dialog", {
        name: "Manage Match Accessibility Cup",
      });
      const closeButton = within(dialog).getByRole("button", {
        name: "Close match management",
      });
      await waitFor(() => expect(closeButton).toHaveFocus());
      return { closeButton, dialog };
    };

    let { closeButton, dialog } = await openDialog();
    expect(dialog).toHaveAccessibleDescription("Quarterfinals - Match 1");
    expect(dialog.parentElement).toHaveClass("p-3", "sm:p-6");
    expect(closeButton).toHaveClass("min-h-11", "min-w-11");

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), a[href], [tabindex]'
      )
    ).filter((element) => element.tabIndex >= 0);
    expect(focusable.length).toBeGreaterThan(1);
    const lastFocusable = within(dialog).getByText("Danger Zone");
    lastFocusable.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(lastFocusable).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();

    ({ closeButton } = await openDialog());
    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();

    ({ dialog } = await openDialog());
    const backdrop = dialog.parentElement?.querySelector<HTMLElement>(
      "[data-admin-match-dialog-backdrop]"
    );
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    fireEvent.mouseDown(backdrop as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("keeps administrator adjudication open while an in-dialog action is pending", async () => {
    type ModalProps = Parameters<typeof AdminMatchManagementModal>[0];
    let resolveExtension!: (result: {
      status: "success";
      message: string;
    }) => void;
    const extensionResult = new Promise<{
      status: "success";
      message: string;
    }>((resolve) => {
      resolveExtension = resolve;
    });
    extendTournamentMatchDeadlineMock.mockReturnValueOnce(extensionResult);
    const onClose = vi.fn();

    render(
      <AdminMatchManagementModal
        tournament={
          {
            title: "Pending Adjudication Cup",
          } as ModalProps["tournament"]
        }
        match={matchFixture()}
        bracketFormat="single_elimination"
        participantsById={participants(participantOne, participantTwo)}
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
        onClose={onClose}
      />
    );

    const dialog = screen.getByRole("dialog", {
      name: "Manage Match Pending Adjudication Cup",
    });
    within(dialog).getByText("Deadline & Scheduling").closest("details")!.open = true;
    const applyExtension = await within(dialog).findByRole("button", {
      name: "Apply One-Time Extension",
    });
    fireEvent.change(within(dialog).getByLabelText("Administrator reason"), {
      target: { value: "Accessibility pending-state check" },
    });
    applyExtension.focus();
    fireEvent.submit(applyExtension.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(extendTournamentMatchDeadlineMock).toHaveBeenCalledOnce();
      expect(dialog).toHaveAttribute("aria-busy", "true");
    });
    const closeButton = within(dialog).getByRole("button", {
      name: "Close match management",
    });
    const backdrop = dialog.parentElement?.querySelector<HTMLElement>(
      "[data-admin-match-dialog-backdrop]"
    );
    expect(closeButton).toBeDisabled();
    const pendingFocusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), a[href], [tabindex]'
      )
    ).filter((element) => element.tabIndex >= 0);
    expect(pendingFocusable).not.toContain(applyExtension);
    expect(pendingFocusable[0]).toBe(
      within(dialog).getByLabelText("Extension minutes")
    );
    expect(fireEvent.keyDown(window, { key: "Tab" })).toBe(false);
    expect(within(dialog).getByText("Deadline & Scheduling")).toHaveFocus();
    fireEvent.click(closeButton);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(backdrop as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(dialog);

    await act(async () => {
      resolveExtension({
        status: "success",
        message: "The match deadline was extended.",
      });
      await extensionResult;
    });
    await waitFor(() => {
      expect(dialog).toHaveAttribute("aria-busy", "false");
      expect(closeButton).toBeEnabled();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("names the dynamic-viewport player workspace and restores its opener focus", () => {
    render(
      <BracketMatchResultsWorkspace
        bracketName="Main / Pro Bracket"
        bracketFormat="single_elimination"
        matches={[matchFixture()]}
        participantsById={participants(participantOne, participantTwo)}
        viewer={{
          isAdmin: false,
          relicVerifiedDivision: null,
          registrationIds: [participantOne.registrationId],
          registrations: [],
        }}
        matchResultSubmissions={[]}
        matchResultReportGroups={[]}
      />
    );

    const opener = screen.getByRole("button", { name: "Match Results" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", {
      name: `Main / Pro Bracket — ${bracketCopy.matchWorkspace}`,
    });
    expect(dialog.parentElement).toHaveClass("h-[100dvh]");
    const dialogCloseButton = screen
      .getAllByRole("button", { name: bracketCopy.closeMatchWorkspace })
      .find((button) => dialog.contains(button));
    expect(dialogCloseButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(opener).toHaveFocus();
  });

  it("shows one-time responsive extension and hold controls only for an active match", async () => {
    render(<AdminMatchDeadlineControls match={matchFixture()} />);

    expect(screen.getByText("Active matchup")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Apply One-Time Extension" })
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

  it("keeps expired player and administrator mutations closed throughout hydration", async () => {
    const expiredMatch = matchFixture({
      deadlineAt: "2000-01-01T00:00:00.000Z",
    });
    const adminView = render(
      <AdminMatchDeadlineControls match={expiredMatch} />
    );

    expect(
      screen.queryByRole("button", { name: "Apply One-Time Extension" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Place Match On Hold" })
    ).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(
      screen.queryByRole("button", { name: "Apply One-Time Extension" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Place Match On Hold" })
    ).not.toBeInTheDocument();
    adminView.unmount();

    render(
      <MatchResultControls
        viewerRegistrationId={participantOne.registrationId}
        match={expiredMatch}
        deadlineManaged
        participantsById={participants(participantOne, participantTwo)}
        isAdmin={false}
        canSubmit
        submissions={[]}
        reportGroups={[]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Deadline Passed/ }));
    expect(screen.queryByText("Player result form marker")).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText("Player result form marker")).not.toBeInTheDocument();
  });

  it("renders every administrator deadline audit instant with semantic local time", () => {
    const activatedAt = "2099-08-01T00:00:00.000Z";
    const deadlineAt = "2099-08-08T00:00:00.000Z";
    const reminderOneSentAt = "2099-08-05T00:00:00.000Z";
    const reminderTwoSentAt = "2099-08-07T00:00:00.000Z";
    const extendedAt = "2099-08-02T00:00:00.000Z";
    const holdStartedAt = "2099-08-03T00:00:00.000Z";
    const holdReleasedAt = "2099-08-03T01:00:00.000Z";

    render(
      <AdminMatchDeadlineControls
        match={matchFixture({
          activatedAt,
          deadlineAt,
          reminderOneSentAt,
          reminderTwoSentAt,
          extensionMinutes: 60,
          extendedAt,
          holdStartedAt,
          holdReleasedAt,
        })}
      />
    );

    const timestampFor = (label: string) =>
      screen.getByText(label).parentElement?.querySelector("time");

    expect(timestampFor("Activated")).toHaveAttribute("datetime", activatedAt);
    expect(timestampFor("Effective deadline")).toHaveAttribute(
      "datetime",
      deadlineAt
    );
    expect(timestampFor("Reminder one (72h)")).toHaveAttribute(
      "datetime",
      reminderOneSentAt
    );
    expect(timestampFor("Reminder two (24h)")).toHaveAttribute(
      "datetime",
      reminderTwoSentAt
    );
    expect(timestampFor("Extension")).toHaveAttribute("datetime", extendedAt);
    expect(timestampFor("Administrative hold")).toHaveAttribute(
      "datetime",
      holdReleasedAt
    );
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
    expect(
      screen.getByText("Administrative hold").parentElement?.querySelector("time")
    ).toHaveAttribute("datetime", "2099-08-03T00:00:00.000Z");
  });

  it.each([
    [
      "Quarter Finals",
      "deadline_double_forfeit",
      "Quarter Finals double forfeit — no player advanced",
      bracketCopy.quarterfinalDoubleForfeit,
      /^Final double forfeit/,
    ],
    [
      "Semi Finals",
      "deadline_double_forfeit",
      "Semi Finals double forfeit — no player advanced",
      bracketCopy.semifinalDoubleForfeit,
      /^Final double forfeit/,
    ],
    [
      "Final",
      "deadline_double_forfeit",
      "Final double forfeit — completed without a champion",
      bracketCopy.finalDoubleForfeit,
      null,
    ],
    [
      "Grand Final",
      "deadline_double_forfeit",
      "Final double forfeit — completed without a champion",
      bracketCopy.finalDoubleForfeit,
      null,
    ],
    [
      "Quarter Finals",
      "automatic_bye",
      "Quarter Finals automatic bye — no match was played",
      bracketCopy.automaticByeDetail,
      /^Final walkover/,
    ],
    [
      "Semi Finals",
      "automatic_bye",
      "Semi Finals automatic bye — no match was played",
      bracketCopy.semifinalBye,
      /^Final walkover/,
    ],
    [
      "Final",
      "automatic_bye",
      "Final walkover — champion advanced without a played match",
      bracketCopy.finalWalkover,
      null,
    ],
    [
      "Grand Final",
      "automatic_bye",
      "Final walkover — champion advanced without a played match",
      bracketCopy.finalWalkover,
      null,
    ],
    [
      "Quarter Finals",
      "empty_feeder",
      "Quarter Finals closed — no eligible player advanced",
      bracketCopy.matchClosed,
      /^Final closed/,
    ],
    [
      "Semi Finals",
      "empty_feeder",
      "Semi Finals closed — no eligible player advanced",
      bracketCopy.semifinalClosed,
      /^Final closed/,
    ],
    [
      "Final",
      "empty_feeder",
      "Final closed — completed without a champion",
      bracketCopy.finalClosed,
      null,
    ],
    [
      "Grand Final",
      "empty_feeder",
      "Final closed — completed without a champion",
      bracketCopy.finalClosed,
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
        viewerRegistrationId={participantOne.registrationId}
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
        viewerRegistrationId={participantOne.registrationId}
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
    expect(screen.getByText(matchControlsCopy.hold)).toBeInTheDocument();
    expect(screen.queryByText("Player result form marker")).not.toBeInTheDocument();
  });

  it("preserves scheduled round-robin player result entry without a matchup deadline", () => {
    render(
      <MatchResultControls
        viewerRegistrationId={participantOne.registrationId}
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
        viewerRegistrationId={participantOne.registrationId}
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
    expect(screen.getByText(matchControlsCopy.notActivated)).toBeInTheDocument();
  });

  it("keeps direct match focus and aggregate outcome handling in the existing bracket surface", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/TournamentsExperience.tsx"),
      "utf8"
    );

    expect(source).toContain('searchParams.get("match")');
    expect(source).toContain("match-desktop-${focusedMatchId}");
    expect(source).toContain("match-mobile-${focusedMatchId}");
    expect(source).not.toContain(
      'focusedBracket?.format === "single_elimination"'
    );
    expect(source.match(/focusedMatch &&/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('t("tournaments.brackets.waitingOpponent")');
    expect(source).toContain('t("tournaments.brackets.deadlinePassed")');
    expect(source).toContain('t("bracketPresentation.noChampion")');
    expect(bracketCopy.waitingOpponent).toBe(
      "Waiting for opponent — your deadline has not started"
    );
    expect(bracketCopy.deadlinePassed).toBe(
      "Deadline passed — awaiting authoritative ruling"
    );
    expect(competitionEnglish.bracketPresentation.noChampion).toBe(
      "No champion was awarded"
    );
    expect(source).toContain(
      '["deadline_double_forfeit", "empty_feeder"].includes'
    );
  });
});
