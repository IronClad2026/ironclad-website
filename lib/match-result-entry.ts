import type { GeneratedTournamentMatch } from "@/lib/tournaments";

export type MatchOutcome = "won" | "lost";
export type CanonicalMatchResult = {
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
};
type MatchIdentity = Pick<
  GeneratedTournamentMatch,
  "seriesBestOf" | "playerOneRegistrationId" | "playerTwoRegistrationId"
>;

export function getPerspectiveScores(
  bestOf: number,
  outcome: MatchOutcome | null
) {
  if (!outcome || ![1, 3, 5].includes(bestOf)) return [];
  const wins = Math.floor(bestOf / 2) + 1;
  return Array.from({ length: wins }, (_, losses) => {
    const viewerScore = outcome === "won" ? wins : losses;
    const opponentScore = outcome === "won" ? losses : wins;
    return {
      value: `${viewerScore}-${opponentScore}`,
      viewerScore,
      opponentScore,
    };
  });
}

export function mapPerspectiveResult(
  match: MatchIdentity,
  viewerRegistrationId: string | null,
  outcome: MatchOutcome | null,
  score: string
): CanonicalMatchResult | null {
  const one = match.playerOneRegistrationId;
  const two = match.playerTwoRegistrationId;
  if (
    !one ||
    !two ||
    one === two ||
    !viewerRegistrationId ||
    ![one, two].includes(viewerRegistrationId)
  )
    return null;
  const option = getPerspectiveScores(match.seriesBestOf, outcome).find(
    (candidate) => candidate.value === score
  );
  if (!option) return null;
  const viewerIsOne = viewerRegistrationId === one;
  return {
    playerOneScore: viewerIsOne ? option.viewerScore : option.opponentScore,
    playerTwoScore: viewerIsOne ? option.opponentScore : option.viewerScore,
    winnerRegistrationId:
      outcome === "won" ? viewerRegistrationId : viewerIsOne ? two : one,
  };
}

// Enumerating at most 2^5 sequences keeps inference exhaustive and auditable.
// Only explicit selections are stored; inferred winners are always recomputed.
export function getGameWinnerState(
  match: MatchIdentity,
  result: CanonicalMatchResult,
  selected: readonly string[]
) {
  const one = match.playerOneRegistrationId;
  const two = match.playerTwoRegistrationId;
  const count = result.playerOneScore + result.playerTwoScore;
  const wins = Math.floor(match.seriesBestOf / 2) + 1;
  const sequences: string[][] = [];
  if (
    one &&
    two &&
    count >= 1 &&
    count <= 5 &&
    [1, 3, 5].includes(match.seriesBestOf)
  ) {
    const visit = (sequence: string[], oneWins: number, twoWins: number) => {
      if (sequence.length === count) {
        if (
          oneWins === result.playerOneScore &&
          twoWins === result.playerTwoScore &&
          Math.max(oneWins, twoWins) === wins &&
          Math.min(oneWins, twoWins) < wins &&
          sequence.at(-1) === result.winnerRegistrationId
        )
          sequences.push(sequence);
        return;
      }
      if (oneWins >= wins || twoWins >= wins) return;
      if (oneWins < result.playerOneScore)
        visit([...sequence, one], oneWins + 1, twoWins);
      if (twoWins < result.playerTwoScore)
        visit([...sequence, two], oneWins, twoWins + 1);
    };
    visit([], 0, 0);
  }
  const compatible = (sequence: string[], ignore = -1) =>
    selected.every(
      (value, index) => index === ignore || !value || sequence[index] === value
    );
  const candidates = sequences.filter((sequence) => compatible(sequence));
  const winners = Array.from({ length: count }, (_, index) => {
    const values = new Set(candidates.map((sequence) => sequence[index]));
    return values.size === 1 ? [...values][0] : "";
  });
  const choices = winners.map((_, index) => [
    ...new Set(
      sequences
        .filter((sequence) => compatible(sequence, index))
        .map((sequence) => sequence[index])
    ),
  ]);
  return {
    winners,
    choices,
    valid: candidates.length > 0,
    complete: candidates.length > 0 && winners.every(Boolean),
  };
}

export type MatchEntryDraft<T> = {
  outcome: MatchOutcome | null;
  score: string;
  games: { replay: T | null; winner: string }[];
};

export function changeMatchOutcome<T>(
  outcome: MatchOutcome
): MatchEntryDraft<T> {
  return { outcome, score: "", games: [] };
}

export function changeMatchScore<T>(
  draft: MatchEntryDraft<T>,
  bestOf: number,
  score: string
): MatchEntryDraft<T> {
  const option = getPerspectiveScores(bestOf, draft.outcome).find(
    (item) => item.value === score
  );
  if (!option) return { ...draft, score: "", games: [] };
  return {
    ...draft,
    score,
    games: Array.from(
      { length: option.viewerScore + option.opponentScore },
      (_, index) => ({
        replay: draft.games[index]?.replay ?? null,
        winner: "",
      })
    ),
  };
}

export function getConfirmationTiming(
  deadlineAt: string | null,
  createdAt: string | null
) {
  const deadline = deadlineAt ? Date.parse(deadlineAt) : NaN;
  const created = createdAt ? Date.parse(createdAt) : NaN;
  return {
    deadline: Number.isFinite(deadline) ? deadline : null,
    windowMinutes:
      Number.isFinite(deadline) &&
      Number.isFinite(created) &&
      deadline > created
        ? Math.round((deadline - created) / 60_000)
        : null,
  };
}
