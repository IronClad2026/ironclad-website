// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import PublicPlayerProfileHeader from "@/components/PublicPlayerProfileHeader";
import DiscordContactButton from "@/components/DiscordContactButton";
import FeaturedBadgeButton from "@/components/showcase/FeaturedBadgeButton";
import PlayerShowcaseEditor from "@/components/showcase/PlayerShowcaseEditor";
import account from "@/lib/i18n/dictionaries/en/account-dashboard";
import italianAccount from "@/lib/i18n/dictionaries/it/account-dashboard";
import italianBadges from "@/lib/i18n/dictionaries/it/badges";
import type { ActionResult, ShowcaseEditorState } from "@/lib/player-showcase/types";
import type { PublicPlayerProfile } from "@/lib/public-players";

vi.mock("next/image", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  return { default: (props: ImgHTMLAttributes<HTMLImageElement>) => react.createElement("img", props) };
});
vi.mock("@/components/ScrollReveal", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const state: ShowcaseEditorState = {
  playerId: "fixture-player",
  currentThought: "Ready for the next match.",
  featuredBadgeAwardId: null,
  thoughtHidden: false,
  revision: 4,
  publicProfileEnabled: true,
  awards: [
    { awardId: "earned-1", slug: "first-victory", unlockedAt: "2026-08-01T00:00:00Z" },
    { awardId: "earned-2", slug: "elite-champion", unlockedAt: null },
  ],
};
const player: PublicPlayerProfile = {
  id: "public-player",
  displayName: "Steel Vanguard",
  playerName: "Steel Vanguard",
  country: "AU",
  region: "Oceania",
  currentElo: 1400,
  publicProfileEnabled: true,
  discordPublicEnabled: false,
  discordUsername: null,
  hasAvatar: false,
  avatarUrl: null,
  createdAt: "2026-08-01T00:00:00Z",
};

function actions() {
  return {
    saveThought: vi.fn<(input: { currentThought: string | null; revision: number }) => Promise<ActionResult>>().mockResolvedValue({ status: "success", code: "thoughtSaved", revision: 5 }),
    saveBadge: vi.fn<(input: { awardId: string | null; revision: number }) => Promise<ActionResult>>().mockResolvedValue({ status: "success", code: "badgeSaved", revision: 5 }),
  };
}

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

describe("Player Showcase editor", () => {
  it("saves a badge without overwriting unsaved thought and uses the returned revision", async () => {
    const props = actions();
    render(<PlayerShowcaseEditor initialState={state} {...props} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved new thought 😎" } });
    fireEvent.click(screen.getByRole("button", { name: account.showcase.chooseBadge }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button", { name: /^Showcase / })).toHaveLength(2);
    expect(within(dialog).queryByText("IronClad Recruit")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Showcase First Victory" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(props.saveBadge).toHaveBeenCalledExactlyOnceWith({ awardId: "earned-1", revision: 4 });
    expect(screen.getByRole("textbox")).toHaveValue("Unsaved new thought 😎");
    fireEvent.click(screen.getByRole("button", { name: account.showcase.saveThought }));
    await waitFor(() => expect(props.saveThought).toHaveBeenCalledExactlyOnceWith({ currentThought: "Unsaved new thought 😎", revision: 5 }));
  });

  it("keeps badge errors inside the picker and permits a retry", async () => {
    const props = actions();
    props.saveBadge.mockResolvedValueOnce({ status: "error", code: "awardNotOwned" });
    render(<PlayerShowcaseEditor initialState={state} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: account.showcase.chooseBadge }));
    fireEvent.click(screen.getByRole("button", { name: "Showcase First Victory" }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent(account.showcase.awardNotOwned));
    fireEvent.click(screen.getByRole("button", { name: "Showcase Elite Champion" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(props.saveBadge).toHaveBeenLastCalledWith({ awardId: "earned-2", revision: 4 });
  });

  it("counts normalized emoji code points and blocks overlong text before calling an action", async () => {
    const props = actions();
    render(<PlayerShowcaseEditor initialState={state} {...props} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "😎".repeat(160) } });
    expect(screen.getByText("160 / 160")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: account.showcase.saveThought })).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "😎".repeat(161) } });
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: account.showcase.saveThought })).toBeDisabled();
    expect(props.saveThought).not.toHaveBeenCalled();
  });

  it("preserves input after a failed thought save and allows cancellation", async () => {
    const props = actions();
    props.saveThought.mockRejectedValueOnce(new Error("Offline"));
    render(<PlayerShowcaseEditor initialState={state} {...props} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: account.showcase.saveThought }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(account.showcase.saveFailed));
    expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
    fireEvent.click(screen.getByRole("button", { name: account.showcase.cancel }));
    expect(screen.getByRole("textbox")).toHaveValue(state.currentThought);
  });

  it("removes thought explicitly and blocks concurrent saves", async () => {
    const props = actions();
    let finish!: (value: ActionResult) => void;
    props.saveThought.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<PlayerShowcaseEditor initialState={state} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: account.showcase.removeThought }));
    expect(props.saveThought).toHaveBeenCalledExactlyOnceWith({ currentThought: null, revision: 4 });
    expect(screen.getByRole("button", { name: account.showcase.chooseBadge })).toBeDisabled();
    finish({ status: "success", code: "thoughtSaved", currentThought: null, revision: 5 });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
    expect(screen.queryByRole("button", { name: account.showcase.removeThought })).not.toBeInTheDocument();
  });

  it("requires explicit conflict review and preserves the draft before a new revision is saved", async () => {
    const props = actions();
    props.saveThought.mockResolvedValueOnce({
      status: "error", code: "conflict", revision: 9,
      currentThought: "Saved in another session", featuredBadgeAwardId: "earned-2", thoughtHidden: true,
    });
    render(<PlayerShowcaseEditor initialState={state} {...props} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "My unsaved draft" } });
    fireEvent.click(screen.getByRole("button", { name: account.showcase.saveThought }));
    const review = await screen.findByRole("button", { name: account.showcase.reviewLatest });
    expect(props.saveThought).toHaveBeenCalledTimes(1);
    fireEvent.click(review);
    expect(screen.getByRole("textbox")).toHaveValue("My unsaved draft");
    expect(screen.getByText("Saved in another session")).toBeInTheDocument();
    expect(screen.getByText(account.showcase.thoughtHidden)).toBeInTheDocument();
    expect(screen.getByText("Elite Champion")).toBeInTheDocument();
    expect(props.saveThought).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: account.showcase.saveThought }));
    await waitFor(() => expect(props.saveThought).toHaveBeenLastCalledWith({ currentThought: "My unsaved draft", revision: 9 }));
  });
  it("allows removing an unavailable featured badge when no canonical awards remain", async () => {
    const props = actions();
    render(<PlayerShowcaseEditor initialState={{ ...state, featuredBadgeAwardId: "removed-award", awards: [] }} {...props} />);
    expect(screen.getByText(account.showcase.removedBadge)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: account.showcase.removeBadge }));
    await waitFor(() => expect(props.saveBadge).toHaveBeenCalledExactlyOnceWith({ awardId: null, revision: 4 }));
    await waitFor(() => expect(screen.getByText(account.showcase.noFeaturedBadge)).toBeInTheDocument());
    expect(screen.queryByText(account.showcase.removedBadge)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: account.showcase.removeBadge })).not.toBeInTheDocument();
  });
  it("keeps private profiles private and handles an empty earned collection", () => {
    const props = actions();
    render(<PlayerShowcaseEditor initialState={{ ...state, awards: [], publicProfileEnabled: false, thoughtHidden: true }} {...props} />);
    expect(screen.getByText(account.showcase.privateProfile)).toBeInTheDocument();
    expect(screen.getByText(account.showcase.thoughtHidden)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: account.showcase.viewPublicProfile })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: account.showcase.manageVisibility })).toHaveAttribute("href", "/dashboard#dashboard-visibility-title");
    expect(screen.queryByRole("button", { name: account.showcase.chooseBadge })).not.toBeInTheDocument();
  });
});

describe("Public Showcase presentation", () => {
  it("shows thought as literal text without links, HTML, media or fake placeholders", () => {
    const thought = '<img src=x onerror="alert(1)"> https://example.com';
    const { container } = render(<PublicPlayerProfileHeader player={player} showcase={{ currentThought: thought, featuredBadge: null }} />);
    expect(screen.getByText(thought)).toBeInTheDocument();
    expect(container.querySelector("[data-current-thought] a")).toHaveAttribute("href", "https://discord.gg/ZQSQjBNRm3");
    expect(container.querySelector("[data-current-thought] p[dir=auto] a")).toBeNull();
    expect(container.querySelector("[data-current-thought] img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByText(/Combat Highlights/)).not.toBeInTheDocument();
  });

  it("preserves the legacy header when disabled and omits empty public thought/badge", () => {
    const { container, rerender } = render(<PublicPlayerProfileHeader player={player} />);
    expect(container.querySelector("[data-player-showcase]")).toBeNull();
    rerender(<PublicPlayerProfileHeader player={player} showcase={{ currentThought: null, featuredBadge: null }} />);
    expect(container.querySelector("[data-player-showcase]")).not.toBeNull();
    expect(container.querySelector("[data-current-thought]")).toBeNull();
    expect(container.querySelector("[data-featured-achievement]")).toBeNull();
    expect(screen.queryByText(account.showcase.noFeaturedBadge)).not.toBeInTheDocument();
  });

  it("uses canonical localized badge detail without reveal or private award controls", async () => {
    render(
      <LocaleProvider locale="it" dictionaries={{ "account-dashboard": italianAccount, badges: italianBadges }}>
        <FeaturedBadgeButton badge={{ slug: "first-victory", unlockedAt: "2026-08-01T00:00:00Z" }} badgeDictionary={italianBadges} />
      </LocaleProvider>
    );
    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(italianBadges.definitions["first-victory"].name);
    expect(within(dialog).getByText(italianBadges.definitions["first-victory"].unlockMeaning)).toBeInTheDocument();
    expect(within(dialog).queryByText(italianBadges.reveal.continue)).not.toBeInTheDocument();
    expect(dialog.innerHTML).not.toContain("awardId");
    fireEvent.click(within(dialog).getByRole("button", { name: italianBadges.detail.close }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps the legacy Discord card and hides only the new compact unavailable action", () => {
    const { rerender } = render(<DiscordContactButton discordPublicEnabled={false} discordUsername={null} />);
    expect(screen.getByText(/Discord contact not available/i)).toBeInTheDocument();
    rerender(<DiscordContactButton presentation="compact" discordPublicEnabled={false} discordUsername={null} />);
    expect(screen.queryByText(/Discord contact not available/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});