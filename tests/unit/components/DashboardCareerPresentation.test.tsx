// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardCareerHistory from "@/components/dashboard/DashboardCareerHistory";
import DashboardMatchHistory from "@/components/DashboardMatchHistory";
import DashboardPerformance from "@/components/dashboard/DashboardPerformance";
import type { MatchHistoryEntry } from "@/lib/player-dashboard";

const match: MatchHistoryEntry = {
  id: "match-history-test",
  tournamentId: "tournament-history-test",
  tournamentBracketId: "division-history-test",
  generatedBracketId: "generation-history-test",
  tournamentBannerImageUrl: null,
  tournamentName: "IronClad Autumn Championship",
  bracketName: "Challenge",
  opponentName: "Opposing Player",
  result: "win",
  score: "3–1",
  playedAt: "2026-08-30T10:00:00.000Z",
  roundName: "Final",
  roundNumber: 3,
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

  it("wraps forward and reverse Tab inside the native match dialog", () => {
    render(<DashboardMatchHistory matches={[match]} />);
    fireEvent.click(screen.getByRole("button", { name: /IronClad Autumn Championship/ }));
    const dialog = screen.getByRole("dialog", { name: match.tournamentName });
    const close = within(dialog).getByRole("button");
    vi.spyOn(close, "getClientRects").mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);

    // Reverse Tab from the initially focused heading reaches the last control.
    expect(fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true })).toBe(false);
    expect(close).toHaveFocus();
    for (const shiftKey of [false, true, false, true]) {
      expect(fireEvent.keyDown(close, { key: "Tab", shiftKey })).toBe(false);
      expect(close).toHaveFocus();
    }
    expect(fireEvent.keyDown(close, { key: "ArrowDown" })).toBe(true);
  });

  it("keeps two keyboard-operated career tabs without an administrative history section", () => {
    render(<DashboardCareerHistory matches={[match]} champions={[]} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAccessibleName(/^Tournaments\s*1$/);
    expect(tabs[1]).toHaveAccessibleName(/^Championships\s*0$/);
    expect(screen.queryByRole("tab", { name: /registrations/i })).not.toBeInTheDocument();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    for (const tab of tabs) {
      expect(document.getElementById(tab.getAttribute("aria-controls")!))
        .toHaveAttribute("aria-labelledby", tab.id);
    }
    expect(screen.queryByRole("button", { name: /Registration Archive/, hidden: true })).not.toBeInTheDocument();
    tabs[0].focus();
    for (const [key, selectedIndex] of [["End", 1], ["ArrowRight", 0], ["ArrowLeft", 1], ["Home", 0]] as const) {
      fireEvent.keyDown(document.activeElement!, { key });
      expect(tabs[selectedIndex]).toHaveFocus();
      expect(tabs[selectedIndex]).toHaveAttribute("aria-selected", "true");
      expect(tabs[selectedIndex]).toHaveAttribute("tabindex", "0");
      expect(tabs[1 - selectedIndex]).toHaveAttribute("aria-selected", "false");
      expect(tabs[1 - selectedIndex]).toHaveAttribute("tabindex", "-1");
    }
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("preserves career load errors in both competitive views", () => {
    render(<DashboardCareerHistory matches={[]} champions={[]} loadError="Career data unavailable" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Career data unavailable");
    expect(screen.getByRole("tab", { name: "Tournaments" })).not.toHaveTextContent("0");
    expect(screen.getByRole("tab", { name: "Championships" })).not.toHaveTextContent("0");
    fireEvent.click(screen.getByRole("tab", { name: "Championships" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Career data unavailable");
  });

  it("preserves empty tournament and championship states without an archive", () => {
    render(<DashboardCareerHistory matches={[]} champions={[]} />);
    expect(screen.getByRole("tab", { name: /^Tournaments\s*0$/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Completed tournament runs will appear here.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /^Championships\s*0$/ }));
    expect(screen.getByText("Tournament victories will be permanently displayed here.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Registration Archive/, hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
