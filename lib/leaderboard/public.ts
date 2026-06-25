import "server-only";

import { supabase } from "@/lib/supabase";

export type LeaderboardBracketType = "overall" | "main" | "challenge";
export type LeaderboardScope = "season" | "all_time";

export type PublicLeaderboardSeason = {
  id: string;
  name: string;
  year: number;
  seasonNumber: 1 | 2;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type PublicLeaderboardStanding = {
  scope: LeaderboardScope;
  seasonId: string | null;
  playerId: string;
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
};

export type PublicSeasonChampion = {
  id: string;
  seasonName: string;
  bracketType: LeaderboardBracketType;
  playerId: string;
  playerName: string;
  country: string | null;
  hasAvatar: boolean;
  avatarUrl: string | null;
  finalRank: number;
  finalPoints: number;
};

export type PublicLeaderboardData = {
  currentSeason: PublicLeaderboardSeason | null;
  currentSeasonProgress: number;
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
};

type SeasonStandingRow = {
  season_id: string;
  player_id: string;
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
};

type AllTimeStandingRow = {
  player_id: string;
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
};

type ChampionRow = {
  id: string;
  season_id: string;
  player_id: string;
  bracket_type: LeaderboardBracketType;
  final_rank: number;
  final_points: number;
};

type PublicPlayerProfileRow = {
  id: string;
  display_name: string;
  player_name: string;
  country: string | null;
  has_avatar: boolean;
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
    currentSeasonProgress: currentSeason ? getSeasonProgress(currentSeason) : 0,
    seasonStandings,
    allTimeStandings,
    seasonChampions,
    errors,
  };
}

async function loadCurrentSeason(errors: string[]) {
  const { data, error } = await supabase
    .from("leaderboard_current_season")
    .select("id, name, year, season_number, start_date, end_date, is_active")
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

  return assignFallbackRanks(
    ((data ?? []) as unknown as SeasonStandingRow[]).map(mapSeasonStanding)
  );
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
      ].join(", ")
    )
    .order("bracket_type", { ascending: true })
    .order("total_points", { ascending: false })
    .order("tournament_wins", { ascending: false })
    .order("rounds_passed", { ascending: false })
    .order("win_rate", { ascending: false });

  if (error) {
    console.error("Public leaderboard all-time standings load failed:", error);
    errors.push("All-time standings could not be loaded.");
    return [];
  }

  return assignFallbackRanks(
    ((data ?? []) as unknown as AllTimeStandingRow[]).map(mapAllTimeStanding)
  );
}

async function loadSeasonChampions(errors: string[]) {
  const { data: championRows, error: championError } = await supabase
    .from("leaderboard_season_champions")
    .select("id, season_id, player_id, bracket_type, final_rank, final_points")
    .order("created_at", { ascending: false })
    .limit(24);

  if (championError) {
    console.error("Public leaderboard champions load failed:", championError);
    errors.push("Season champions could not be loaded.");
    return [];
  }

  const champions = (championRows ?? []) as ChampionRow[];
  if (champions.length === 0) {
    return [];
  }

  const [seasonNames, playerProfiles] = await Promise.all([
    loadSeasonNames(uniquePresent(champions.map((champion) => champion.season_id))),
    loadPublicPlayerProfiles(
      uniquePresent(champions.map((champion) => champion.player_id))
    ),
  ]);

  return champions
    .map((champion) => {
      const profile = playerProfiles.get(champion.player_id);
      if (!profile) return null;

      return {
        id: champion.id,
        seasonName: seasonNames.get(champion.season_id) ?? "Unknown Season",
        bracketType: champion.bracket_type,
        playerId: champion.player_id,
        playerName: profile.player_name || profile.display_name,
        country: profile.country,
        hasAvatar: profile.has_avatar,
        avatarUrl: getPublicAvatarUrl(champion.player_id, profile.has_avatar),
        finalRank: champion.final_rank,
        finalPoints: champion.final_points,
      };
    })
    .filter((champion): champion is PublicSeasonChampion => champion !== null);
}

async function loadSeasonNames(seasonIds: string[]) {
  const names = new Map<string, string>();

  if (seasonIds.length === 0) {
    return names;
  }

  const { data, error } = await supabase
    .from("leaderboard_seasons")
    .select("id, name")
    .in("id", seasonIds);

  if (error) {
    console.error("Public leaderboard champion season names failed:", error);
    return names;
  }

  for (const row of (data ?? []) as { id: string; name: string }[]) {
    names.set(row.id, row.name);
  }

  return names;
}

async function loadPublicPlayerProfiles(playerIds: string[]) {
  const profiles = new Map<string, PublicPlayerProfileRow>();

  if (playerIds.length === 0) {
    return profiles;
  }

  const { data, error } = await supabase
    .from("public_player_profiles")
    .select("id, display_name, player_name, country, has_avatar")
    .in("id", playerIds);

  if (error) {
    console.error("Public leaderboard champion player profiles failed:", error);
    return profiles;
  }

  for (const row of (data ?? []) as PublicPlayerProfileRow[]) {
    profiles.set(row.id, row);
  }

  return profiles;
}

function mapSeason(row: SeasonRow): PublicLeaderboardSeason {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    seasonNumber: row.season_number === 2 ? 2 : 1,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
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
  };
}

function assignFallbackRanks(rows: PublicLeaderboardStanding[]) {
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
        row.rank = row.rank ?? index + 1;
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
    right.winRate - left.winRate ||
    left.playerName.localeCompare(right.playerName)
  );
}

function getPublicAvatarUrl(playerId: string, hasAvatar: boolean) {
  return hasAvatar ? `/players/${playerId}/avatar` : null;
}

function getSeasonProgress(season: PublicLeaderboardSeason) {
  const now = Date.now();
  const start = new Date(`${season.startDate}T00:00:00`).getTime();
  const end = new Date(`${season.endDate}T23:59:59`).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.min(Math.max(((now - start) / (end - start)) * 100, 0), 100);
}

function uniquePresent(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
