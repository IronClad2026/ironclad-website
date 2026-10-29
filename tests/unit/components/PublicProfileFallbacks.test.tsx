// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import PublicPlayerProfileHeader from "@/components/PublicPlayerProfileHeader";
import PublicPlayerStats from "@/components/PublicPlayerStats";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { loadDictionaries } from "@/lib/i18n/loaders";
import type { PublicPlayerProfile } from "@/lib/public-players";

vi.mock("@/components/ScrollReveal", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
afterEach(cleanup);

const player: PublicPlayerProfile = {
  id: "11111111-1111-4111-8111-111111111111", displayName: "Synthetic Commander", playerName: "Commander",
  country: "Australia", region: "Oceania", currentElo: 1450, publicProfileEnabled: true,
  discordPublicEnabled: false, discordUsername: "hidden-discord-fixture", hasAvatar: false, avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("focused public profile fallbacks", () => {
  it("preserves the unwrapped English profile and opt-out boundary", () => {
    render(<><PublicPlayerProfileHeader player={player} /><PublicPlayerStats player={player} activeTournamentEloSnapshots={[]} competitionHistory={{ status: "unavailable" }} /></>);
    expect(screen.getByRole("link", { name: "Back to Players" })).toHaveAttribute("href", "/players");
    expect(screen.getByRole("heading", { name: "Public Stats" })).toBeVisible();
    expect(screen.getByText("Discord contact not available.")).toBeVisible();
    expect(screen.queryByText(player.discordUsername!)).not.toBeInTheDocument();
  });

  it.each(SUPPORTED_LOCALES)("preserves the ordinary profile and private contact copy in %s", async (locale) => {
    const dictionaries = await loadDictionaries(locale, ["public", "account-dashboard"] as const);
    const copy = dictionaries.public;
    render(<LocaleProvider locale={locale} dictionaries={dictionaries}><PublicPlayerProfileHeader player={player} /><PublicPlayerStats player={player} activeTournamentEloSnapshots={[]} competitionHistory={{ status: "unavailable" }} /></LocaleProvider>);
    expect(screen.getByRole("link", { name: copy.players.back })).toHaveAttribute("href", "/players");
    expect(screen.getByRole("heading", { name: copy.players.publicStats })).toBeVisible();
    expect(screen.getByText(copy.players.discordUnavailable)).toBeVisible();
    expect(screen.getByRole("heading", { name: copy.players.tournamentHistory })).toBeVisible();
    expect(screen.getAllByText(copy.regions.oceania).length).toBeGreaterThan(0);
    expect(screen.queryByText(player.discordUsername!)).not.toBeInTheDocument();
  });

  it.each(SUPPORTED_LOCALES)("preserves the Showcase profile and compact contact copy in %s", async (locale) => {
    const dictionaries = await loadDictionaries(locale, ["public", "account-dashboard"] as const);
    render(<LocaleProvider locale={locale} dictionaries={dictionaries}><PublicPlayerProfileHeader player={{ ...player, discordPublicEnabled: true }} showcase={{ currentThought: "Synthetic public thought", featuredBadge: null }} /></LocaleProvider>);
    expect(screen.getByRole("link", { name: dictionaries.public.players.back })).toHaveAttribute("href", "/players");
    expect(screen.getByText(dictionaries["account-dashboard"].showcase.thoughtTitle)).toBeVisible();
    expect(screen.getByText(dictionaries.public.players.currentElo)).toBeVisible();
    expect(screen.getByRole("button", { name: dictionaries.public.players.contactPlayer })).toBeVisible();
    expect(screen.getByText(dictionaries.public.regions.oceania)).toBeVisible();
    expect(screen.queryByText(player.discordUsername!)).not.toBeInTheDocument();
  });
});
