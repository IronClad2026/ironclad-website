// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RelicEloVerificationCard from "@/components/RelicEloVerificationCard";

const verifyRelicProfileEloMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/profile/relic-elo-action", () => ({
  verifyRelicProfileElo: verifyRelicProfileEloMock,
}));

const initialVerification = {
  elo: 1425,
  faction: "British Forces",
  division: "Challenge",
  calculationVersion: "relic-1v1-v1",
  verifiedAt: "2026-08-04T01:00:00.000Z",
};

const defaultProps = {
  hasPlayer: true,
  steamConnected: true,
  statusAvailable: true,
  initialVerification: null,
  initialRefreshAvailableAt: null,
};

describe("RelicEloVerificationCard", () => {
  beforeEach(() => {
    verifyRelicProfileEloMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("requires a saved player profile without making a request", () => {
    render(<RelicEloVerificationCard {...defaultProps} hasPlayer={false} />);

    expect(
      screen.getByText("Save your profile before verifying ELO.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(verifyRelicProfileEloMock).not.toHaveBeenCalled();
  });

  it("requires Steam to be connected without making a request", () => {
    render(
      <RelicEloVerificationCard {...defaultProps} steamConnected={false} />
    );

    expect(
      screen.getByText("Connect Steam before verifying ELO.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(verifyRelicProfileEloMock).not.toHaveBeenCalled();
  });

  it("fails closed when protected status is unavailable", () => {
    render(
      <RelicEloVerificationCard {...defaultProps} statusAvailable={false} />
    );

    expect(
      screen.getByText("ELO verification status is temporarily unavailable.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers first-time verification without showing a result", () => {
    render(<RelicEloVerificationCard {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Verify ELO" })
    ).toBeEnabled();
    expect(screen.queryByText("Verified ELO")).not.toBeInTheDocument();
  });

  it("shows every safe field from a successful verification", () => {
    render(
      <RelicEloVerificationCard
        {...defaultProps}
        initialVerification={initialVerification}
      />
    );

    expect(screen.getByText("1,425")).toBeInTheDocument();
    expect(screen.getByText("British Forces")).toBeInTheDocument();
    expect(screen.getByText("Challenge")).toBeInTheDocument();
    expect(screen.getByText("Relic", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("relic-1v1-v1")).toBeInTheDocument();
    expect(
      document.querySelector(
        'time[datetime="2026-08-04T01:00:00.000Z"]'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh ELO" })
    ).toBeEnabled();
  });

  it("disables during cooldown and automatically re-enables at expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T01:00:00.000Z"));

    render(
      <RelicEloVerificationCard
        {...defaultProps}
        initialVerification={initialVerification}
        initialRefreshAvailableAt="2026-08-04T01:15:00.000Z"
      />
    );

    const refreshButton = screen.getByRole("button", { name: "Refresh ELO" });
    expect(refreshButton).toBeDisabled();
    expect(screen.getByText(/Available again at/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(refreshButton).toBeEnabled();
    expect(screen.queryByText(/Available again at/)).not.toBeInTheDocument();
  });

  it("disables while pending and prevents a repeated request", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    verifyRelicProfileEloMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    render(<RelicEloVerificationCard {...defaultProps} />);

    const verifyButton = screen.getByRole("button", { name: "Verify ELO" });
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Verifying..." })
      ).toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Verifying..." }));
    expect(verifyRelicProfileEloMock).toHaveBeenCalledOnce();

    await act(async () => {
      resolveRequest?.({
        status: "error",
        message: "ELO verification could not be completed right now.",
      });
    });
  });

  it("replaces the displayed snapshot after a successful refresh", async () => {
    verifyRelicProfileEloMock.mockResolvedValue({
      status: "success",
      message: "Your Relic ELO was refreshed.",
      snapshot: {
        elo: 1510,
        faction: "US Forces",
        division: "Main / Pro",
        calculationVersion: "relic-1v1-v2",
        verifiedAt: "2026-08-04T02:00:00.000Z",
      },
      refreshAvailableAt: "2026-08-04T02:15:00.000Z",
    });
    render(
      <RelicEloVerificationCard
        {...defaultProps}
        initialVerification={initialVerification}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh ELO" }));

    await waitFor(() => {
      expect(screen.getByText("1,510")).toBeInTheDocument();
    });
    expect(screen.getByText("US Forces")).toBeInTheDocument();
    expect(screen.getByText("Main / Pro")).toBeInTheDocument();
    expect(screen.getByText("relic-1v1-v2")).toBeInTheDocument();
    expect(screen.queryByText("1,425")).not.toBeInTheDocument();
    expect(screen.getByText("Your Relic ELO was refreshed.")).toBeInTheDocument();
  });

  it("keeps a previous snapshot visible when refresh fails", async () => {
    verifyRelicProfileEloMock.mockResolvedValue({
      status: "unavailable",
      message: "Relic is temporarily unavailable.",
      refreshAvailableAt: "2026-08-04T02:15:00.000Z",
    });
    render(
      <RelicEloVerificationCard
        {...defaultProps}
        initialVerification={initialVerification}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh ELO" }));

    await waitFor(() => {
      expect(
        screen.getByText("Relic is temporarily unavailable.")
      ).toBeInTheDocument();
    });
    expect(screen.getByText("1,425")).toBeInTheDocument();
    expect(screen.getByText("British Forces")).toBeInTheDocument();
    expect(screen.getByText("Challenge")).toBeInTheDocument();
  });

  it("uses a server cooldown result without clearing the snapshot", async () => {
    const refreshAvailableAt = new Date(
      Date.now() + 15 * 60 * 1000
    ).toISOString();
    verifyRelicProfileEloMock.mockResolvedValue({
      status: "cooldown",
      message: "ELO verification is available again later.",
      refreshAvailableAt,
    });
    render(
      <RelicEloVerificationCard
        {...defaultProps}
        initialVerification={initialVerification}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh ELO" }));

    await waitFor(() => {
      expect(screen.getByText("1,425")).toBeInTheDocument();
      expect(screen.getByText(/Available again at/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Refresh ELO" })
      ).toBeDisabled();
    });
  });
});
