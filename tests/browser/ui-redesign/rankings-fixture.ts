import type { PublicLeaderboardData, PublicLeaderboardStanding } from "@/lib/leaderboard/public";

function standing(overrides: Partial<PublicLeaderboardStanding>): PublicLeaderboardStanding {
  return {
    scope: "season", seasonId: "synthetic-season-one", playerId: null,
    displayName: "Historical Competitor", playerName: "Historical Competitor",
    country: null, region: null, currentElo: null, hasAvatar: false, avatarUrl: null,
    bracketType: "main", totalPoints: 12, tournamentsPlayed: 1, roundsPassed: 2,
    tournamentWins: 0, matchesPlayed: 3, matchesWon: 2, matchesLost: 1, winRate: 200 / 3,
    lastTournamentId: "synthetic-previous-structure-event", lastTournamentTitle: "Previous Structure Event",
    lastTournamentBracketType: "main", lastTournamentPoints: 12,
    rank: 1, previousRank: null, rankMovement: null, displayOrder: 1,
    ...overrides,
  };
}

/** Synthetic public projections only; never imports or calls a database client. */
export function rankingsFixture(transition: boolean): PublicLeaderboardData {
  return {
    currentSeason: {
      id: "synthetic-season-one", name: "Pro Season 1", year: 2026, seasonNumber: 1,
      startDate: "2026-09-01", endDate: "2026-12-31", isActive: true,
      officialBracketType: "pro", validQualifyingEventCount: 1,
      isFinalized: false, isUnderReview: false, hasLegacyMainTransition: transition,
    },
    seasonStandings: [
      standing({ bracketType: "main" }),
      standing({ bracketType: "pro", lastTournamentBracketType: transition ? "main" : "pro" }),
    ],
    allTimeStandings: [
      standing({ scope: "all_time", seasonId: null, bracketType: "main", totalPoints: 12 }),
      standing({ scope: "all_time", seasonId: null, bracketType: "main_progression", playerName: "Main Career Competitor", displayName: "Main Career Competitor", totalPoints: 22 }),
    ],
    seasonChampions: [], errors: [],
  };
}
