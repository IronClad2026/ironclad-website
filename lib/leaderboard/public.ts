import "server-only";

import { supabase } from "@/lib/supabase";

export type LeaderboardBracketType =
  | "overall"
  | "academy"
  | "challenge"
  | "main";
export type LeaderboardScope = "season" | "all_time";

export type PublicLeaderboardSeason = {
  id: string;
  name: string;
  year: number;
  seasonNumber: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  validMainEventCount: number;
  isFinalized: boolean;
  isUnderReview: boolean;
};

export type PublicLeaderboardStanding = {
  scope: LeaderboardScope;
  seasonId: string | null;
  playerId: string | null;
  displayName: string;
  playerName: string;
  country: string | null;
  region: string | null;
  currentElo: number | null;
  hasAvatar: boolean;
  avatarUrl: string | null;
  bracketType: LeaderboardBracketType;
  totalPoints: number;
  tournamentsPlayed: number;
  roundsPassed: number;
  tournamentWins: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
  lastTournamentId: string | null;
  lastTournamentTitle: string | null;
  lastTournamentPoints: number;
  rank: number | null;
  previousRank: number | null;
  rankMovement: number | null;
  displayOrder: number;
};

export type PublicSeasonChampion = {
  id: string;
  seasonName: string;
  bracketType: LeaderboardBracketType;
  playerId: string | null;
  playerName: string;
  country: string | null;
  hasAvatar: boolean;
  avatarUrl: string | null;
  finalRank: number;
  finalPoints: number;
};

export type PublicLeaderboardData = {
  currentSeason: PublicLeaderboardSeason | null;
  seasonStandings: PublicLeaderboardStanding[];
  allTimeStandings: PublicLeaderboardStanding[];
  seasonChampions: PublicSeasonChampion[];
  errors: string[];
};

type SeasonRow = {
  id: string;
  name: string;
  year: number;
  season_number: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  valid_main_event_count: number;
  is_finalized: boolean;
  is_under_review: boolean;
};

type SeasonStandingRow = {
  season_id: string;
  player_id: string | null;
  display_name: string;
  in_game_name: string;
  country: string | null;
  region: string | null;
  current_elo: number | null;
  has_avatar: boolean;
  bracket_type: LeaderboardBracketType;
  total_points: number;
  tournaments_played: number;
  rounds_passed: number;
  tournament_wins: number;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  win_rate: number;
  last_tournament_id: string | null;
  last_tournament_title: string | null;
  last_tournament_points: number;
  current_rank: number | null;
  previous_rank: number | null;
  rank_movement: number | null;
  display_order: number;
};

type AllTimeStandingRow = {
  player_id: string | null;
  display_name: string;
  in_game_name: string;
  country: string | null;
  region: string | null;
  current_elo: number | null;
  has_avatar: boolean;
  bracket_type: LeaderboardBracketType;
  total_points: number;
  tournaments_played: number;
  rounds_passed: number;
  tournament_wins: number;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  win_rate: number;
  display_order: number;
};

type ChampionRow = {
  id: string;
  season_id: string;
  season_name: string;
  player_id: string | null;
  player_name: string;
  country: string | null;
  has_avatar: boolean;
  bracket_type: LeaderboardBracketType;
  final_rank: number;
  final_points: number;
};

export async function getPublicLeaderboardData(): Promise<PublicLeaderboardData> {
  const errors: string[] = [];
  const currentSeason = await loadCurrentSeason(errors);
  const [seasonStandings, allTimeStandings, seasonChampions] =
    await Promise.all([
      currentSeason ? loadSeasonStandings(currentSeason.id, errors) : [],
      loadAllTimeStandings(errors),
      loadSeasonChampions(errors),
    ]);

  return {
    currentSeason,
    seasonStandings,
    allTimeStandings,
    seasonChampions,
    errors,
  };
}

async function loadCurrentSeason(errors: string[]) {
  const { data, error } = await supabase
    .from("leaderboard_current_season")
    .select(
      "id, name, year, season_number, start_date, end_date, is_active, valid_main_event_count, is_finalized, is_under_review"
    )
    .maybeSingle();

  if (error) {
    console.error("Public leaderboard current season load failed:", error);
    errors.push("Current season could not be loaded.");
    return null;
  }

  return data ? mapSeason(data as SeasonRow) : null;
}

async function loadSeasonStandings(seasonId: string, errors: string[]) {
  const { data, error } = await supabase
    .from("leaderboard_public_season_standings")
    .select(
      [
        "season_id",
        "player_id",
        "display_name",
        "in_game_name",
        "country",
        "region",
        "current_elo",
        "has_avatar",
        "bracket_type",
        "total_points",
        "tournaments_played",
        "rounds_passed",
        "tournament_wins",
        "matches_played",
        "matches_won",
        "matches_lost",
        "win_rate",
        "last_tournament_id",
        "last_tournament_title",
        "last_tournament_points",
        "current_rank",
        "previous_rank",
        "rank_movement",
        "display_order",
      ].join(", ")
    )
    .eq("season_id", seasonId)
    .order("bracket_type", { ascending: true })
    .order("current_rank", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Public leaderboard season standings load failed:", error);
    errors.push("Current season standings could not be loaded.");
    return [];
  }

  return ((data ?? []) as unknown as SeasonStandingRow[])
    .map(mapSeasonStanding)
    .sort(compareStandings);
}

async function loadAllTimeStandings(errors: string[]) {
  const { data, error } = await supabase
    .from("leaderboard_public_all_time_standings")
    .select(
      [
        "player_id",
        "display_name",
        "in_game_name",
        "country",
        "region",
        "current_elo",
        "has_avatar",
        "bracket_type",
        "total_points",
        "tournaments_played",
        "rounds_passed",
        "tournament_wins",
        "matches_played",
        "matches_won",
        "matches_lost",
        "win_rate",
        "display_order",
      ].join(", ")
    )
    .order("bracket_type", { ascending: true })
    .order("total_points", { ascending: false })
    .order("tournament_wins", { ascending: false })
    .order("rounds_passed", { ascending: false })
    .order("win_rate", { ascending: false })
    .order("matches_won", { ascending: false });

  if (error) {
    console.error("Public leaderboard all-time standings load failed:", error);
    errors.push("All-time standings could not be loaded.");
    return [];
  }

  return assignCareerDisplayRanks(
    ((data ?? []) as unknown as AllTimeStandingRow[]).map(mapAllTimeStanding)
  );
}

async function loadSeasonChampions(errors: string[]) {
  const { data: championRows, error: championError } = await supabase
    .from("leaderboard_public_season_champions")
    .select(
      "id, season_id, season_name, player_id, player_name, country, has_avatar, bracket_type, final_rank, final_points"
    )
    .eq("bracket_type", "main")
    .order("created_at", { ascending: false })
    .limit(24);

  if (championError) {
    console.error("Public leaderboard champions load failed:", championError);
    errors.push("Season champions could not be loaded.");
    return [];
  }

  return ((championRows ?? []) as ChampionRow[]).map((champion) => ({
    id: champion.id,
    seasonName: champion.season_name,
    bracketType: champion.bracket_type,
    playerId: champion.player_id,
    playerName: champion.player_name,
    country: champion.country,
    hasAvatar: champion.has_avatar,
    avatarUrl: getPublicAvatarUrl(champion.player_id, champion.has_avatar),
    finalRank: champion.final_rank,
    finalPoints: champion.final_points,
  }));
}

function mapSeason(row: SeasonRow): PublicLeaderboardSeason {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    seasonNumber: row.season_number,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    validMainEventCount: row.valid_main_event_count,
    isFinalized: row.is_finalized,
    isUnderReview: row.is_under_review,
  };
}

function mapSeasonStanding(row: SeasonStandingRow): PublicLeaderboardStanding {
  return {
    scope: "season",
    seasonId: row.season_id,
    playerId: row.player_id,
    displayName: row.display_name,
    playerName: row.in_game_name || row.display_name,
    country: row.country,
    region: row.region,
    currentElo: row.current_elo,
    hasAvatar: row.has_avatar,
    avatarUrl: getPublicAvatarUrl(row.player_id, row.has_avatar),
    bracketType: row.bracket_type,
    totalPoints: row.total_points,
    tournamentsPlayed: row.tournaments_played,
    roundsPassed: row.rounds_passed,
    tournamentWins: row.tournament_wins,
    matchesPlayed: row.matches_played,
    matchesWon: row.matches_won,
    matchesLost: row.matches_lost,
    winRate: Number(row.win_rate),
    lastTournamentId: row.last_tournament_id,
    lastTournamentTitle: row.last_tournament_title,
    lastTournamentPoints: row.last_tournament_points,
    rank: row.current_rank,
    previousRank: row.previous_rank,
    rankMovement: row.rank_movement,
    displayOrder: row.display_order,
  };
}

function mapAllTimeStanding(row: AllTimeStandingRow): PublicLeaderboardStanding {
  return {
    scope: "all_time",
    seasonId: null,
    playerId: row.player_id,
    displayName: row.display_name,
    playerName: row.in_game_name || row.display_name,
    country: row.country,
    region: row.region,
    currentElo: row.current_elo,
    hasAvatar: row.has_avatar,
    avatarUrl: getPublicAvatarUrl(row.player_id, row.has_avatar),
    bracketType: row.bracket_type,
    totalPoints: row.total_points,
    tournamentsPlayed: row.tournaments_played,
    roundsPassed: row.rounds_passed,
    tournamentWins: row.tournament_wins,
    matchesPlayed: row.matches_played,
    matchesWon: row.matches_won,
    matchesLost: row.matches_lost,
    winRate: Number(row.win_rate),
    lastTournamentId: null,
    lastTournamentTitle: null,
    lastTournamentPoints: 0,
    rank: null,
    previousRank: null,
    rankMovement: null,
    displayOrder: row.display_order,
  };
}

// Career caches publish permanent factual totals but do not store a rank.
// This display-only ordering is never used for Main / Pro prize positions.
function assignCareerDisplayRanks(rows: PublicLeaderboardStanding[]) {
  const grouped = new Map<LeaderboardBracketType, PublicLeaderboardStanding[]>();

  for (const row of rows) {
    const group = grouped.get(row.bracketType) ?? [];
    group.push(row);
    grouped.set(row.bracketType, group);
  }

  for (const group of grouped.values()) {
    group
      .sort(compareStandings)
      .forEach((row, index) => {
        const previous = index > 0 ? group[index - 1] : null;

        if (row.rank === null) {
          row.rank =
            previous && haveSameCompetitiveScore(previous, row)
              ? previous.rank
              : index + 1;
        }
      });
  }

  return rows.sort(compareStandings);
}

function compareStandings(
  left: PublicLeaderboardStanding,
  right: PublicLeaderboardStanding
) {
  return (
    (left.rank ?? Number.MAX_SAFE_INTEGER) -
      (right.rank ?? Number.MAX_SAFE_INTEGER) ||
    right.totalPoints - left.totalPoints ||
    right.tournamentWins - left.tournamentWins ||
    right.roundsPassed - left.roundsPassed ||
    compareCompetitiveWinRate(left, right) ||
    right.matchesWon - left.matchesWon ||
    left.playerName.localeCompare(right.playerName) ||
    (left.playerId ?? "").localeCompare(right.playerId ?? "") ||
    left.displayOrder - right.displayOrder
  );
}

function haveSameCompetitiveScore(
  left: PublicLeaderboardStanding,
  right: PublicLeaderboardStanding
) {
  return (
    left.totalPoints === right.totalPoints &&
    left.tournamentWins === right.tournamentWins &&
    left.roundsPassed === right.roundsPassed &&
    compareCompetitiveWinRate(left, right) === 0 &&
    left.matchesWon === right.matchesWon
  );
}

function compareCompetitiveWinRate(
  left: PublicLeaderboardStanding,
  right: PublicLeaderboardStanding
) {
  const leftPlayed = left.matchesPlayed > 0 ? left.matchesPlayed : 1;
  const rightPlayed = right.matchesPlayed > 0 ? right.matchesPlayed : 1;
  const leftWon = left.matchesPlayed > 0 ? left.matchesWon : 0;
  const rightWon = right.matchesPlayed > 0 ? right.matchesWon : 0;

  return rightWon * leftPlayed - leftWon * rightPlayed;
}

function getPublicAvatarUrl(playerId: string | null, hasAvatar: boolean) {
  return playerId && hasAvatar ? `/players/${playerId}/avatar` : null;
}
