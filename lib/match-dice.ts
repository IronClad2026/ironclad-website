export type MatchDiceGameNumber = 1 | 3 | 5;
export type MatchDiceParticipantSlot = "player_one" | "player_two";
export type MatchDiceViewerRole = "participant" | "admin";
export type MatchDiceGameState = "open" | "waiting" | "tied" | "complete";
export type MatchDiceReadOnlyReason =
  | "unsupported_format"
  | "division_not_launched"
  | "tournament_not_in_progress"
  | "match_not_in_progress"
  | "participants_unavailable"
  | "activation_unavailable"
  | "official_outcome"
  | "admin_hold"
  | "deadline_elapsed";

export type MatchDiceParticipant = {
  slot: MatchDiceParticipantSlot;
  label: string;
};

export type MatchDiceRoll = {
  participantSlot: MatchDiceParticipantSlot;
  participantLabel: string;
  die1: number;
  die2: number;
  total: number;
  rolledAt: string;
};

export type MatchDiceRound = {
  tieRound: number;
  rolls: MatchDiceRoll[];
};

export type MatchDiceGame = {
  gameNumber: MatchDiceGameNumber;
  currentTieRound: number;
  state: MatchDiceGameState;
  canRoll: boolean;
  winnerSlot: MatchDiceParticipantSlot | null;
  rounds: MatchDiceRound[];
};

export type MatchDiceActivation = {
  activationVersion: number;
  isCurrent: boolean;
  games: MatchDiceGame[];
};

export type MatchDiceRollOffSnapshot = {
  matchId: string;
  currentActivationVersion: number;
  seriesBestOf: 3 | 5;
  viewerRole: MatchDiceViewerRole;
  viewerSlot: MatchDiceParticipantSlot | null;
  isActionable: boolean;
  readOnlyReason: MatchDiceReadOnlyReason | null;
  participants: [MatchDiceParticipant, MatchDiceParticipant];
  activations: MatchDiceActivation[];
};

export type AuthoritativeMatchDiceRoll = {
  activationVersion: number;
  gameNumber: MatchDiceGameNumber;
  tieRound: number;
  participantSlot: MatchDiceParticipantSlot;
  die1: number;
  die2: number;
  total: number;
  rolledAt: string;
  created: boolean;
};

export type RollMatchDiceInput = {
  matchId: string;
  expectedActivationVersion: number;
  gameNumber: MatchDiceGameNumber;
  expectedTieRound: number;
};

export type MatchDiceRollActionResult =
  | {
      ok: true;
      data: {
        snapshot: MatchDiceRollOffSnapshot;
        roll: AuthoritativeMatchDiceRoll;
      };
    }
  | { ok: false; error: string };

const SNAPSHOT_KEYS = [
  "matchId",
  "currentActivationVersion",
  "seriesBestOf",
  "viewerRole",
  "viewerSlot",
  "isActionable",
  "readOnlyReason",
  "participants",
  "activations",
] as const;
const PARTICIPANT_KEYS = ["slot", "label"] as const;
const ACTIVATION_KEYS = ["activationVersion", "isCurrent", "games"] as const;
const GAME_KEYS = [
  "gameNumber",
  "currentTieRound",
  "state",
  "canRoll",
  "winnerSlot",
  "rounds",
] as const;
const ROUND_KEYS = ["tieRound", "rolls"] as const;
const ROLL_KEYS = [
  "participantSlot",
  "participantLabel",
  "die1",
  "die2",
  "total",
  "rolledAt",
] as const;
const AUTHORITATIVE_ROLL_KEYS = [
  "activationVersion",
  "gameNumber",
  "tieRound",
  "participantSlot",
  "die1",
  "die2",
  "total",
  "rolledAt",
  "created",
] as const;
const RPC_RESULT_KEYS = ["snapshot", "roll"] as const;
const ROLL_INPUT_KEYS = [
  "matchId",
  "expectedActivationVersion",
  "gameNumber",
  "expectedTieRound",
] as const;

const readOnlyReasons = new Set<MatchDiceReadOnlyReason>([
  "unsupported_format",
  "division_not_launched",
  "tournament_not_in_progress",
  "match_not_in_progress",
  "participants_unavailable",
  "activation_unavailable",
  "official_outcome",
  "admin_hold",
  "deadline_elapsed",
]);

export function isRollMatchDiceInput(value: unknown): value is RollMatchDiceInput {
  return Boolean(
    isRecord(value) &&
      hasOnlyKeys(value, ROLL_INPUT_KEYS) &&
      isUuid(value.matchId) &&
      isPositiveInteger(value.expectedActivationVersion) &&
      isGameNumber(value.gameNumber) &&
      isPositiveInteger(value.expectedTieRound)
  );
}

export function parseMatchDiceSnapshot(
  value: unknown,
  expectedMatchId?: string
): MatchDiceRollOffSnapshot | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, SNAPSHOT_KEYS) ||
    !isUuid(value.matchId) ||
    (expectedMatchId !== undefined && value.matchId !== expectedMatchId) ||
    !isNonNegativeInteger(value.currentActivationVersion) ||
    (value.seriesBestOf !== 3 && value.seriesBestOf !== 5) ||
    (value.viewerRole !== "participant" && value.viewerRole !== "admin") ||
    !isNullableSlot(value.viewerSlot) ||
    typeof value.isActionable !== "boolean" ||
    !isNullableReadOnlyReason(value.readOnlyReason) ||
    !Array.isArray(value.participants) ||
    value.participants.length !== 2 ||
    !Array.isArray(value.activations)
  ) {
    return null;
  }

  if (value.isActionable !== (value.readOnlyReason === null)) {
    return null;
  }

  const participants = value.participants.map(parseParticipant);
  if (
    participants.some((participant) => participant === null) ||
    participants[0]?.slot === participants[1]?.slot
  ) {
    return null;
  }

  if (
    value.viewerRole === "participant" && value.viewerSlot === null ||
    value.viewerRole === "admin" && value.viewerSlot !== null
  ) {
    return null;
  }

  if (value.activations.length === 0) {
    const validEmptyProjection =
      !value.isActionable &&
      value.readOnlyReason !== null &&
      (value.currentActivationVersion === 0 ||
        value.readOnlyReason === "unsupported_format");
    if (!validEmptyProjection) return null;

    return {
      matchId: value.matchId,
      currentActivationVersion: value.currentActivationVersion,
      seriesBestOf: value.seriesBestOf,
      viewerRole: value.viewerRole,
      viewerSlot: value.viewerSlot,
      isActionable: false,
      readOnlyReason: value.readOnlyReason,
      participants: participants as [
        MatchDiceParticipant,
        MatchDiceParticipant,
      ],
      activations: [],
    };
  }

  if (!isPositiveInteger(value.currentActivationVersion)) {
    return null;
  }

  const allowedGames: MatchDiceGameNumber[] =
    value.seriesBestOf === 5 ? [1, 3, 5] : [1, 3];
  const activations = value.activations.map((activation) =>
    parseActivation(activation, allowedGames)
  );

  if (activations.some((activation) => activation === null)) {
    return null;
  }

  const parsedActivations = activations as MatchDiceActivation[];
  const versions = new Set(
    parsedActivations.map((activation) => activation.activationVersion)
  );
  const current = parsedActivations.filter((activation) => activation.isCurrent);
  if (
    versions.size !== parsedActivations.length ||
    current.length !== 1 ||
    current[0]?.activationVersion !== value.currentActivationVersion
  ) {
    return null;
  }

  return {
    matchId: value.matchId,
    currentActivationVersion: value.currentActivationVersion,
    seriesBestOf: value.seriesBestOf,
    viewerRole: value.viewerRole,
    viewerSlot: value.viewerSlot,
    isActionable: value.isActionable,
    readOnlyReason: value.readOnlyReason,
    participants: participants as [
      MatchDiceParticipant,
      MatchDiceParticipant,
    ],
    activations: parsedActivations,
  };
}

export function parseMatchDiceRollRpcResult(
  value: unknown,
  expectedMatchId: string
): { snapshot: MatchDiceRollOffSnapshot; roll: AuthoritativeMatchDiceRoll } | null {
  if (!isRecord(value) || !hasOnlyKeys(value, RPC_RESULT_KEYS)) {
    return null;
  }

  const snapshot = parseMatchDiceSnapshot(value.snapshot, expectedMatchId);
  const roll = parseAuthoritativeRoll(value.roll);
  if (
    !snapshot ||
    !roll ||
    snapshot.viewerRole !== "participant" ||
    snapshot.viewerSlot !== roll.participantSlot ||
    snapshot.currentActivationVersion !== roll.activationVersion
  ) {
    return null;
  }

  const activation = snapshot.activations.find(
    (candidate) => candidate.activationVersion === roll.activationVersion
  );
  const storedRoll = activation?.games
    .find((game) => game.gameNumber === roll.gameNumber)
    ?.rounds.find((round) => round.tieRound === roll.tieRound)
    ?.rolls.find(
      (candidate) => candidate.participantSlot === roll.participantSlot
    );

  if (
    !storedRoll ||
    storedRoll.die1 !== roll.die1 ||
    storedRoll.die2 !== roll.die2 ||
    storedRoll.total !== roll.total ||
    storedRoll.rolledAt !== roll.rolledAt
  ) {
    return null;
  }

  return { snapshot, roll };
}

function parseParticipant(value: unknown): MatchDiceParticipant | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, PARTICIPANT_KEYS) ||
    !isSlot(value.slot) ||
    !isSafeLabel(value.label)
  ) {
    return null;
  }
  return { slot: value.slot, label: value.label };
}

function parseActivation(
  value: unknown,
  allowedGames: MatchDiceGameNumber[]
): MatchDiceActivation | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ACTIVATION_KEYS) ||
    !isPositiveInteger(value.activationVersion) ||
    typeof value.isCurrent !== "boolean" ||
    !Array.isArray(value.games) ||
    value.games.length !== allowedGames.length
  ) {
    return null;
  }

  const games = value.games.map(parseGame);
  if (
    games.some((game) => game === null) ||
    games.some((game, index) => game?.gameNumber !== allowedGames[index])
  ) {
    return null;
  }

  return {
    activationVersion: value.activationVersion,
    isCurrent: value.isCurrent,
    games: games as MatchDiceGame[],
  };
}

function parseGame(value: unknown): MatchDiceGame | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, GAME_KEYS) ||
    !isGameNumber(value.gameNumber) ||
    !isPositiveInteger(value.currentTieRound) ||
    !isGameState(value.state) ||
    typeof value.canRoll !== "boolean" ||
    !isNullableSlot(value.winnerSlot) ||
    !Array.isArray(value.rounds)
  ) {
    return null;
  }

  if (
    value.state === "complete"
      ? value.winnerSlot === null
      : value.winnerSlot !== null
  ) {
    return null;
  }

  const currentTieRound = value.currentTieRound;
  const rounds = value.rounds.map(parseRound);
  if (
    rounds.some((round) => round === null) ||
    !isStrictlyIncreasing(
      (rounds as MatchDiceRound[]).map((round) => round.tieRound)
    ) ||
    rounds.some((round) => round && round.tieRound > currentTieRound)
  ) {
    return null;
  }

  return {
    gameNumber: value.gameNumber,
    currentTieRound,
    state: value.state,
    canRoll: value.canRoll,
    winnerSlot: value.winnerSlot,
    rounds: rounds as MatchDiceRound[],
  };
}

function parseRound(value: unknown): MatchDiceRound | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ROUND_KEYS) ||
    !isPositiveInteger(value.tieRound) ||
    !Array.isArray(value.rolls) ||
    value.rolls.length < 1 ||
    value.rolls.length > 2
  ) {
    return null;
  }

  const rolls = value.rolls.map(parseRoll);
  if (
    rolls.some((roll) => roll === null) ||
    new Set(
      (rolls as MatchDiceRoll[]).map((roll) => roll.participantSlot)
    ).size !== rolls.length
  ) {
    return null;
  }

  return { tieRound: value.tieRound, rolls: rolls as MatchDiceRoll[] };
}

function parseRoll(value: unknown): MatchDiceRoll | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ROLL_KEYS) ||
    !isSlot(value.participantSlot) ||
    !isSafeLabel(value.participantLabel) ||
    !isDie(value.die1) ||
    !isDie(value.die2) ||
    value.total !== value.die1 + value.die2 ||
    !isTimestamp(value.rolledAt)
  ) {
    return null;
  }

  return {
    participantSlot: value.participantSlot,
    participantLabel: value.participantLabel,
    die1: value.die1,
    die2: value.die2,
    total: value.total,
    rolledAt: value.rolledAt,
  };
}

function parseAuthoritativeRoll(
  value: unknown
): AuthoritativeMatchDiceRoll | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, AUTHORITATIVE_ROLL_KEYS) ||
    !isPositiveInteger(value.activationVersion) ||
    !isGameNumber(value.gameNumber) ||
    !isPositiveInteger(value.tieRound) ||
    !isSlot(value.participantSlot) ||
    !isDie(value.die1) ||
    !isDie(value.die2) ||
    value.total !== value.die1 + value.die2 ||
    !isTimestamp(value.rolledAt) ||
    typeof value.created !== "boolean"
  ) {
    return null;
  }

  return {
    activationVersion: value.activationVersion,
    gameNumber: value.gameNumber,
    tieRound: value.tieRound,
    participantSlot: value.participantSlot,
    die1: value.die1,
    die2: value.die2,
    total: value.total,
    rolledAt: value.rolledAt,
    created: value.created,
  };
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
) {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isGameNumber(value: unknown): value is MatchDiceGameNumber {
  return value === 1 || value === 3 || value === 5;
}

function isSlot(value: unknown): value is MatchDiceParticipantSlot {
  return value === "player_one" || value === "player_two";
}

function isNullableSlot(
  value: unknown
): value is MatchDiceParticipantSlot | null {
  return value === null || isSlot(value);
}

function isGameState(value: unknown): value is MatchDiceGameState {
  return (
    value === "open" ||
    value === "waiting" ||
    value === "tied" ||
    value === "complete"
  );
}

function isNullableReadOnlyReason(
  value: unknown
): value is MatchDiceReadOnlyReason | null {
  return value === null || readOnlyReasons.has(value as MatchDiceReadOnlyReason);
}

function isDie(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6;
}

function isSafeLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStrictlyIncreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}
