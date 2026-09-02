import {
  TOURNAMENT_BRACKET_CONFIGS,
  type TournamentBracketName,
  type TournamentStatus,
} from "@/lib/tournaments";

export const TOURNAMENT_DIVISION_STATES = [
  "disabled",
  "filling",
  "ready",
  "in_progress",
  "completed",
] as const;

export type TournamentDivisionState =
  (typeof TOURNAMENT_DIVISION_STATES)[number];

export type TournamentDivisionTerminalOverlay = "cancelled" | "voided";

export type EffectiveTournamentDivisionState =
  | TournamentDivisionState
  | TournamentDivisionTerminalOverlay;

export type TournamentDivisionStateEvidence = {
  canonicalName: TournamentBracketName;
  bracketId: string;
  approvedCount: number;
  requiredCount: number;
  isReady: boolean;
  launchedAt: string | null;
  generatedBracketId: string | null;
  isCompetitionComplete: boolean;
};

type TournamentDivisionStateResolutionBase = {
  tournamentId: string;
  canonicalName: TournamentBracketName;
  displayName: string;
  terminalOverlay: TournamentDivisionTerminalOverlay | null;
};

export type TournamentDivisionStateResolution =
  | (TournamentDivisionStateResolutionBase & {
      bracketId: null;
      state: "disabled";
      approvedCount: null;
      requiredCount: null;
      isReady: false;
      launchedAt: null;
      generatedBracketId: null;
      isCompetitionComplete: false;
    })
  | (TournamentDivisionStateResolutionBase & {
      bracketId: string;
      state: Exclude<TournamentDivisionState, "disabled">;
      approvedCount: number;
      requiredCount: number;
      isReady: boolean;
      launchedAt: string | null;
      generatedBracketId: string | null;
      isCompetitionComplete: boolean;
    });

export type PublicTournamentDivisionStateResolution = Omit<
  TournamentDivisionStateResolution,
  "generatedBracketId"
>;

export type TournamentDivisionStateResolverInput = {
  tournamentId: string;
  eventStatus: TournamentStatus;
  divisions: readonly TournamentDivisionStateEvidence[];
};

const VALID_TOURNAMENT_STATUSES = new Set<TournamentStatus>([
  "upcoming",
  "registration_open",
  "in_progress",
  "completed",
  "cancelled",
  "voided",
]);

export function resolveTournamentDivisionStates({
  tournamentId,
  eventStatus,
  divisions,
}: TournamentDivisionStateResolverInput): readonly TournamentDivisionStateResolution[] {
  assertNonEmptyString(tournamentId, "Tournament ID");

  if (!VALID_TOURNAMENT_STATUSES.has(eventStatus)) {
    throw new Error("Tournament division state received an invalid event status.");
  }

  const evidenceByName = new Map<
    TournamentBracketName,
    TournamentDivisionStateEvidence
  >();
  const bracketIds = new Set<string>();

  for (const evidence of divisions) {
    const config = TOURNAMENT_BRACKET_CONFIGS.find(
      (candidate) => candidate.name === evidence.canonicalName
    );

    if (!config) {
      throw new Error(
        "Tournament division state received an unknown canonical division."
      );
    }

    if (evidenceByName.has(evidence.canonicalName)) {
      throw new Error(
        "Tournament division state received duplicate canonical divisions."
      );
    }

    assertNonEmptyString(evidence.bracketId, "Tournament bracket ID");
    if (bracketIds.has(evidence.bracketId)) {
      throw new Error("Tournament division state received duplicate bracket IDs.");
    }

    assertNonNegativeInteger(evidence.approvedCount, "Approved count");
    assertPositiveInteger(evidence.requiredCount, "Required count");
    assertNullableTimestamp(evidence.launchedAt, "Division launch timestamp");
    assertNullableId(
      evidence.generatedBracketId,
      "Generated tournament bracket ID"
    );

    if (typeof evidence.isReady !== "boolean") {
      throw new Error("Tournament division readiness evidence was invalid.");
    }

    if (typeof evidence.isCompetitionComplete !== "boolean") {
      throw new Error("Tournament division completion evidence was invalid.");
    }

    if (evidence.launchedAt !== null && evidence.generatedBracketId === null) {
      throw new Error(
        "A launched tournament division is missing its generated bracket."
      );
    }

    if (
      evidence.isCompetitionComplete &&
      evidence.generatedBracketId === null
    ) {
      throw new Error(
        "Tournament division completion evidence is missing its generated bracket."
      );
    }

    evidenceByName.set(evidence.canonicalName, evidence);
    bracketIds.add(evidence.bracketId);
  }

  const terminalOverlay = getTournamentTerminalOverlay(eventStatus);

  return TOURNAMENT_BRACKET_CONFIGS.map((config) => {
    const evidence = evidenceByName.get(config.name);

    if (!evidence) {
      return {
        tournamentId,
        canonicalName: config.name,
        displayName: config.label,
        bracketId: null,
        state: "disabled",
        terminalOverlay,
        approvedCount: null,
        requiredCount: null,
        isReady: false,
        launchedAt: null,
        generatedBracketId: null,
        isCompetitionComplete: false,
      } satisfies TournamentDivisionStateResolution;
    }

    const state = resolveEnabledTournamentDivisionState(evidence);

    return {
      tournamentId,
      canonicalName: config.name,
      displayName: config.label,
      bracketId: evidence.bracketId,
      state,
      terminalOverlay,
      approvedCount: evidence.approvedCount,
      requiredCount: evidence.requiredCount,
      isReady: evidence.isReady,
      launchedAt: evidence.launchedAt,
      generatedBracketId: evidence.generatedBracketId,
      isCompetitionComplete:
        evidence.launchedAt !== null && evidence.isCompetitionComplete,
    } satisfies TournamentDivisionStateResolution;
  });
}

export function projectPublicTournamentDivisionStates(
  resolutions: readonly TournamentDivisionStateResolution[]
): readonly PublicTournamentDivisionStateResolution[] {
  return resolutions.map((resolution) => {
    const { generatedBracketId, ...publicResolution } = resolution;

    void generatedBracketId;
    return publicResolution;
  });
}

export function formatTournamentDivisionState(
  resolution: PublicTournamentDivisionStateResolution
) {
  switch (getEffectiveTournamentDivisionState(resolution)) {
    case "disabled":
      return "Disabled";
    case "filling":
      return `Filling — ${formatReadinessCount(resolution)}`;
    case "ready":
      return `Ready to Launch — ${formatReadinessCount(resolution)}`;
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "voided":
      return "Voided";
  }
}

export function getEffectiveTournamentDivisionState(
  resolution: PublicTournamentDivisionStateResolution
): EffectiveTournamentDivisionState {
  return resolution.state === "disabled"
    ? "disabled"
    : resolution.terminalOverlay ?? resolution.state;
}

export function formatTournamentEventDivisionState(
  resolutions: readonly PublicTournamentDivisionStateResolution[]
) {
  const ordered = orderAndValidateResolutions(resolutions);
  const overlay = ordered[0]?.terminalOverlay ?? null;

  if (overlay === "cancelled") {
    return "Cancelled";
  }

  if (overlay === "voided") {
    return "Voided";
  }

  return ordered
    .map(
      (resolution) =>
        `${resolution.displayName}: ${formatTournamentDivisionState(resolution)}`
    )
    .join(" · ");
}

function resolveEnabledTournamentDivisionState(
  evidence: TournamentDivisionStateEvidence
): Exclude<TournamentDivisionState, "disabled"> {
  if (evidence.launchedAt !== null) {
    return evidence.isCompetitionComplete ? "completed" : "in_progress";
  }

  return evidence.isReady ? "ready" : "filling";
}

function getTournamentTerminalOverlay(
  status: TournamentStatus
): TournamentDivisionTerminalOverlay | null {
  return status === "cancelled" || status === "voided" ? status : null;
}

function formatReadinessCount(
  resolution: PublicTournamentDivisionStateResolution
) {
  if (
    resolution.approvedCount === null ||
    resolution.requiredCount === null
  ) {
    throw new Error(
      "An enabled tournament division is missing readiness counts."
    );
  }

  return `${resolution.approvedCount}/${resolution.requiredCount}`;
}

function orderAndValidateResolutions(
  resolutions: readonly PublicTournamentDivisionStateResolution[]
) {
  const byName = new Map<
    TournamentBracketName,
    PublicTournamentDivisionStateResolution
  >();
  let tournamentId: string | null = null;
  let terminalOverlay: TournamentDivisionTerminalOverlay | null | undefined;

  for (const resolution of resolutions) {
    if (byName.has(resolution.canonicalName)) {
      throw new Error(
        "Tournament event state received duplicate canonical divisions."
      );
    }

    if (tournamentId !== null && resolution.tournamentId !== tournamentId) {
      throw new Error(
        "Tournament event state cannot combine multiple tournaments."
      );
    }

    if (
      terminalOverlay !== undefined &&
      resolution.terminalOverlay !== terminalOverlay
    ) {
      throw new Error(
        "Tournament event state received inconsistent terminal overlays."
      );
    }

    tournamentId = resolution.tournamentId;
    terminalOverlay = resolution.terminalOverlay;
    byName.set(resolution.canonicalName, resolution);
  }

  if (byName.size !== TOURNAMENT_BRACKET_CONFIGS.length) {
    throw new Error(
      "Tournament event state requires every canonical division resolution."
    );
  }

  return TOURNAMENT_BRACKET_CONFIGS.map((config) => {
    const resolution = byName.get(config.name);

    if (!resolution) {
      throw new Error(
        "Tournament event state is missing a canonical division resolution."
      );
    }

    return resolution;
  });
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} was invalid.`);
  }
}

function assertNullableId(value: unknown, label: string): asserts value is string | null {
  if (value !== null) {
    assertNonEmptyString(value, label);
  }
}

function assertNullableTimestamp(
  value: unknown,
  label: string
): asserts value is string | null {
  if (
    value !== null &&
    (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
  ) {
    throw new Error(`${label} was invalid.`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${label} was invalid.`);
  }
}

function assertPositiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`${label} was invalid.`);
  }
}
