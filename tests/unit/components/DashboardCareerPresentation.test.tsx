// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardCareerHistory from "@/components/dashboard/DashboardCareerHistory";
import DashboardMatchHistory from "@/components/DashboardMatchHistory";
import DashboardPerformance from "@/components/dashboard/DashboardPerformance";
import type { MatchHistoryEntry } from "@/lib/player-dashboard";

const match: MatchHistoryEntry = {
  id: "match-history-test",
  tournamentName: "IronClad Autumn Championship",
  bracketName: "Challenge",
  opponentName: "Opposing Player",
  result: "win",
  score: "3–1",
  playedAt: "2026-08-30T10:00:00.000Z",
  roundName: "Final",
  matchNumber: 7,
  seriesBestOf: 5,
  replayAvailable: true,
  screenshotAvailable: false,
};

describe("Dashboard career presentation", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    window.history.replaceState(null, "", "/");
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  });

  it("keeps exactly six existing statistics in a single labelled definition list", () => {
    const t = (key: string) => key.split(".").at(-1) ?? key;
    const { container } = render(
      <DashboardPerformance
        statistics={{ matchesPlayed: 8, matchesWon: 5, matchesLost: 3, winRate: 62.5, tournamentsParticipated: 2, tournamentsWon: 1 }}
        locale="en"
        t={t}
      />,
    );
    expect(container.querySelectorAll("dl")).toHaveLength(1);
    expect(Array.from(container.querySelectorAll("dt")).map((item) => item.textContent)).toEqual([
      "matchesPlayed", "matchesWon", "matchesLost", "winRate", "tournamentsParticipated", "tournamentsWon",
    ]);
    expect(Array.from(container.querySelectorAll("dd")).map((item) => item.textContent)).toEqual(["8", "5", "3", "63%", "2", "1"]);
  });

  it("opens the native modal with all existing match facts, then restores focus and scrolling", async () => {
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    render(<DashboardMatchHistory matches={[match]} />);
    const opener = screen.getByRole("button", { name: /IronClad Autumn Championship/ });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: match.tournamentName });
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("heading", { name: match.tournamentName })).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("auto");
    expect(dialog.querySelector("[data-lenis-prevent]")).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(within(dialog).getByText("Opposing Player")).toBeVisible();
    expect(within(dialog).getByText("BO5")).toBeVisible();
    expect(within(dialog).getByText("3–1")).toBeVisible();
    expect(dialog.querySelectorAll("dt")).toHaveLength(9);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("closes match detail with its visible control and safe backdrop target", () => {
    render(<DashboardMatchHistory matches={[match]} />);
    const opener = screen.getByRole("button", { name: /IronClad Autumn Championship/ });
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("supports keyboard history views while keeping every registration anchor mounted", () => {
    render(<DashboardCareerHistory matches={[match]} champions={[]} previousRegistrationCount={1} previousRegistrations={<article id="registration-old">Historical registration</article>} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("registration-old")).toBeInTheDocument();
    expect(screen.queryByText("Historical registration")).not.toBeVisible();
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(tabs[2]).toHaveFocus();
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Historical registration")).toBeVisible();
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("reveals and scrolls a previous registration from an initial hash and later hash changes", async () => {
    const scroll = HTMLElement.prototype.scrollIntoView;
    window.history.replaceState(null, "", "/dashboard#registration-old");
    render(<DashboardCareerHistory matches={[]} champions={[]} previousRegistrationCount={1} previousRegistrations={<article id="registration-old">Historical registration</article>} />);
    await waitFor(() => expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("tab")[0]);
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true"));
  });

  it("keeps independent registration history reachable when career data is unavailable", () => {
    render(<DashboardCareerHistory matches={[]} champions={[]} loadError="Career data unavailable" previousRegistrationCount={1} previousRegistrations={<article id="registration-old">Historical registration</article>} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Career data unavailable");
    expect(screen.getAllByRole("tab")[0]).not.toHaveTextContent("0");
    fireEvent.click(screen.getAllByRole("tab")[2]);
    expect(screen.getByText("Historical registration")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not turn a registration read error into an empty history", () => {
    render(<DashboardCareerHistory matches={[]} champions={[]} registrationLoadError="Registrations unavailable" />);
    const registrationTab = screen.getAllByRole("tab")[2];
    expect(registrationTab).not.toHaveTextContent("0");
    fireEvent.click(registrationTab);
    expect(screen.getByRole("alert")).toHaveTextContent("Registrations unavailable");
  });
});
