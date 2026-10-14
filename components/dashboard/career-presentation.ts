import type { ChampionAchievement, MatchHistoryEntry } from "@/lib/player-dashboard";

export type TournamentCareerGroup = {
  key: string;
  tournamentId: string | null;
  tournamentBracketId: string | null;
  generatedBracketId: string;
  tournamentName: string;
  bracketName: string;
  bannerImageUrl: string | null;
  matches: MatchHistoryEntry[];
  wins: number;
  losses: number;
  champion: ChampionAchievement | null;
  firstPlayedAt: string;
  lastPlayedAt: string;
};

/** Organizes the loader's completed results without changing match authority. */
export function groupCareerTournaments(
  matches: readonly MatchHistoryEntry[],
  champions: readonly ChampionAchievement[]
): TournamentCareerGroup[] {
  const matchesByKey = new Map<string, MatchHistoryEntry[]>();
  for (const match of matches) {
    const key = careerKey(match);
    const group = matchesByKey.get(key);
    if (group) group.push(match);
    else matchesByKey.set(key, [match]);
  }

  const championsByKey = new Map<string, ChampionAchievement>();
  for (const champion of champions) {
    const key = careerKey(champion);
    const existing = championsByKey.get(key);
    if (!existing || timestamp(champion.wonAt) > timestamp(existing.wonAt) || (
      timestamp(champion.wonAt) === timestamp(existing.wonAt) && compareIds(champion.id, existing.id) < 0
    )) {
      championsByKey.set(key, champion);
    }
  }

  return [...matchesByKey].map(([key, entries]) => {
    const chronological = [...entries].sort(compareChronologically);
    const first = chronological[0];
    const latest = chronological[chronological.length - 1];
    const hasRoundOrder = entries.every((match) =>
      match.roundNumber !== null && Number.isFinite(match.roundNumber)
    );
    const orderedMatches = hasRoundOrder
      ? [...chronological].sort((left, right) =>
          left.roundNumber! - right.roundNumber! || compareChronologically(left, right)
        )
      : chronological;
    const wins = entries.filter((match) => match.result === "win").length;

    return {
      key,
      tournamentId: latest.tournamentId,
      tournamentBracketId: latest.tournamentBracketId,
      generatedBracketId: latest.generatedBracketId,
      tournamentName: latest.tournamentName,
      bracketName: latest.bracketName,
      bannerImageUrl: chronological.findLast((match) => match.tournamentBannerImageUrl !== null)?.tournamentBannerImageUrl ?? null,
      matches: orderedMatches,
      wins,
      losses: entries.length - wins,
      // Missing identity never earns a result through a title or partial match.
      champion: latest.tournamentId !== null && latest.tournamentBracketId !== null
        ? championsByKey.get(key) ?? null
        : null,
      firstPlayedAt: first.playedAt,
      lastPlayedAt: latest.playedAt,
    };
  }).sort((left, right) =>
    timestamp(right.lastPlayedAt) - timestamp(left.lastPlayedAt) || compareIds(left.key, right.key)
  );
}

function careerKey(identity: {
  tournamentId: string | null;
  tournamentBracketId: string | null;
  generatedBracketId: string;
}) {
  return identity.tournamentId !== null && identity.tournamentBracketId !== null
    ? JSON.stringify(["tournament", identity.tournamentId, identity.tournamentBracketId, identity.generatedBracketId])
    : JSON.stringify(["generation", identity.generatedBracketId]);
}

function compareChronologically(left: MatchHistoryEntry, right: MatchHistoryEntry) {
  return timestamp(left.playedAt) - timestamp(right.playedAt) ||
    left.matchNumber - right.matchNumber || compareIds(left.id, right.id);
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
