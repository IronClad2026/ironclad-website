// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminMatchManagementDialog from "@/components/AdminMatchManagementDialog";
import {
  adminMatch,
  adminParticipants,
  adminReport,
} from "@/tests/fixtures/admin-match-ux";
import type { MatchResultReportGroup, TournamentCard } from "@/lib/tournaments";

const review = vi.hoisted(() =>
  vi.fn(async () => ({ status: "success", message: "Decision recorded" }))
);
vi.mock("@/app/tournaments/match-actions", () => ({
  reviewMatchResultReportGroup: review,
  reviewMatchResult: vi.fn(),
  resetAdminMatch: vi.fn(),
  saveAdminMatchResult: vi.fn(),
}));
vi.mock("@/app/admin/tournaments/deadline-actions", () => ({
  extendTournamentMatchDeadline: vi.fn(),
  holdTournamentMatchDeadline: vi.fn(),
  releaseTournamentMatchDeadline: vi.fn(),
}));
vi.mock("@/components/PlayerMatchResultForm", () => ({ default: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderMatch(
  report?: Partial<MatchResultReportGroup>,
  readOnly = false
) {
  const group = report && {
    ...adminReport,
    confirmationDeadlineAt: "2099-09-04T14:30:00Z",
    ...report,
  };
  return render(
    <AdminMatchManagementDialog
      tournament={{ title: "Fixture Cup" } as TournamentCard}
      match={
        readOnly
          ? {
              ...adminMatch,
              status: "completed",
              playerOneScore: 2,
              playerTwoScore: 1,
              winnerRegistrationId: adminMatch.playerOneRegistrationId,
            }
          : adminMatch
      }
      bracketFormat="single_elimination"
      participantsById={adminParticipants}
      viewer={{ isAdmin: true }}
      reportGroups={group ? [group] : []}
      submissions={[]}
      readOnly={readOnly}
      onClose={vi.fn()}
    />
  );
}

describe("Admin Manage Match workspace", () => {
  it("keeps exceptional operations collapsed and reset guarded", () => {
    renderMatch();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Awaiting player result submission"
    );
    for (const title of [
      "Deadline & Scheduling",
      "Submission History (0)",
      "Advanced Admin Actions",
      "Danger Zone",
    ])
      expect(screen.getByText(title).closest("details")).not.toHaveAttribute(
        "open"
      );
    const danger = screen.getByText("Danger Zone").closest("details")!;
    danger.open = true;
    const reset = within(danger).getByRole("button", { name: "Reset Match" });
    expect(reset).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type RESET to continue"), {
      target: { value: "reset" },
    });
    expect(reset).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type RESET to continue"), {
      target: { value: "RESET" },
    });
    expect(reset).toBeEnabled();
  });

  it("leaves optional review collapsed while waiting for the opponent", () => {
    renderMatch({});
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for opponent confirmation"
    );
    expect(
      screen.getByText("Optional Admin Review").closest("details")
    ).not.toHaveAttribute("open");
    expect(
      screen.queryByText(/then record your decision/)
    ).not.toBeInTheDocument();
  });

  for (const status of ["disputed", "under_review"] as const)
    it(`prioritizes ${status} without changing the review payload`, async () => {
      renderMatch({ status, disputeNotes: "Check Game 2" });
      expect(
        screen.getByText("Review Result").closest("details")
      ).toHaveAttribute("open");
      fireEvent.change(screen.getByLabelText("Administrator review message"), {
        target: { value: "Evidence reviewed" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Approve Result" }));
      await waitFor(() => expect(review).toHaveBeenCalledOnce());
      const payload = (
        review.mock.calls[0] as unknown as [unknown, FormData]
      )[1];
      expect(payload.get("reportGroupId")).toBe(adminReport.id);
      expect(payload.get("decision")).toBe("approved");
      expect(payload.get("reviewNotes")).toBe("Evidence reviewed");
    });

  it("shows persisted Game winners beside the original protected links", () => {
    renderMatch({ status: "disputed" });
    expect(screen.getAllByText("Winner: Morgan")).toHaveLength(2);
    expect(screen.getByText("Winner: Victor")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Game 2 Replay" })
    ).toHaveAttribute("href", adminReport.replayProofs[1].replayAccessHref);
  });

  it("retains no-show notes and status without requiring replay evidence", () => {
    renderMatch({
      status: "disputed",
      resultType: "no_show",
      noShowNote: "Opponent did not attend",
      noShowStatus: "disputed",
      replayProofs: [],
    });
    expect(screen.getByText("Opponent did not attend")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve No-Show" })
    ).toBeInTheDocument();
  });

  it("keeps completed evidence current and all terminal actions absent", () => {
    const { container } = renderMatch(
      {
        status: "auto_approved",
        finalizedAt: "2026-09-04T15:00:00Z",
        finalizedSource: "cron_auto_approval",
      },
      true
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Read-Only Match History Fixture Cup"
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Result automatically confirmed"
    );
    expect(container.ownerDocument.querySelectorAll("form")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "View Game 1 Replay" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Danger Zone")).not.toBeInTheDocument();
  });

  it("keeps reset evidence in history rather than labeling it the current report", () => {
    renderMatch({ status: "reset", finalizedAt: "2026-09-04T15:00:00Z" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Awaiting player result submission"
    );
    const history = screen
      .getByText("Submission History (1)")
      .closest("details")!;
    expect(history).not.toHaveAttribute("open");
    expect(
      within(history).getByText(/Morgan defeated Victor/)
    ).toBeInTheDocument();
  });
});
