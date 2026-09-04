// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardNotifications from "@/components/DashboardNotifications";
import type { NotificationActionResult } from "@/app/dashboard/actions";
import type { DashboardNotification } from "@/lib/player-dashboard";

const refreshMock = vi.hoisted(() => vi.fn());
const confirmDashboardMatchResultMock = vi.hoisted(() => vi.fn());
const dismissDashboardNotificationsMock = vi.hoisted(() => vi.fn());
const disputeDashboardMatchResultMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/app/dashboard/actions", () => ({
  confirmDashboardMatchResult: confirmDashboardMatchResultMock,
  dismissDashboardNotifications: dismissDashboardNotificationsMock,
  disputeDashboardMatchResult: disputeDashboardMatchResultMock,
}));

describe("match actions card presentation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses a distinct action treatment and muted empty status", () => {
    const { container } = render(<DashboardNotifications notifications={[]} />);

    expect(screen.getByText("Match Actions")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Result confirmations, disputes, rejected or resubmission items, and other actions that need your response."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("No actions required")).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield-alert")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Match Actions/i }));
    expect(
      screen.getByText("There are no match actions waiting for your response.")
    ).toBeInTheDocument();
  });

  it("shows the action-required indicator for a response workflow", () => {
    render(<DashboardNotifications notifications={[actionNotification()]} />);

    expect(screen.getByText("Action required")).toBeInTheDocument();
    expect(screen.getByText("1 requires action")).toBeInTheDocument();
    expect(screen.getByText("1 match message")).toBeInTheDocument();
  });

  it("shows an immediate retry state instead of empty Match Action summaries", () => {
    render(
      <DashboardNotifications
        notifications={[]}
        error="Match Actions could not be loaded."
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Match Actions could not be loaded."
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Retry to load current confirmations"
    );
    expect(screen.queryByText("No actions required")).not.toBeInTheDocument();
    expect(
      screen.queryByText("There are no match actions waiting for your response.")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("keeps loaded Match Actions visible when a mutation fails", async () => {
    dismissDashboardNotificationsMock.mockResolvedValue({
      status: "error",
      code: "update-failed",
    });
    render(<DashboardNotifications notifications={[actionNotification()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Match Actions/i }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete notification Submission #1",
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText("Your notifications could not be updated.")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Match result confirmation required")
    ).toBeInTheDocument();
    expect(screen.getByText("1 requires action")).toBeInTheDocument();
  });

  it("makes result confirmation and dispute a named, trapped, touch-safe dialog that returns focus", async () => {
    render(
      <DashboardNotifications
        notifications={[
          actionNotification({
            confirmationDeadlineAt: "2099-08-21T01:00:00.000Z",
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Match Actions/i }));
    const opener = screen
      .getByText("Match result confirmation required")
      .closest("button") as HTMLButtonElement;

    const openDialog = async () => {
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole("dialog", {
        name: "Match result confirmation required",
      });
      const closeButton = within(dialog).getByRole("button", {
        name: "Close notification",
      });
      await waitFor(() => expect(closeButton).toHaveFocus());
      return { closeButton, dialog };
    };

    let { closeButton, dialog } = await openDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "Your opponent submitted the result for your match in IronClad Cup. Confirm or dispute it before the confirmation window expires."
    );
    expect(dialog).toHaveClass("w-[min(92vw,30rem)]", "max-h-[88vh]");
    expect(closeButton).toHaveClass("min-h-11", "min-w-11");

    const notes = await within(dialog).findByLabelText(
      "Optional dispute notes"
    );
    const confirmButton = within(dialog).getByRole("button", {
      name: "Confirm result",
    });
    const disputeButton = within(dialog).getByRole("button", {
      name: "Dispute result",
    });
    expect(notes).toHaveClass("min-h-11");
    expect(confirmButton).toHaveClass("min-h-11");
    expect(disputeButton).toHaveClass("min-h-11");

    disputeButton.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(disputeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Focus restoration runs in the dialog's passive-effect cleanup.
    await waitFor(() => expect(opener).toHaveFocus());

    ({ closeButton, dialog } = await openDialog());
    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Focus restoration runs in the dialog's passive-effect cleanup.
    await waitFor(() => expect(opener).toHaveFocus());

    ({ dialog } = await openDialog());
    const backdrop = dialog.parentElement?.querySelector<HTMLElement>(
      "[data-notification-dialog-backdrop]"
    );
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    fireEvent.mouseDown(backdrop as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Focus restoration runs in the dialog's passive-effect cleanup.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("keeps the player dialog open and non-dismissible while a dispute is pending", async () => {
    let resolveDispute!: (result: NotificationActionResult) => void;
    const disputeResult = new Promise<NotificationActionResult>((resolve) => {
      resolveDispute = resolve;
    });
    disputeDashboardMatchResultMock.mockReturnValueOnce(disputeResult);

    render(
      <DashboardNotifications
        notifications={[
          actionNotification({
            confirmationDeadlineAt: "2099-08-21T01:00:00.000Z",
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Match Actions/i }));
    const opener = screen
      .getByText("Match result confirmation required")
      .closest("button") as HTMLButtonElement;
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", {
      name: "Match result confirmation required",
    });
    const notes = await within(dialog).findByLabelText(
      "Optional dispute notes"
    );
    const disputeButton = await within(dialog).findByRole("button", {
      name: "Dispute result",
    });
    fireEvent.change(notes, { target: { value: "The reported score is wrong." } });
    fireEvent.click(disputeButton);

    await waitFor(() => {
      expect(disputeDashboardMatchResultMock).toHaveBeenCalledOnce();
      expect(dialog).toHaveAttribute("aria-busy", "true");
    });
    const submittedData = disputeDashboardMatchResultMock.mock.calls[0][0] as FormData;
    expect(submittedData.get("disputeNotes")).toBe("The reported score is wrong.");

    const closeButton = within(dialog).getByRole("button", {
      name: "Close notification",
    });
    const backdrop = dialog.parentElement?.querySelector<HTMLElement>(
      "[data-notification-dialog-backdrop]"
    );
    expect(closeButton).toBeDisabled();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(notes).toHaveFocus();
    fireEvent.click(closeButton);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(backdrop as HTMLElement);
    expect(screen.getByRole("dialog")).toBe(dialog);

    await act(async () => {
      resolveDispute({
        status: "error",
        code: "dispute-failed",
        message: "The match result could not be disputed. Please try again.",
      });
      await disputeResult;
    });
    await waitFor(() => {
      expect(dialog).toHaveAttribute("aria-busy", "false");
      expect(closeButton).toBeEnabled();
      expect(
        within(dialog).getByText(
          "The Match result could not be disputed. Please try again."
        )
      ).toBeInTheDocument();
    });

    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Focus restoration runs in the dialog's passive-effect cleanup.
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

function actionNotification(
  overrides: Partial<DashboardNotification> = {}
): DashboardNotification {
  return {
    id: "report_group:11111111-1111-4111-8111-111111111111",
    source: "report_group",
    sourceId: "11111111-1111-4111-8111-111111111111",
    reportGroupId: "11111111-1111-4111-8111-111111111111",
    resultType: "normal",
    noShowRegistrationId: null,
    noShowStatus: null,
    submissionNumber: 1,
    gameNumber: 1,
    tournamentName: "IronClad Cup",
    roundName: "Final",
    matchNumber: 1,
    opponentName: "Opponent",
    reportedWinner: "Player",
    reportedLoser: "Opponent",
    reportedScore: "2–1",
    status: "pending_confirmation",
    reviewNotes: null,
    submittedAt: "2026-08-21T00:00:00.000Z",
    reviewedAt: null,
    submittedByViewer: false,
    confirmationDeadlineAt: null,
    finalizedAt: null,
    canConfirm: true,
    canDispute: true,
    ...overrides,
  };
}
