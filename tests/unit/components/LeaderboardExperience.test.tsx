// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeaderboardExperience from "@/components/LeaderboardExperience";
import type {
  PublicLeaderboardData,
  PublicLeaderboardSeason,
  PublicLeaderboardStanding,
} from "@/lib/leaderboard/public";

vi.mock("@/components/ScrollReveal", () => ({
  default: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

afterEach(() => {
  cleanup();
});

const featuredSeason: PublicLeaderboardSeason = {
  id: "season-featured",
  name: "2026 Main / Pro Season 3",
  year: 2026,
  seasonNumber: 3,
  startDate: "2020-01-01",
  endDate: "2020-12-31",
  isActive: true,
  validMainEventCount: 3,
  isFinalized: false,
  isUnderReview: false,
};

function standing(
  overrides: Partial<PublicLeaderboardStanding> = {}
): PublicLeaderboardStanding {
  return {
    scope: "season",
    seasonId: featuredSeason.id,
    playerId: "11111111-1111-4111-8111-111111111111",
    displayName: "Alpha",
    playerName: "Alpha",
    country: "Australia",
    region: "Oceania",
    currentElo: 1_500,
    hasAvatar: true,
    avatarUrl:
      "/players/11111111-1111-4111-8111-111111111111/avatar",
    bracketType: "main",
    totalPoints: 100,
    tournamentsPlayed: 3,
    roundsPassed: 8,
    tournamentWins: 1,
    matchesPlayed: 10,
    matchesWon: 7,
    matchesLost: 3,
    winRate: 70,
    lastTournamentId: null,
    lastTournamentTitle: null,
    lastTournamentPoints: 0,
    rank: 1,
    previousRank: 1,
    rankMovement: 0,
    displayOrder: 1,
    ...overrides,
  };
}

function leaderboardData(
  overrides: Partial<PublicLeaderboardData> = {}
): PublicLeaderboardData {
  return {
    currentSeason: featuredSeason,
    seasonStandings: [standing()],
    allTimeStandings: [],
    seasonChampions: [],
    errors: [],
    ...overrides,
  };
}

describe("LeaderboardExperience", () => {
  it("uses factual valid-event progress and presents every safe Main season state", () => {
    const view = render(<LeaderboardExperience data={leaderboardData()} />);

    expect(screen.getByText("3 / 6")).toBeInTheDocument();
    expect(screen.getByText("Season in progress.")).toBeInTheDocument();
    expect(screen.getByText(/1 Jan 2020 - 31 Dec 2020/)).toBeInTheDocument();
    expect(screen.queryByText("Season Progress")).not.toBeInTheDocument();
    expect(screen.queryByText("2 / Year")).not.toBeInTheDocument();

    view.rerender(
      <LeaderboardExperience
        data={leaderboardData({
          currentSeason: {
            ...featuredSeason,
            validMainEventCount: 6,
          },
        })}
      />
    );
    expect(screen.getByText("6 / 6")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Finalization pending/).length
    ).toBeGreaterThan(0);

    view.rerender(
      <LeaderboardExperience
        data={leaderboardData({
          currentSeason: {
            ...featuredSeason,
            isActive: false,
            validMainEventCount: 6,
            isFinalized: true,
          },
        })}
      />
    );
    expect(screen.getAllByText(/Finalized/).length).toBeGreaterThan(0);
    expect(screen.getByText(/standings are frozen/)).toBeInTheDocument();

    view.rerender(
      <LeaderboardExperience
        data={leaderboardData({
          currentSeason: {
            ...featuredSeason,
            isActive: false,
            validMainEventCount: 6,
            isFinalized: true,
            isUnderReview: true,
          },
        })}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Season results are under review"
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("reason");
    expect(screen.getByRole("status")).not.toHaveTextContent("administrator");

    view.rerender(
      <LeaderboardExperience
        data={leaderboardData({ currentSeason: null, seasonStandings: [] })}
      />
    );
    expect(screen.getAllByText(/Season not started/).length).toBeGreaterThan(0);
    expect(screen.getByText(/No qualifying season is underway/)).toBeInTheDocument();
  });

  it("uses Main official ranks for prize positions and preserves true ties", () => {
    const oneOneThree = [
      standing({ playerName: "First Alpha", displayName: "First Alpha" }),
      standing({
        playerId: "22222222-2222-4222-8222-222222222222",
        playerName: "First Bravo",
        displayName: "First Bravo",
        rank: 1,
        displayOrder: 2,
      }),
      standing({
        playerId: "33333333-3333-4333-8333-333333333333",
        playerName: "Third Charlie",
        displayName: "Third Charlie",
        rank: 3,
        displayOrder: 3,
      }),
      standing({
        playerId: "44444444-4444-4444-8444-444444444444",
        playerName: "Fourth Delta",
        displayName: "Fourth Delta",
        rank: 4,
        displayOrder: 4,
      }),
      standing({
        playerId: "55555555-5555-4555-8555-555555555555",
        playerName: "Overall Wrong Source",
        displayName: "Overall Wrong Source",
        bracketType: "overall",
        rank: 1,
        displayOrder: 5,
      }),
    ];
    const view = render(
      <LeaderboardExperience
        data={leaderboardData({
          seasonStandings: oneOneThree,
          seasonChampions: [
            {
              id: "champion-1",
              seasonName: "2026 Main / Pro Season 2",
              bracketType: "main",
              playerId: null,
              playerName: "Former Competitor",
              country: null,
              hasAvatar: false,
              avatarUrl: null,
              finalRank: 1,
              finalPoints: 120,
            },
          ],
        })}
      />
    );
    let prizePositions = screen.getByRole("region", {
      name: "Main / Pro prize positions",
    });

    expect(within(prizePositions).getByText("First Alpha")).toBeInTheDocument();
    expect(within(prizePositions).getByText("First Bravo")).toBeInTheDocument();
    expect(within(prizePositions).getByText("Third Charlie")).toBeInTheDocument();
    expect(within(prizePositions).queryByText("Fourth Delta")).not.toBeInTheDocument();
    expect(
      within(prizePositions).queryByText("Overall Wrong Source")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Latest Finalized Results")).toBeInTheDocument();

    view.rerender(
      <LeaderboardExperience
        data={leaderboardData({
          seasonStandings: [
            standing({ playerName: "Rank One", displayName: "Rank One" }),
            standing({
              playerId: "66666666-6666-4666-8666-666666666666",
              playerName: "Rank Two Alpha",
              displayName: "Rank Two Alpha",
              rank: 2,
              displayOrder: 2,
            }),
            standing({
              playerId: "77777777-7777-4777-8777-777777777777",
              playerName: "Rank Two Bravo",
              displayName: "Rank Two Bravo",
              rank: 2,
              displayOrder: 3,
            }),
            standing({
              playerId: "88888888-8888-4888-8888-888888888888",
              playerName: "Rank Four",
              displayName: "Rank Four",
              rank: 4,
              displayOrder: 4,
            }),
          ],
        })}
      />
    );
    prizePositions = screen.getByRole("region", {
      name: "Main / Pro prize positions",
    });
    expect(within(prizePositions).getByText("Rank One")).toBeInTheDocument();
    expect(within(prizePositions).getByText("Rank Two Alpha")).toBeInTheDocument();
    expect(within(prizePositions).getByText("Rank Two Bravo")).toBeInTheDocument();
    expect(within(prizePositions).queryByText("Rank Four")).not.toBeInTheDocument();
  });

  it("keeps Career divisions separate and renders opted-out and closed identities safely", () => {
    const academyRows = [
      standing({
        scope: "all_time",
        seasonId: null,
        bracketType: "academy",
        playerName: "Opted In",
        displayName: "Opted In",
        rank: 1,
      }),
      standing({
        scope: "all_time",
        seasonId: null,
        bracketType: "academy",
        playerId: null,
        playerName: "Opted Out Commander",
        displayName: "Opted Out Commander",
        country: null,
        region: null,
        currentElo: null,
        hasAvatar: false,
        avatarUrl: null,
        rank: 2,
        displayOrder: 2,
      }),
      standing({
        scope: "all_time",
        seasonId: null,
        bracketType: "academy",
        playerId: null,
        playerName: "Former Competitor",
        displayName: "Former Competitor",
        country: null,
        region: null,
        currentElo: null,
        hasAvatar: false,
        avatarUrl: null,
        rank: 3,
        displayOrder: 3,
      }),
      standing({
        scope: "all_time",
        seasonId: null,
        bracketType: "academy",
        playerId: null,
        playerName: "Former Competitor",
        displayName: "Former Competitor",
        country: null,
        region: null,
        currentElo: null,
        hasAvatar: false,
        avatarUrl: null,
        rank: 4,
        displayOrder: 4,
      }),
    ];
    const challengeRow = standing({
      scope: "all_time",
      seasonId: null,
      bracketType: "challenge",
      playerName: "Challenge Competitor",
      displayName: "Challenge Competitor",
      rank: 1,
      displayOrder: 1,
    });
    render(
      <LeaderboardExperience
        data={leaderboardData({
          allTimeStandings: [...academyRows, challengeRow],
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Academy Career" }));

    expect(screen.getByText("Academy is a permanent Career standing.")).toBeInTheDocument();
    expect(
      screen.getByText(/New Career entrants may receive \+5 points per prior eligible event/)
    ).toHaveTextContent("awarded once per division, up to +25");
    expect(screen.queryByText("Valid qualifying events")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Main / Pro prize positions" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Latest Finalized Results")).not.toBeInTheDocument();

    let table = screen.getByRole("table");
    expect(
      within(table).getByRole("link", { name: /Opted In/ })
    ).toHaveAttribute(
      "href",
      "/players/11111111-1111-4111-8111-111111111111"
    );
    expect(
      within(table).queryByRole("link", { name: /Opted Out Commander/ })
    ).not.toBeInTheDocument();
    expect(within(table).getByText("Opted Out Commander")).toBeInTheDocument();
    expect(within(table).getAllByText("Former Competitor")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Challenge Career" }));
    table = screen.getByRole("table");
    expect(within(table).getByText("Challenge Competitor")).toBeInTheDocument();
    expect(within(table).queryByText("Opted In")).not.toBeInTheDocument();
  });
});
