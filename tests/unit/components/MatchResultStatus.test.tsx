// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  confirm: vi.fn(),
  dispute: vi.fn(),
  support: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/tournaments/match-actions", () => ({
  confirmMatchResultReportGroup: mocks.confirm,
  disputeMatchResultReportGroup: mocks.dispute,
  resetAdminMatch: vi.fn(),
  saveAdminMatchResult: vi.fn(),
  reviewMatchResult: vi.fn(),
  reviewMatchResultReportGroup: vi.fn(),
  cleanupPreparedReplayUploads: vi.fn(),
  finalizeMatchResult: vi.fn(),
  prepareMatchReplayUploads: vi.fn(),
  submitNoShowReport: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: vi.fn() }) }));
vi.mock("@/lib/supabase-browser", () => ({
  createAuthenticatedBrowserSupabaseClient: vi.fn(() => ({})),
}));
vi.mock("@/app/tournaments/support-actions", () => ({
  requestMatchAdminAssistance: mocks.support,
}));
import MatchConfirmationCountdown from "@/components/MatchConfirmationCountdown";
import PlayerMatchResultStatus from "@/components/PlayerMatchResultStatus";
import MatchResultControls from "@/components/MatchResultControls";
import DiscordSupportLink from "@/components/RequestAdminAssistanceButton";
import { OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL } from "@/lib/support";
import {
  uxMatch,
  uxParticipants,
  uxReport,
} from "@/tests/fixtures/match-result-ux";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-04T14:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const tick = async (ms = 1) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("authoritative confirmation presentation", () => {
  it("shows the same immutable window to both viewers, never writes at expiry, and refreshes at a bounded rate", async () => {
    const { rerender } = render(
      <MatchConfirmationCountdown
        deadlineAt={uxReport.confirmationDeadlineAt}
        createdAt={uxReport.createdAt}
        isSubmitter
      />
    );
    await tick();
    expect(screen.getByText(/opponent has 30 minutes/)).toBeInTheDocument();
    expect(screen.getByText("30m 0s remaining")).toBeInTheDocument();
    rerender(
      <MatchConfirmationCountdown
        deadlineAt={uxReport.confirmationDeadlineAt}
        createdAt={uxReport.createdAt}
        isSubmitter={false}
      />
    );
    expect(screen.getByText(/You have 30 minutes/)).toBeInTheDocument();
    await tick(30 * 60_000);
    expect(
      screen.getByText("Automatic confirmation is being processed.")
    ).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await tick(30_000);
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.dispute).not.toHaveBeenCalled();
  });
  it("hydrates without clock-dependent markup, handles past/malformed deadlines, and refreshes on visibility", async () => {
    const element = (
      <MatchConfirmationCountdown
        deadlineAt={uxReport.confirmationDeadlineAt}
        createdAt={uxReport.createdAt}
        isSubmitter
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    expect(container.textContent).not.toContain("remaining");
    document.body.appendChild(container);
    const recover = vi.fn();
    const root = hydrateRoot(container, element, {
      onRecoverableError: recover,
    });
    await tick();
    expect(recover).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
    render(
      <MatchConfirmationCountdown
        deadlineAt="bad"
        createdAt={null}
        isSubmitter
      />
    );
    await tick();
    expect(
      screen.getByText(/official confirmation deadline/)
    ).toBeInTheDocument();
    fireEvent(document, new Event("visibilitychange"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    cleanup();
    mocks.refresh.mockClear();
    vi.setSystemTime(new Date("2026-09-04T15:00:00Z"));
    render(element);
    await tick();
    expect(screen.getByText("Confirmation window ended")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("shows one named submitter state and exposes confirm/dispute only to the opponent before expiry", async () => {
    const base = {
      match: uxMatch,
      report: uxReport,
      participantsById: uxParticipants,
      canRespond: true,
    };
    const { rerender } = render(
      <PlayerMatchResultStatus
        {...base}
        viewerRegistrationId={uxMatch.playerOneRegistrationId}
      />
    );
    await tick();
    expect(
      screen.getByRole("heading", {
        name: "Waiting for opponent confirmation",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Marco defeated TestAcademy4, 2–1")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm Result" })
    ).not.toBeInTheDocument();
    rerender(
      <PlayerMatchResultStatus
        {...base}
        viewerRegistrationId={uxMatch.playerTwoRegistrationId}
      />
    );
    expect(
      screen.getByRole("button", { name: "Confirm Result" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dispute Result" }));
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "2000");
    await tick(30 * 60_000);
    expect(
      screen.queryByRole("button", { name: "Confirm Result" })
    ).not.toBeInTheDocument();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it.each(["disputed", "under_review"] as const)(
    "shows %s without confirmation or editable result controls",
    (status) => {
      render(
        <PlayerMatchResultStatus
          match={uxMatch}
          report={{ ...uxReport, status }}
          participantsById={uxParticipants}
          viewerRegistrationId={uxMatch.playerTwoRegistrationId}
          canRespond
        />
      );
      expect(
        screen.getByRole("heading", { name: "Under Admin Review" })
      ).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(
        screen.queryByText("The winner has advanced.")
      ).not.toBeInTheDocument();
    }
  );
  it.each(["confirmed", "auto_approved"] as const)(
    "labels an authoritative %s result and advancement",
    (status) => {
      render(
        <PlayerMatchResultStatus
          match={{
            ...uxMatch,
            status: "completed",
            playerOneScore: 2,
            playerTwoScore: 1,
            winnerRegistrationId: uxMatch.playerOneRegistrationId,
          }}
          report={{
            ...uxReport,
            status,
            finalizedAt: "2026-09-04T14:30:01Z",
            finalizedSource:
              status === "confirmed"
                ? "opponent_confirmation"
                : "cron_auto_approval",
          }}
          participantsById={uxParticipants}
          viewerRegistrationId={uxMatch.playerOneRegistrationId}
          canRespond
        />
      );
      expect(
        screen.getByRole("heading", {
          name:
            status === "confirmed"
              ? "Result confirmed"
              : "Result automatically confirmed",
        })
      ).toBeInTheDocument();
      expect(screen.getByText("The winner has advanced.")).toBeInTheDocument();
    }
  );
});

describe("existing public match projections", () => {
  const completed = {
    ...uxMatch,
    status: "completed" as const,
    playerOneScore: 2,
    playerTwoScore: 1,
    winnerRegistrationId: uxMatch.playerOneRegistrationId,
  };
  const auto = {
    ...uxReport,
    status: "auto_approved" as const,
    finalizedAt: "2026-09-04T14:30:01Z",
    finalizedSource: "cron_auto_approval",
  };
  const base = {
    participantsById: uxParticipants,
    isAdmin: false,
    canSubmit: true,
    deadlineManaged: true,
    presentation: "workspace" as const,
    viewerRegistrationId: uxMatch.playerOneRegistrationId,
  };
  it("labels automatic results with no Admin reference or legacy submissions and keeps evidence secondary", () => {
    render(
      <MatchResultControls
        {...base}
        match={completed}
        reportGroups={[auto]}
        submissions={[]}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Result automatically confirmed" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("View submission details").closest("details")
    ).not.toHaveAttribute("open");
    expect(
      screen.queryByRole("button", { name: "Submit Result" })
    ).not.toBeInTheDocument();
  });
  it("does not relabel a current legacy result using a reset historical report", () => {
    render(
      <MatchResultControls
        {...base}
        match={completed}
        reportGroups={[{ ...auto, status: "reset", finalizedSource: "reset" }]}
        submissions={[]}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Result confirmed" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Marco defeated TestAcademy4, 2–1")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Result automatically confirmed" })
    ).not.toBeInTheDocument();
  });
  it("shows the editable form only when there is no active or legacy pending report", async () => {
    const { rerender } = render(
      <MatchResultControls
        {...base}
        match={uxMatch}
        reportGroups={[]}
        submissions={[]}
      />
    );
    await tick();
    expect(screen.getByRole("button", { name: "Won" })).toBeInTheDocument();
    rerender(
      <MatchResultControls
        {...base}
        match={uxMatch}
        reportGroups={[]}
        submissions={[
          {
            id: "legacy",
            submissionNumber: 1,
            gameNumber: 1,
            matchId: uxMatch.id,
            submittedByRegistrationId: uxMatch.playerOneRegistrationId,
            submittedByViewer: true,
            claimedWinnerRegistrationId: uxMatch.playerOneRegistrationId!,
            playerOneScore: 2,
            playerTwoScore: 1,
            hasReplay: true,
            hasScreenshot: false,
            replayAccessHref: null,
            screenshotAccessHref: null,
            notes: "Retained historical note",
            status: "pending",
            reviewNotes: null,
            reviewerLabel: null,
            reviewedAt: null,
            createdAt: uxReport.createdAt,
          },
        ]}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Won" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Retained historical note")).toBeInTheDocument();
    expect(
      screen.getByText("View submission details").closest("details")
    ).not.toHaveAttribute("open");
  });
});

it("links directly to the central owner-verified ticket channel without creating an internal request", () => {
  render(<DiscordSupportLink />);
  const link = screen.getByRole("link", {
    name: "Open Discord Support Ticket",
  });
  expect(link).toHaveAttribute("href", OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  fireEvent.click(link);
  expect(mocks.support).not.toHaveBeenCalled();
});
