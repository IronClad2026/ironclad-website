// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const terminalActions = vi.hoisted(() => ({
  cancel: vi.fn(),
  void: vi.fn(),
}));

vi.mock("@/app/admin/tournaments/actions", () => ({
  cancelTournamentAction: terminalActions.cancel,
  voidTournamentAction: terminalActions.void,
}));

import TournamentRecoveryControl from "@/components/TournamentRecoveryControl";

const tournamentId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  cleanup();
});

describe("TournamentRecoveryControl", () => {
  it("requires a reason and the exact operation token before enabling either action", () => {
    render(
      <TournamentRecoveryControl
        tournamentId={tournamentId}
        tournamentTitle="Recovery Cup"
        terminal={null}
        underReview={null}
      />
    );

    const cancelButton = screen.getByRole("button", {
      name: "Cancel Tournament",
    });
    const voidButton = screen.getByRole("button", {
      name: "Void Tournament",
    });

    expect(cancelButton).toBeDisabled();
    expect(voidButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Administrator reason", { selector: "#cancel-tournament-11111111-1111-4111-8111-111111111111-reason" }), {
      target: { value: "Launched without official history" },
    });
    fireEvent.change(screen.getByLabelText("Type CANCEL exactly to confirm"), {
      target: { value: "cancel" },
    });
    expect(cancelButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type CANCEL exactly to confirm"), {
      target: { value: "CANCEL" },
    });
    expect(cancelButton).toBeEnabled();

    fireEvent.change(screen.getAllByLabelText("Administrator reason")[1], {
      target: { value: "Derived effects must not count" },
    });
    fireEvent.change(screen.getByLabelText("Type VOID exactly to confirm"), {
      target: { value: "VOID" },
    });
    expect(voidButton).toBeEnabled();
  });

  it("renders a terminal tournament as view-only with safe administrator attribution", () => {
    const { container } = render(
      <TournamentRecoveryControl
        tournamentId={tournamentId}
        tournamentTitle="Recovery Cup"
        terminal={{
          status: "voided",
          at: "2026-08-13T02:00:00.000Z",
          reason: "Official results were invalidated.",
        }}
        underReview={null}
      />
    );

    expect(screen.getByText("Terminal - View Only")).toBeInTheDocument();
    expect(screen.getByText("Performed by")).toBeInTheDocument();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByText("Official results were invalidated.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Void Tournament" })
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("user_");
  });

  it("shows private finalized-season review facts without an adjudication or repeat terminal control", () => {
    render(
      <TournamentRecoveryControl
        tournamentId={tournamentId}
        tournamentTitle="Recovery Cup"
        terminal={null}
        underReview={{
          seasonName: "2026 Main / Pro Season",
          at: "2026-08-13T03:00:00.000Z",
          reason: "Finalized qualifier requires adjudication.",
          triggeringTournamentTitle: "Recovery Cup",
        }}
      />
    );

    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(
      screen.getByText("Finalized qualifier requires adjudication.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Frozen standings were not changed/)).toBeInTheDocument();
    expect(screen.getByText(/Separate adjudication is required/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel Tournament" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resolve/i })).not.toBeInTheDocument();
  });
});
