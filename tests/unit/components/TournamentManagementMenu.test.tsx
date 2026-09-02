// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TournamentManagementMenu, {
  TournamentDesktopSectionNavigation,
} from "@/components/admin/tournaments/TournamentManagementMenu";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const expectedSections = [
  ["Overview", "overview"],
  ["Edit Tournament", "edit"],
  ["Registrations", "registrations"],
  ["Players / Waitlist", "players-waitlist"],
  ["Bracket", "bracket"],
  ["Matches / Results", "matches"],
  ["Replay Archive", "replays"],
  ["Media", "media"],
  ["Map Pool", "map-pool"],
  ["Tournament Controls", "controls"],
] as const;

function renderMenu() {
  render(
    <TournamentManagementMenu
      activeSection="registrations"
      tournamentId={tournamentId}
    />
  );

  return screen.getByRole("button", {
    name: "Open Tournament management menu",
  });
}

function openMenu() {
  const trigger = renderMenu();
  trigger.focus();
  fireEvent.click(trigger);

  return {
    dialog: screen.getByRole("dialog", { name: "Manage Tournament" }),
    trigger,
  };
}

describe("TournamentManagementMenu", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  it("opens an accessible safe-area drawer with every focused workspace section", async () => {
    const trigger = renderMenu();
    const controlledId = trigger.getAttribute("aria-controls");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveClass("h-11", "w-11", "xl:hidden");

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Manage Tournament" });
    const navigation = within(dialog).getByRole("navigation", {
      name: "Tournament management sections",
    });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("id", controlledId);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "Choose one management area."
    );
    expect(dialog.className).toContain(
      "[padding-top:max(1rem,env(safe-area-inset-top))]"
    );
    expect(dialog.className).toContain(
      "[padding-bottom:max(1rem,env(safe-area-inset-bottom))]"
    );
    expect(document.body.style.overflow).toBe("hidden");

    for (const [label, section] of expectedSections) {
      expect(within(navigation).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        `/admin/tournaments/${tournamentId}?section=${section}`
      );
    }

    expect(
      within(navigation).getByRole("link", {
        name: "Registrations",
      })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).getAllByRole("link", { current: "page" })
    ).toHaveLength(1);
    expect(
      within(navigation)
        .getByRole("link", { name: "Tournament Controls" })
        .closest("li")
    ).toHaveAttribute("data-management-group", "tournament-controls");

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Close Tournament management menu",
        })
      ).toHaveFocus()
    );
  });

  it("traps Tab, closes on Escape, restores focus, and unlocks page scrolling", async () => {
    const { dialog, trigger } = openMenu();
    const close = within(dialog).getByRole("button", {
      name: "Close Tournament management menu",
    });
    const controls = within(dialog).getByRole("link", {
      name: "Tournament Controls",
    });

    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(controls).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    trigger.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    });
  });

  it("closes on outside click and when a management section is chosen", async () => {
    const { trigger } = openMenu();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close Tournament management menu backdrop",
      })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    fireEvent.click(trigger);
    const mapPool = screen.getByRole("link", { name: "Map Pool" });
    mapPool.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(mapPool);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("closes the mobile drawer when the viewport crosses into desktop navigation", async () => {
    let desktopChangeListener:
      | ((event: MediaQueryListEvent) => void)
      | undefined;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void
      ) => {
        desktopChangeListener = listener;
      },
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }));

    const { trigger } = openMenu();
    expect(screen.getByRole("dialog", { name: "Manage Tournament" })).toBeInTheDocument();

    act(() => {
      desktopChangeListener?.({ matches: true } as MediaQueryListEvent);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(document.body.style.overflow).toBe("");
    });
  });

  it("reuses the exact section destinations in an always-visible desktop navigator", () => {
    render(
      <TournamentDesktopSectionNavigation
        activeSection="bracket"
        tournamentId={tournamentId}
      />
    );

    const navigation = screen.getByRole("navigation", {
      name: "Tournament management sections",
    });
    expect(navigation).toHaveClass("hidden", "xl:block");

    for (const [label, section] of expectedSections) {
      expect(within(navigation).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        `/admin/tournaments/${tournamentId}?section=${section}`
      );
    }

    expect(
      within(navigation).getByRole("link", { name: "Bracket" })
    ).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getAllByRole("link", { current: "page" }))
      .toHaveLength(1);
    expect(
      within(navigation)
        .getByRole("link", { name: "Tournament Controls" })
        .closest("li")
    ).toHaveAttribute("data-management-group", "tournament-controls");
  });
});
