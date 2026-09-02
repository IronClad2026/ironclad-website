const MAX_REPLAY_FILENAME_LENGTH = 180;

export type ReplayDownloadFilenameContext = {
  tournamentTitle?: string | null;
  divisionName?: string | null;
  roundName?: string | null;
  matchNumber?: number | null;
  gameNumber?: number | null;
  playerOneName?: string | null;
  playerTwoName?: string | null;
  seriesReplay?: boolean;
};

export function buildReplayDownloadFilename(
  context: ReplayDownloadFilenameContext
) {
  const matchNumber = safePositiveInteger(context.matchNumber);
  const gameNumber = safePositiveInteger(context.gameNumber);
  const replayScope = context.seriesReplay
    ? "Series-Replay"
    : gameNumber
      ? `Game-${gameNumber}`
      : "Game-Replay";
  const segments = [
    "IronClad",
    sanitizeFilenameSegment(context.tournamentTitle, "Event", 44),
    sanitizeFilenameSegment(context.divisionName, "Division", 24),
    sanitizeFilenameSegment(context.roundName, "Round", 30),
    matchNumber ? `Match-${matchNumber}` : "Match",
    replayScope,
    `${sanitizeFilenameSegment(context.playerOneName, "Player-1", 28)}-vs-${sanitizeFilenameSegment(
      context.playerTwoName,
      "Player-2",
      28
    )}`,
  ];
  const maximumStemLength = MAX_REPLAY_FILENAME_LENGTH - ".rec".length;
  const stem = segments.join("_").slice(0, maximumStemLength);

  return `${stem.replace(/[-_.]+$/g, "")}.rec`;
}

export function sanitizeFilenameSegment(
  value: string | null | undefined,
  fallback: string,
  maximumLength: number
) {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maximumLength)
    .replace(/-+$/g, "");

  return normalized || fallback;
}

function safePositiveInteger(value: number | null | undefined) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 999
    ? value
    : null;
}
