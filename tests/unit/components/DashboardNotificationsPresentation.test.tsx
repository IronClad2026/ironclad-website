// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardNotifications from "@/components/DashboardNotifications";
import type { DashboardNotification } from "@/lib/player-dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/dashboard/actions", () => ({
  confirmDashboardMatchResult: vi.fn(),
  dismissDashboardNotifications: vi.fn(),
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
  });

  it("shows the action-required indicator for a response workflow", () => {
    render(<DashboardNotifications notifications={[actionNotification()]} />);

    expect(screen.getByText("Action required")).toBeInTheDocument();
    expect(screen.getByText("1 requires action")).toBeInTheDocument();
    expect(screen.getByText("1 match message")).toBeInTheDocument();
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
