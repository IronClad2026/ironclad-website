// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardIdentity from "@/components/dashboard/DashboardIdentity";
import DashboardSections from "@/app/dashboard/DashboardSections";
import type { PlayerProfile } from "@/lib/player-profile";
import { readyWardrobeOpenEvent } from "@/lib/wardrobe/catalogue";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/components/ready/WardrobePilot", () => {
  return { default: ({ embedded, dashboard }: {
    embedded: boolean;
    dashboard: { mode: string; onBrowseItems: () => void };
  }) => (
    <div data-test-embedded={embedded} data-test-mode={dashboard.mode}>
      Shared wardrobe workspace
      {dashboard.mode === "overview" && <button onClick={dashboard.onBrowseItems}>Browse items</button>}
    </div>
  ) };
});

const profile: PlayerProfile = {
  id: "profile-dashboard-wardrobe",
  clerk_user_id: "dashboard-wardrobe-player",
  display_name: "Wardrobe Player",
  in_game_name: "Player Name In Game",
  discord_username: null,
  steam_username: null,
  coh3_player_card_url: null,
  country: null,
  region: null,
  timezone: null,
  current_elo: null,
  avatar_url: null,
  bio: null,
  profile_completed: false,
  created_at: "",
  updated_at: "",
};

function dashboard(wardrobeEnabled: boolean, identity: PlayerProfile | null = profile, error = false) {
  return (
    <DashboardSections
      wardrobeEnabled={wardrobeEnabled}
      profileHref={null}
      introduction={<DashboardIdentity profile={identity} error={error} locale="en" t={(key) => key} />}
      overview={<p>Competition and updates</p>}
      hub={<p>Player records</p>}
    />
  );
}

describe("the dashboard wardrobe", () => {
  const scrollToWardrobe = vi.fn();
  const scrollTo = vi.fn();
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard?view=matches&team=first&team=second");
    vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollToWardrobe });
  });

  afterEach(() => {
    cleanup();
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("with the pilot off, leaves the dashboard unchanged even with the deep link", () => {
    window.history.replaceState(null, "", "/dashboard?wardrobe=open#ready-wardrobe");
    render(dashboard(false));
    expect(document.querySelector("#ready-wardrobe")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ready Wardrobe" })).not.toBeInTheDocument();
    expect(screen.queryByText("Shared wardrobe workspace")).not.toBeInTheDocument();
  });

  it("keeps the mini preview under the identity and reuses it across wardrobe navigation", async () => {
    const view = render(dashboard(true));
    const region = screen.getByRole("region", { name: "Ready Wardrobe" });
    const identityHeading = screen.getByRole("heading", { name: profile.display_name });
    expect(identityHeading.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const workspace = await screen.findByText("Shared wardrobe workspace");
    expect(workspace).toHaveAttribute("data-test-mode", "overview");
    expect(region).not.toHaveAttribute("data-wardrobe-expanded");
    fireEvent.click(screen.getByRole("button", { name: "Browse items" }));
    expect(window.location.search).toBe("?view=matches&team=first&team=second&wardrobe=open");
    expect(window.location.hash).toBe("#ready-wardrobe");
    view.rerender(dashboard(true));
    expect(await screen.findByText("Shared wardrobe workspace")).toBe(workspace);
    expect(workspace).toHaveAttribute("data-test-embedded", "true");
    expect(region).toHaveAttribute("data-wardrobe-expanded", "true");
    await waitFor(() => expect(region).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Close wardrobe" }));
    view.rerender(dashboard(true));
    expect(screen.getByText("Shared wardrobe workspace")).toBe(workspace);
    expect(workspace).toHaveAttribute("data-test-mode", "overview");
    expect(region).not.toHaveAttribute("data-wardrobe-expanded");
    expect(window.location.search).toBe("?view=matches&team=first&team=second");
    expect(window.location.hash).toBe("");
    expect(scrollTo).toHaveBeenCalled();
  });

  it.each([false, true])("opens one workspace from an invitation without a profile (load error: %s)", async (error) => {
    const view = render(dashboard(true, null, error));
    const region = screen.getByRole("region", { name: "Ready Wardrobe" });
    expect(region).not.toHaveAttribute("data-wardrobe-expanded");
    if (!error) expect(screen.getByRole("link", { name: "dashboard.profile.complete" })).toHaveAttribute("href", "/profile");

    act(() => window.dispatchEvent(new Event(readyWardrobeOpenEvent)));
    view.rerender(dashboard(true, null, error));
    expect(await screen.findAllByText("Shared wardrobe workspace")).toHaveLength(1);
    expect(region).toHaveAttribute("data-wardrobe-expanded", "true");
    await waitFor(() => expect(region).toHaveFocus());
    expect(window.location.hash).toBe("#ready-wardrobe");
  });

  it("opens from the direct URL and refocuses the region when invited again on the same route", async () => {
    window.history.replaceState(null, "", "/dashboard?view=matches&wardrobe=open#ready-wardrobe");
    render(dashboard(true));
    const region = screen.getByRole("region", { name: "Ready Wardrobe" });
    const button = screen.getByRole("button", { name: "Close wardrobe" });
    await screen.findByText("Shared wardrobe workspace");
    await waitFor(() => expect(region).toHaveFocus());
    button.focus();

    act(() => window.dispatchEvent(new Event(readyWardrobeOpenEvent)));
    await waitFor(() => expect(region).toHaveFocus());
    expect(window.location.search).toBe("?view=matches&wardrobe=open");
  });

  it("reveals a dashboard deep link inside a collapsed Player hub detail", async () => {
    window.history.replaceState(null, "", "/dashboard#community-polls");
    render(<main data-dashboard-command-centre><DashboardSections
      introduction={<h1>Player</h1>}
      overview={<p>Competition</p>}
      hub={<details><summary>Community polls</summary><p id="community-polls">Poll actions</p></details>}
      profileHref={null}
      wardrobeEnabled={false}
    /></main>);
    expect(await screen.findByRole("link", { name: "Player hub", current: "page" })).toBeVisible();
    await waitFor(() => expect(document.getElementById("community-polls")?.closest("details")).toHaveAttribute("open"));
    expect(scrollToWardrobe).toHaveBeenCalledWith({ block: "start" });
  });
});
