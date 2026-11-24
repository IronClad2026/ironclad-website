// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardIdentity from "@/components/dashboard/DashboardIdentity";
import type { PlayerProfile } from "@/lib/player-profile";
import { readyWardrobeOpenEvent } from "@/lib/wardrobe/catalogue";

const loadWorkspace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/components/ready/WardrobePilot", () => {
  loadWorkspace();
  return { default: ({ embedded }: { embedded: boolean }) => <div data-test-embedded={embedded}>Shared wardrobe workspace</div> };
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

function identity(wardrobeEnabled: boolean) {
  return <DashboardIdentity profile={profile} error={false} locale="en" t={(key) => key} wardrobeEnabled={wardrobeEnabled} />;
}

describe("the dashboard wardrobe", () => {
  const scrollToWardrobe = vi.fn();
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard?view=matches&team=first&team=second");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollToWardrobe });
  });

  afterEach(() => {
    cleanup();
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("with the pilot off, leaves the dashboard unchanged even with the deep link", () => {
    window.history.replaceState(null, "", "/dashboard?wardrobe=open#ready-wardrobe");
    render(identity(false));
    expect(document.querySelector("#ready-wardrobe")).toBeNull();
    expect(loadWorkspace).not.toHaveBeenCalled();
  });

  it("keeps the poster under the display name and loads the workspace only after opening", async () => {
    const view = render(identity(true));
    const region = screen.getByRole("region", { name: "Ready Wardrobe" });
    const nameBlock = screen.getByRole("heading", { name: profile.display_name }).parentElement;
    expect(nameBlock?.nextElementSibling).toBe(region);
    expect(region).toHaveClass("col-span-full");
    expect(region.querySelector("img")).toHaveAttribute("src", expect.stringContaining("data:image/"));
    expect(screen.getByRole("button", { name: "Open wardrobe" })).toHaveAttribute("aria-expanded", "false");
    expect(region).not.toHaveAttribute("data-wardrobe-expanded");
    expect(loadWorkspace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open wardrobe" }));
    expect(window.location.search).toBe("?view=matches&team=first&team=second&wardrobe=open");
    expect(window.location.hash).toBe("#ready-wardrobe");
    view.rerender(identity(true));
    expect(await screen.findByText("Shared wardrobe workspace")).toHaveAttribute("data-test-embedded", "true");
    expect(region).toHaveAttribute("data-wardrobe-expanded", "true");
    expect(region).toHaveClass("col-span-full");
    await waitFor(() => expect(region).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Close wardrobe" }));
    view.rerender(identity(true));
    expect(screen.queryByText("Shared wardrobe workspace")).toBeNull();
    expect(region).not.toHaveAttribute("data-wardrobe-expanded");
    expect(window.location.search).toBe("?view=matches&team=first&team=second");
    expect(window.location.hash).toBe("");
  });

  it.each([false, true])("opens one workspace from an invitation without a profile (load error: %s)", async (error) => {
    const dashboard = () => (
      <DashboardIdentity profile={null} error={error} locale="en" t={(key) => key} wardrobeEnabled />
    );
    const view = render(dashboard());
    const region = screen.getByRole("region", { name: "Ready Wardrobe" });
    expect(screen.queryByText("Shared wardrobe workspace")).not.toBeInTheDocument();
    if (!error) expect(screen.getByRole("heading", { name: "dashboard.profile.requiredTitle" }).nextElementSibling).toBe(region);

    act(() => window.dispatchEvent(new Event(readyWardrobeOpenEvent)));
    view.rerender(dashboard());
    expect(await screen.findAllByText("Shared wardrobe workspace")).toHaveLength(1);
    expect(region).toHaveAttribute("data-wardrobe-expanded", "true");
    await waitFor(() => expect(region).toHaveFocus());
    expect(window.location.hash).toBe("#ready-wardrobe");
  });

  it("opens from the direct URL and refocuses the region when invited again on the same route", async () => {
    window.history.replaceState(null, "", "/dashboard?view=matches&wardrobe=open#ready-wardrobe");
    render(identity(true));
    const region = screen.getByRole("region", { name: "Ready Wardrobe" });
    const button = screen.getByRole("button", { name: "Close wardrobe" });
    await screen.findByText("Shared wardrobe workspace");
    await waitFor(() => expect(region).toHaveFocus());
    button.focus();

    act(() => window.dispatchEvent(new Event(readyWardrobeOpenEvent)));
    expect(region).toHaveFocus();
    expect(scrollToWardrobe).toHaveBeenCalledWith({ block: "start" });
    expect(window.location.search).toBe("?view=matches&wardrobe=open");
  });
});
