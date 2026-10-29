// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PublicPlayerCompetitionHistory from "@/components/PublicPlayerCompetitionHistory";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import type { PublicPlayerCompetitionHistory as History } from "@/lib/public-player-competition-types";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { loadDictionaries } from "@/lib/i18n/loaders";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
function history(): Extract<History, { status: "loaded" }> {
  return {
    status: "loaded",
    entries: [{ tournamentId: "event-1", tournamentName: "THE NEW FRONT", tournamentHref: "/tournaments?tournament=the-new-front", tournamentStatus: "completed", division: "Main / Pro", divisionState: "completed", divisionCompleted: true, withdrawn: false, champion: true, placement: 1, record: { matchesPlayed: 3, wins: 2, losses: 1 } }],
    record: { matchesPlayed: 3, wins: 2, losses: 1 },
    coverage: { scope: "returned_entries", page: 1, previousPage: null, nextPage: 2, reachedLimit: false },
  };
}
afterEach(cleanup);

describe("public tournament history and series statistics", () => {
  it("shows recorded historical division, official result, tournament link and page-scoped series totals", () => {
    render(<PublicPlayerCompetitionHistory playerId={PLAYER_ID} history={history()} />);
    expect(screen.getByText("Division: Main / Pro")).toBeVisible();
    expect(screen.getByText("Division champion")).toBeVisible();
    expect(screen.getByRole("link", { name: "THE NEW FRONT" })).toHaveAttribute("href", "/tournaments?tournament=the-new-front");
    const statistics = screen.getByRole("region", { name: "Match Statistics" });
    expect(within(statistics).getByText("Totals for tournaments on this page")).toBeVisible();
    expect(within(statistics).getByText("66.7%")).toBeVisible();
    expect(within(statistics).getByText(/not individual games/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Older records" })).toHaveAttribute("href", `/players/${PLAYER_ID}?historyPage=2#competitive-history`);
    expect(statistics).not.toHaveTextContent(/career|all.time/i);
  });

  it("labels active events and withholds any final placement", () => {
    const value = history();
    Object.assign(value.entries[0], { champion: false, placement: null, divisionCompleted: false, divisionState: "in_progress", tournamentStatus: "in_progress" });
    render(<PublicPlayerCompetitionHistory playerId={PLAYER_ID} history={value} />);
    expect(screen.getByText("Event not complete")).toBeVisible();
    expect(screen.getByText("Division in progress")).toBeVisible();
    expect(screen.getByText("Final result pending")).toBeVisible();
    expect(screen.queryByText("Division champion")).not.toBeInTheDocument();
  });

  it("shows a genuine empty state and no fabricated win percentage", () => {
    const value = history(); value.entries = []; value.coverage.nextPage = null;
    value.record = { matchesPlayed: 0, wins: 0, losses: 0 };
    render(<PublicPlayerCompetitionHistory playerId={PLAYER_ID} history={value} />);
    expect(screen.getAllByText("No public tournament records yet.")).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("uses a dash for series win percentage with no played series", () => {
    const value = history(); value.record = { matchesPlayed: 0, wins: 0, losses: 0 };
    render(<PublicPlayerCompetitionHistory playerId={PLAYER_ID} history={value} />);
    expect(screen.getByText("—")).toBeVisible();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("preserves navigation when withdrawn unpublished records filter a page empty", () => {
    const value = history(); value.entries = [];
    render(<PublicPlayerCompetitionHistory playerId={PLAYER_ID} history={value} />);
    expect(screen.getAllByText("No public tournament records on this page.")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Older records" })).toBeVisible();
  });

  it("shows a load failure without reporting zero results", () => {
    render(<PublicPlayerCompetitionHistory playerId={PLAYER_ID} history={{ status: "unavailable" }} />);
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.queryByText("No public tournament records yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it.each(SUPPORTED_LOCALES)("renders translated series and history copy in %s", async (locale) => {
    const dictionaries = await loadDictionaries(locale, ["public"] as const);
    render(<LocaleProvider locale={locale} dictionaries={dictionaries}><PublicPlayerCompetitionHistory playerId={PLAYER_ID} history={history()} /></LocaleProvider>);
    const copy = dictionaries.public.players;
    expect(screen.getByRole("heading", { name: copy.tournamentHistory })).toBeVisible();
    expect(screen.getByText(copy.history.champion)).toBeVisible();
    expect(screen.getByText(copy.history.scope)).toBeVisible();
    expect(screen.getByText(copy.history.rules)).toBeVisible();
  });
});
