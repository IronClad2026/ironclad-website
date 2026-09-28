// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardCareerHistory from "@/components/dashboard/DashboardCareerHistory";
import DashboardRegistrationArchive from "@/components/dashboard/DashboardRegistrationArchive";
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

  it("keeps two keyboard-operated career tabs independent from the mounted registration archive", () => {
    render(<>
      <DashboardCareerHistory matches={[match]} champions={[]} />
      <DashboardRegistrationArchive count={1}>
        <article id="registration-old">Historical registration</article>
      </DashboardRegistrationArchive>
    </>);
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
    expect(document.getElementById("registration-old")).toBeInTheDocument();
    expect(screen.queryByText("Historical registration")).not.toBeVisible();
    tabs[0].focus();
    for (const [key, selectedIndex] of [["End", 1], ["ArrowRight", 0], ["ArrowLeft", 1], ["Home", 0]] as const) {
      fireEvent.keyDown(document.activeElement!, { key });
      expect(tabs[selectedIndex]).toHaveFocus();
      expect(tabs[selectedIndex]).toHaveAttribute("aria-selected", "true");
      expect(tabs[selectedIndex]).toHaveAttribute("tabindex", "0");
      expect(tabs[1 - selectedIndex]).toHaveAttribute("aria-selected", "false");
      expect(tabs[1 - selectedIndex]).toHaveAttribute("tabindex", "-1");
      expect(screen.getByText("Historical registration")).not.toBeVisible();
    }
    fireEvent.click(screen.getByRole("button", { name: /Registration Archive/ }));
    expect(screen.getByText("Historical registration")).toBeVisible();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("reveals the archive before scrolling an initial registration hash and the same hash after collapsing", async () => {
    const scroll = HTMLElement.prototype.scrollIntoView;
    const hiddenAtScroll: boolean[] = [];
    vi.mocked(scroll).mockImplementation(function (this: HTMLElement) {
      hiddenAtScroll.push(this.closest("[hidden]") !== null);
    });
    // Browsers can paint before React commits a concurrent disclosure update. An
    // eager frame reproduces that ordering; navigation must wait for visibility.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    window.history.replaceState(null, "", "/dashboard#registration-old");
    render(<DashboardRegistrationArchive count={1}>
      <article id="registration-old">Historical registration</article>
    </DashboardRegistrationArchive>);
    const toggle = screen.getByRole("button", { name: /Registration Archive/ });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(hiddenAtScroll).toEqual([false]);
    expect(scroll).toHaveBeenLastCalledWith({ block: "start" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Historical registration")).not.toBeVisible();
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
    expect(hiddenAtScroll).toEqual([false, false]);
  });

  it("keeps the registration archive reachable without clearing an independent career error", () => {
    render(<>
      <DashboardCareerHistory matches={[]} champions={[]} loadError="Career data unavailable" />
      <DashboardRegistrationArchive count={1}>
        <article id="registration-old">Historical registration</article>
      </DashboardRegistrationArchive>
    </>);
    expect(screen.getByRole("alert")).toHaveTextContent("Career data unavailable");
    expect(screen.getByRole("tab", { name: "Tournaments" })).not.toHaveTextContent("0");
    expect(screen.getByRole("tab", { name: "Championships" })).not.toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: /Registration Archive/ }));
    expect(screen.getByText("Historical registration")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Career data unavailable");
    fireEvent.click(screen.getByRole("tab", { name: "Championships" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Career data unavailable");
    expect(screen.getByText("Historical registration")).toBeVisible();
  });

  it("keeps career results available when the archive read fails, without reporting an empty archive", () => {
    render(<>
      <DashboardCareerHistory matches={[match]} champions={[]} />
      <DashboardRegistrationArchive count={0} loadError="Registrations unavailable">{null}</DashboardRegistrationArchive>
    </>);
    expect(screen.getByRole("tab", { name: /^Tournaments\s*1$/ })).toHaveAttribute("aria-selected", "true");
    const archiveToggle = screen.getByRole("button", { name: /Registration Archive/ });
    expect(archiveToggle).not.toHaveTextContent("0");
    fireEvent.click(archiveToggle);
    expect(screen.getByRole("alert")).toHaveTextContent("Registrations unavailable");
    expect(screen.getByText(match.opponentName)).toBeVisible();
    expect(screen.queryByText("No previous registrations.")).not.toBeInTheDocument();
  });

  it("keeps empty career and archive states distinct", () => {
    render(<>
      <DashboardCareerHistory matches={[]} champions={[]} />
      <DashboardRegistrationArchive count={0}>{null}</DashboardRegistrationArchive>
    </>);
    expect(screen.getByRole("tab", { name: /^Tournaments\s*0$/ })).toHaveAttribute("aria-selected", "true");
    const archiveToggle = screen.getByRole("button", { name: /Registration Archive\s*0/ });
    expect(archiveToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(archiveToggle);
    expect(screen.getByText("No previous registrations.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
