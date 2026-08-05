// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ActiveTournamentEloSnapshotIndicator, {
  type ActiveTournamentEloSnapshot,
} from "@/components/ActiveTournamentEloSnapshotIndicator";

const snapshot: ActiveTournamentEloSnapshot = {
  tournamentTitle: "IronClad August Open",
  elo: 1325,
  division: "Challenge",
};

describe("ActiveTournamentEloSnapshotIndicator", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders no icon without an active tournament registration", () => {
    render(<ActiveTournamentEloSnapshotIndicator snapshots={[]} />);

    expect(
      screen.queryByRole("button", {
        name: "View active tournament ELO snapshots",
      })
    ).not.toBeInTheDocument();
  });

  it("shows the frozen snapshot rather than the adjacent Current ELO", () => {
    render(
      <div>
        <output aria-label="Current ELO">1550</output>
        <ActiveTournamentEloSnapshotIndicator snapshots={[snapshot]} />
      </div>
    );
    const button = screen.getByRole("button", {
      name: "View active tournament ELO snapshots",
    });

    fireEvent.mouseEnter(button);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Tournament ELO Snapshot");
    expect(tooltip).toHaveTextContent("IronClad August Open");
    expect(tooltip).toHaveTextContent("Snapshot ELO: 1325");
    expect(tooltip).toHaveTextContent("Division: Challenge");
    expect(tooltip).toHaveTextContent(
      "Locked for this tournament's duration."
    );
    expect(tooltip).not.toHaveTextContent("1550");
  });

  it("lists each active tournament compactly without rendering private identifiers", () => {
    const snapshots = [
      snapshot,
      {
        tournamentTitle: "IronClad Spring Cup",
        elo: 1450,
        division: "Main / Pro",
        clerkUserId: "user_private_clerk",
        steamId64: "76561198012345678",
        profileId: "11111111-1111-4111-8111-111111111111",
        registrationId: "22222222-2222-4222-8222-222222222222",
      },
    ] as ActiveTournamentEloSnapshot[];
    render(<ActiveTournamentEloSnapshotIndicator snapshots={snapshots} />);

    fireEvent.focus(
      screen.getByRole("button", {
        name: "View active tournament ELO snapshots",
      })
    );

    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByText("IronClad August Open")).toBeVisible();
    expect(within(tooltip).getByText("IronClad Spring Cup")).toBeVisible();
    expect(tooltip).toHaveTextContent("Snapshot ELO: 1450");
    expect(tooltip).not.toHaveTextContent("user_private_clerk");
    expect(tooltip).not.toHaveTextContent("76561198012345678");
    expect(tooltip).not.toHaveTextContent(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(tooltip).not.toHaveTextContent(
      "22222222-2222-4222-8222-222222222222"
    );
  });

  it("opens on desktop hover and keyboard focus, then closes when both leave", () => {
    render(<ActiveTournamentEloSnapshotIndicator snapshots={[snapshot]} />);
    const button = screen.getByRole("button", {
      name: "View active tournament ELO snapshots",
    });
    const root = button.parentElement;

    expect(root).not.toBeNull();
    fireEvent.mouseEnter(root!);
    expect(screen.getByRole("tooltip")).toBeVisible();

    fireEvent.mouseLeave(root!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(root!);
    button.focus();
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeVisible();
    expect(button).toHaveAttribute("aria-expanded", "true");

    button.blur();
    fireEvent.blur(button, { relatedTarget: document.body });
    expect(screen.getByRole("tooltip")).toBeVisible();

    fireEvent.mouseLeave(root!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    button.focus();
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeVisible();

    fireEvent.mouseLeave(root!);
    expect(screen.getByRole("tooltip")).toBeVisible();

    button.blur();
    fireEvent.blur(button, { relatedTarget: document.body });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("toggles on touch and closes on Escape or an outside interaction", () => {
    render(<ActiveTournamentEloSnapshotIndicator snapshots={[snapshot]} />);
    const button = screen.getByRole("button", {
      name: "View active tournament ELO snapshots",
    });

    tap(button);
    expect(screen.getByRole("tooltip")).toBeVisible();

    tap(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    tap(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    tap(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

function tap(button: HTMLElement) {
  fireEvent.pointerDown(button, { pointerType: "touch" });
  fireEvent.click(button);
}
