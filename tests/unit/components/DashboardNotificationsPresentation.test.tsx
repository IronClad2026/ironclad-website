// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardNotifications from "@/components/DashboardNotifications";
import type { DashboardNotification } from "@/lib/player-dashboard";

const refreshMock = vi.hoisted(() => vi.fn());
const dismissDashboardNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/app/dashboard/actions", () => ({
  confirmDashboardMatchResult: vi.fn(),
  dismissDashboardNotifications: dismissDashboardNotificationsMock,
  disputeDashboardMatchResult: vi.fn(),
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
});

function actionNotification(): DashboardNotification {
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
  };
}
