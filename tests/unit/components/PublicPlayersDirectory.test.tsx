// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import PublicPlayersDirectory from "@/components/PublicPlayersDirectory";
import { countrySelectOptions } from "@/lib/countries";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { loadDictionary } from "@/lib/i18n/loaders";
import type { PublicPlayerProfile } from "@/lib/public-players";

vi.mock("@/components/ScrollReveal", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const commander: PublicPlayerProfile = {
  id: "11111111-1111-4111-8111-111111111111", displayName: "Commander Alpha", playerName: "Alpha",
  country: "Australia", region: "Oceania", currentElo: 1450, publicProfileEnabled: true,
  discordPublicEnabled: false, discordUsername: null, hasAvatar: false, avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const players = [commander, { ...commander, id: "22222222-2222-4222-8222-222222222222", playerName: "Bravo", displayName: "Commander Bravo", country: "Italy", region: "Europe", currentElo: 1800 }];
afterEach(cleanup);

describe("focused Players directory fallback", () => {
  it("reuses country options while typing and refreshes them when the locale changes", async () => {
    const english = await loadDictionary("en", "public");
    const italian = await loadDictionary("it", "public");
    const names = vi.spyOn(Intl, "DisplayNames");
    const { rerender } = render(<LocaleProvider locale="en" dictionaries={{ public: english }}><PublicPlayersDirectory players={[]} /></LocaleProvider>);
    const countryCount = countrySelectOptions.length;
    expect(names).toHaveBeenCalledTimes(countryCount);
    const search = screen.getByRole("searchbox", { name: english.players.search });
    for (const value of ["a", "al", "alpha"]) fireEvent.change(search, { target: { value } });
    expect(names).toHaveBeenCalledTimes(countryCount);
    rerender(<LocaleProvider locale="en" dictionaries={{ public: english }}><PublicPlayersDirectory players={[commander]} /></LocaleProvider>);
    expect(search).toHaveValue("alpha");
    expect(screen.getByText("Alpha")).toBeVisible();
    expect(names).toHaveBeenCalledTimes(countryCount + 1);
    const beforeLocaleChange = names.mock.calls.length;
    rerender(<LocaleProvider locale="it" dictionaries={{ public: italian }}><PublicPlayersDirectory players={[commander]} /></LocaleProvider>);
    expect(names.mock.calls.length - beforeLocaleChange).toBe(countryCount + 1);
    expect(screen.getByRole("searchbox", { name: italian.players.search })).toHaveValue("alpha");
  });

  it("preserves fallback filters and refreshes visible data without losing the active search", () => {
    const { rerender } = render(<PublicPlayersDirectory players={players} />);
    const search = screen.getByRole("searchbox", { name: "Search Player" });
    fireEvent.change(search, { target: { value: " bravo " } });
    expect(screen.getByText("Bravo")).toBeVisible();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    rerender(<PublicPlayersDirectory players={[{ ...players[1], currentElo: 1850 }]} />);
    expect(search).toHaveValue(" bravo ");
    expect(screen.getByText("1,850")).toBeVisible();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.focus(screen.getByRole("combobox", { name: "ELO" }));
    fireEvent.click(screen.getByRole("option", { name: "1300-1500" }));
    expect(screen.getByText("No public players match those filters.")).toBeVisible();
    fireEvent.focus(screen.getByRole("combobox", { name: "ELO" }));
    fireEvent.click(screen.getByRole("option", { name: /^All ELO ratings$/ }));
    expect(screen.getByText("Bravo")).toBeVisible();
  });

  it.each(SUPPORTED_LOCALES)("keeps %s localized copy instead of the English fallback", async (locale) => {
    const dictionary = await loadDictionary(locale, "public");
    render(<LocaleProvider locale={locale} dictionaries={{ public: dictionary }}><PublicPlayersDirectory players={players} /></LocaleProvider>);
    const search = screen.getByRole("searchbox", { name: dictionary.players.search });
    expect(search).toHaveAttribute("placeholder", dictionary.players.searchPlaceholder);
    fireEvent.change(search, { target: { value: "unmatched" } });
    expect(screen.getByText(dictionary.players.noMatches)).toBeVisible();
    expect(screen.getByText(dictionary.players.emptyHelp)).toBeVisible();
  });
});
