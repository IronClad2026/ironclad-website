export const POLL_LIMITS = {
  question: 160,
  context: 1_000,
  optionLabel: 120,
  minimumOptions: 2,
  maximumOptions: 24,
  minimumSelections: 1,
  maximumSelections: 5,
  minimumWinners: 1,
  maximumWinners: 5,
  cancellationReason: 500,
  finalRationale: 1_000,
  minimumDurationMilliseconds: 15 * 60 * 1_000,
  maximumDurationMilliseconds: 30 * 24 * 60 * 60 * 1_000,
  defaultDurationMilliseconds: 7 * 24 * 60 * 60 * 1_000,
} as const;

export const POLL_PURPOSES = [
  "tournament_decision",
  "community_feedback",
] as const;
export const POLL_AUDIENCE_KINDS = [
  "tournament_approved",
  "tournament_division_approved",
  "selected_tournament_players",
  "active_players",
  "selected_active_players",
] as const;
export const POLL_AUTHORITIES = ["advisory", "binding"] as const;
export const POLL_RESULT_VISIBILITIES = ["live", "after_close"] as const;
export const POLL_OPTION_SOURCES = ["text", "coh3_map"] as const;
export const POLL_STATUSES = [
  "draft",
  "scheduled",
  "open",
  "closed",
  "cancelled",
  "final_decision_published",
] as const;

export type PollPurpose = (typeof POLL_PURPOSES)[number];
export type PollAudienceKind = (typeof POLL_AUDIENCE_KINDS)[number];
export type PollAuthority = (typeof POLL_AUTHORITIES)[number];
export type PollResultVisibility = (typeof POLL_RESULT_VISIBILITIES)[number];
export type PollOptionSource = (typeof POLL_OPTION_SOURCES)[number];
export type PollStatus = (typeof POLL_STATUSES)[number];
export type PollProjectionScope = "viewer" | "admin" | "public";
export type PollFinalDecisionBasis =
  | "advisory_poll_result"
  | "advisory_admin_override"
  | "binding_computed"
  | "binding_cutoff_tiebreak";

export type PollDraftInput = {
  pollId: string | null;
  purpose: PollPurpose;
  audienceKind: PollAudienceKind;
  tournamentId: string | null;
  tournamentBracketId: string | null;
  question: string;
  context: string | null;
  optionSource: PollOptionSource;
  optionLabels: string[];
  mapIds: string[];
  selectedPlayerIds: string[];
  maxSelections: number;
  winnerCount: number;
  authority: PollAuthority;
  resultVisibility: PollResultVisibility;
  publicFinalTotals: boolean;
  opensAt: string;
  closesAt: string;
};

export type SubmitPollVoteInput = {
  pollId: string;
  expectedRevision: number;
  selectedOptionIds: string[];
};

export type PollMapSnapshot = {
  id: string | null;
  name: string;
  slug: string;
};

export type PollOptionProjection = {
  id: string;
  position: number;
  label: string;
  map: PollMapSnapshot | null;
  voteCount?: number;
  selectionSharePercent?: number;
  pollResultRank: number | null;
  finalDecisionRank: number | null;
};

export type PollViewerProjection = {
  id: string;
  purpose: PollPurpose;
  audienceKind: PollAudienceKind;
  tournamentId: string | null;
  tournamentBracketId: string | null;
  question: string;
  context: string | null;
  optionSource: PollOptionSource;
  maxSelections: number;
  winnerCount: number;
  authority: PollAuthority;
  resultVisibility: PollResultVisibility;
  publicFinalTotals: boolean;
  opensAt: string;
  closesAt: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  finalDecisionPublishedAt: string | null;
  finalDecisionBasis: PollFinalDecisionBasis | null;
  finalRationale: string | null;
  bindingTieRuleUsed: boolean;
  status: PollStatus;
  eligibleCount?: number;
  submittedBallotCount?: number;
  ballotRevision?: number;
  selectedOptionIds?: string[];
  selectedPlayerIds?: string[];
  computedWinnerOptionIds?: string[];
  cutoffTieOptionIds?: string[];
  cutoffSlotsRemaining?: number;
  draftAudienceInvalidated?: boolean;
  options: PollOptionProjection[];
};

export type PollListProjection = {
  polls: PollViewerProjection[];
};

export type PollVoteResult = {
  pollId: string;
  ballotRevision: number;
  selectedOptionIds: string[];
  firstVotedAt: string;
  ballotUpdatedAt: string;
  idempotent: boolean;
};

export type PollPublicationResult = {
  pollId: string;
  publishedAt: string;
  eligibleCount: number;
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DRAFT_KEYS = [
  "pollId",
  "purpose",
  "audienceKind",
  "tournamentId",
  "tournamentBracketId",
  "question",
  "context",
  "optionSource",
  "optionLabels",
  "mapIds",
  "selectedPlayerIds",
  "maxSelections",
  "winnerCount",
  "authority",
  "resultVisibility",
  "publicFinalTotals",
  "opensAt",
  "closesAt",
] as const;
const VOTE_INPUT_KEYS = [
  "pollId",
  "expectedRevision",
  "selectedOptionIds",
] as const;
const LIST_KEYS = ["polls"] as const;
const SINGLE_POLL_KEYS = ["poll"] as const;
const POLL_KEYS = [
  "id",
  "purpose",
  "audience_kind",
  "tournament_id",
  "tournament_bracket_id",
  "question",
  "context",
  "option_source",
  "max_selections",
  "winner_count",
  "authority",
  "result_visibility",
  "public_final_totals",
  "opens_at",
  "closes_at",
  "published_at",
  "cancelled_at",
  "cancellation_reason",
  "final_decision_published_at",
  "final_decision_basis",
  "final_rationale",
  "binding_tie_rule_used",
  "status",
  "eligible_count",
  "submitted_ballot_count",
  "ballot_revision",
  "selected_option_ids",
  "selected_player_ids",
  "computed_winner_option_ids",
  "cutoff_tie_option_ids",
  "cutoff_slots_remaining",
  "draft_audience_invalidated",
  "options",
] as const;
const REQUIRED_POLL_KEYS = [
  "id",
  "purpose",
  "audience_kind",
  "tournament_id",
  "tournament_bracket_id",
  "question",
  "context",
  "option_source",
  "max_selections",
  "winner_count",
  "authority",
  "result_visibility",
  "public_final_totals",
  "opens_at",
  "closes_at",
  "published_at",
  "cancelled_at",
  "cancellation_reason",
  "final_decision_published_at",
  "final_decision_basis",
  "final_rationale",
  "binding_tie_rule_used",
  "status",
  "options",
] as const;
const OPTION_KEYS = [
  "id",
  "position",
  "label",
  "map",
  "vote_count",
  "selection_share_percent",
  "poll_result_rank",
  "final_decision_rank",
] as const;
const MAP_KEYS = ["id", "name", "slug"] as const;
const VOTE_RESULT_KEYS = [
  "poll_id",
  "ballot_revision",
  "selected_option_ids",
  "first_voted_at",
  "ballot_updated_at",
  "idempotent",
] as const;
const PUBLICATION_RESULT_KEYS = [
  "poll_id",
  "published_at",
  "eligible_count",
] as const;

export function parsePollDraftInput(value: unknown): ParseResult<PollDraftInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, DRAFT_KEYS)) {
    return { ok: false, error: "The poll draft is invalid." };
  }

  if (value.pollId !== null && !isUuid(value.pollId)) {
    return { ok: false, error: "The poll identifier is invalid." };
  }
  if (!isPollPurpose(value.purpose) || !isPollAudienceKind(value.audienceKind)) {
    return { ok: false, error: "The poll purpose or audience is invalid." };
  }
  if (
    (value.tournamentId !== null && !isUuid(value.tournamentId)) ||
    (value.tournamentBracketId !== null && !isUuid(value.tournamentBracketId))
  ) {
    return { ok: false, error: "The tournament audience is invalid." };
  }
  if (!isAudienceValidForPurpose(value)) {
    return { ok: false, error: "The poll audience is invalid for its purpose." };
  }
  if (!isPollAuthority(value.authority)) {
    return { ok: false, error: "The poll authority is invalid." };
  }
  if (value.purpose === "community_feedback" && value.authority !== "advisory") {
    return { ok: false, error: "Community Feedback must be Advisory." };
  }
  if (
    !isPollResultVisibility(value.resultVisibility) ||
    !isPollOptionSource(value.optionSource) ||
    typeof value.publicFinalTotals !== "boolean"
  ) {
    return { ok: false, error: "The poll configuration is invalid." };
  }
  if (value.purpose === "community_feedback" && value.publicFinalTotals) {
    return { ok: false, error: "Community Feedback cannot publish public totals." };
  }

  const question = readTrimmedText(value.question);
  const context = value.context === null ? null : readTrimmedText(value.context);
  if (!question || question.length > POLL_LIMITS.question) {
    return { ok: false, error: "The poll question must be 1 to 160 characters." };
  }
  if (context !== null && context.length > POLL_LIMITS.context) {
    return { ok: false, error: "Poll context cannot exceed 1,000 characters." };
  }

  if (!Array.isArray(value.optionLabels) || !Array.isArray(value.mapIds)) {
    return { ok: false, error: "The poll options are invalid." };
  }
  const parsedOptions = parseDraftOptions(
    value.optionSource,
    value.optionLabels,
    value.mapIds
  );
  if (!parsedOptions.ok) return parsedOptions;

  if (!isIntegerBetween(value.maxSelections, 1, 5)) {
    return { ok: false, error: "Maximum selections must be between 1 and 5." };
  }
  if (!isIntegerBetween(value.winnerCount, 1, 5)) {
    return { ok: false, error: "Winner count must be between 1 and 5." };
  }
  if (value.maxSelections > parsedOptions.count) {
    return { ok: false, error: "Maximum selections cannot exceed option count." };
  }
  if (value.winnerCount > value.maxSelections) {
    return { ok: false, error: "Winner count cannot exceed maximum selections." };
  }

  if (!Array.isArray(value.selectedPlayerIds)) {
    return { ok: false, error: "Selected players are invalid." };
  }
  if (!value.selectedPlayerIds.every(isUuid)) {
    return { ok: false, error: "Selected players are invalid." };
  }
  if (new Set(value.selectedPlayerIds).size !== value.selectedPlayerIds.length) {
    return { ok: false, error: "Selected players must be distinct." };
  }
  const selectedAudience =
    value.audienceKind === "selected_tournament_players" ||
    value.audienceKind === "selected_active_players";
  if (
    (selectedAudience && value.selectedPlayerIds.length === 0) ||
    (!selectedAudience && value.selectedPlayerIds.length > 0)
  ) {
    return { ok: false, error: "Selected players do not match the poll audience." };
  }

  if (!isTimestamp(value.opensAt) || !isTimestamp(value.closesAt)) {
    return { ok: false, error: "The poll opening and closing times are invalid." };
  }
  const duration = Date.parse(value.closesAt) - Date.parse(value.opensAt);
  if (
    duration < POLL_LIMITS.minimumDurationMilliseconds ||
    duration > POLL_LIMITS.maximumDurationMilliseconds
  ) {
    return {
      ok: false,
      error: "Poll duration must be between 15 minutes and 30 days.",
    };
  }

  return {
    ok: true,
    value: {
      pollId: value.pollId,
      purpose: value.purpose,
      audienceKind: value.audienceKind,
      tournamentId: value.tournamentId,
      tournamentBracketId: value.tournamentBracketId,
      question,
      context: context || null,
      optionSource: value.optionSource,
      optionLabels: parsedOptions.optionLabels,
      mapIds: parsedOptions.mapIds,
      selectedPlayerIds: [...value.selectedPlayerIds],
      maxSelections: value.maxSelections,
      winnerCount: value.winnerCount,
      authority: value.authority,
      resultVisibility: value.resultVisibility,
      publicFinalTotals: value.publicFinalTotals,
      opensAt: new Date(value.opensAt).toISOString(),
      closesAt: new Date(value.closesAt).toISOString(),
    },
  };
}

export function isSubmitPollVoteInput(
  value: unknown
): value is SubmitPollVoteInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, VOTE_INPUT_KEYS) ||
    !isUuid(value.pollId) ||
    !isNonNegativeInteger(value.expectedRevision) ||
    !Array.isArray(value.selectedOptionIds) ||
    value.selectedOptionIds.length < 1 ||
    value.selectedOptionIds.length > POLL_LIMITS.maximumSelections ||
    !value.selectedOptionIds.every(isUuid)
  ) {
    return false;
  }
  return new Set(value.selectedOptionIds).size === value.selectedOptionIds.length;
}

export function derivePollStatus(
  milestones: {
    publishedAt: string | null;
    opensAt: string;
    closesAt: string;
    cancelledAt: string | null;
    finalDecisionPublishedAt: string | null;
  },
  now: string | number | Date = Date.now()
): PollStatus {
  if (milestones.publishedAt === null) return "draft";
  if (milestones.cancelledAt !== null) return "cancelled";
  if (milestones.finalDecisionPublishedAt !== null) {
    return "final_decision_published";
  }
  const nowMilliseconds = new Date(now).getTime();
  if (nowMilliseconds < Date.parse(milestones.opensAt)) return "scheduled";
  if (nowMilliseconds < Date.parse(milestones.closesAt)) return "open";
  return "closed";
}

export function parsePollListProjection(
  value: unknown,
  scope: PollProjectionScope = "viewer"
): PollListProjection | null {
  if (!isRecord(value) || !hasOnlyKeys(value, LIST_KEYS) || !Array.isArray(value.polls)) {
    return null;
  }
  const polls = value.polls.map((poll) => parsePollProjection(poll, scope));
  if (polls.some((poll) => poll === null)) return null;
  return { polls: polls as PollViewerProjection[] };
}

export function parseSinglePollProjection(
  value: unknown,
  scope: PollProjectionScope = "viewer"
): PollViewerProjection | null {
  if (!isRecord(value) || !hasOnlyKeys(value, SINGLE_POLL_KEYS)) return null;
  return parsePollProjection(value.poll, scope);
}

export function parsePollVoteResult(
  value: unknown,
  expectedPollId?: string
): PollVoteResult | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, VOTE_RESULT_KEYS) ||
    !isUuid(value.poll_id) ||
    (expectedPollId !== undefined && value.poll_id !== expectedPollId) ||
    !isPositiveInteger(value.ballot_revision) ||
    !Array.isArray(value.selected_option_ids) ||
    value.selected_option_ids.length < 1 ||
    value.selected_option_ids.length > POLL_LIMITS.maximumSelections ||
    !value.selected_option_ids.every(isUuid) ||
    new Set(value.selected_option_ids).size !== value.selected_option_ids.length ||
    !isTimestamp(value.first_voted_at) ||
    !isTimestamp(value.ballot_updated_at) ||
    typeof value.idempotent !== "boolean"
  ) {
    return null;
  }
  return {
    pollId: value.poll_id,
    ballotRevision: value.ballot_revision,
    selectedOptionIds: [...value.selected_option_ids],
    firstVotedAt: new Date(value.first_voted_at).toISOString(),
    ballotUpdatedAt: new Date(value.ballot_updated_at).toISOString(),
    idempotent: value.idempotent,
  };
}

export function parsePollPublicationResult(
  value: unknown,
  expectedPollId?: string
): PollPublicationResult | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, PUBLICATION_RESULT_KEYS) ||
    !isUuid(value.poll_id) ||
    (expectedPollId !== undefined && value.poll_id !== expectedPollId) ||
    !isTimestamp(value.published_at) ||
    !isPositiveInteger(value.eligible_count)
  ) {
    return null;
  }
  return {
    pollId: value.poll_id,
    publishedAt: new Date(value.published_at).toISOString(),
    eligibleCount: value.eligible_count,
  };
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function parseDraftOptions(
  source: PollOptionSource,
  rawLabels: unknown[],
  rawMapIds: unknown[]
):
  | { ok: true; count: number; optionLabels: string[]; mapIds: string[] }
  | { ok: false; error: string } {
  if (source === "text") {
    if (rawMapIds.length > 0 || !rawLabels.every((label) => typeof label === "string")) {
      return { ok: false, error: "Text polls require text options only." };
    }
    const labels = rawLabels.map((label) => String(label).trim());
    if (
      labels.length < POLL_LIMITS.minimumOptions ||
      labels.length > POLL_LIMITS.maximumOptions
    ) {
      return { ok: false, error: "Polls require between 2 and 24 options." };
    }
    if (labels.some((label) => !label || label.length > POLL_LIMITS.optionLabel)) {
      return { ok: false, error: "Poll option labels must be 1 to 120 characters." };
    }
    const normalized = labels.map((label) => label.toLocaleLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      return { ok: false, error: "Poll options must be distinct." };
    }
    return { ok: true, count: labels.length, optionLabels: labels, mapIds: [] };
  }

  if (rawLabels.length > 0 || !rawMapIds.every(isUuid)) {
    return { ok: false, error: "Map polls require catalogue map options only." };
  }
  if (
    rawMapIds.length < POLL_LIMITS.minimumOptions ||
    rawMapIds.length > POLL_LIMITS.maximumOptions
  ) {
    return { ok: false, error: "Polls require between 2 and 24 options." };
  }
  if (new Set(rawMapIds).size !== rawMapIds.length) {
    return { ok: false, error: "Poll options must be distinct." };
  }
  return {
    ok: true,
    count: rawMapIds.length,
    optionLabels: [],
    mapIds: rawMapIds as string[],
  };
}

function isAudienceValidForPurpose(value: Record<string, unknown>) {
  if (value.purpose === "tournament_decision") {
    if (!isUuid(value.tournamentId)) return false;
    if (value.audienceKind === "tournament_division_approved") {
      return isUuid(value.tournamentBracketId);
    }
    return (
      (value.audienceKind === "tournament_approved" ||
        value.audienceKind === "selected_tournament_players") &&
      value.tournamentBracketId === null
    );
  }
  return (
    value.purpose === "community_feedback" &&
    (value.audienceKind === "active_players" ||
      value.audienceKind === "selected_active_players") &&
    value.tournamentId === null &&
    value.tournamentBracketId === null
  );
}

function parsePollProjection(
  value: unknown,
  scope: PollProjectionScope
): PollViewerProjection | null {
  if (
    !isRecord(value) ||
    !hasOnlyAllowedKeys(value, POLL_KEYS) ||
    !hasRequiredKeys(value, REQUIRED_POLL_KEYS) ||
    !isUuid(value.id) ||
    !isPollPurpose(value.purpose) ||
    !isPollAudienceKind(value.audience_kind) ||
    !isNullableUuid(value.tournament_id) ||
    !isNullableUuid(value.tournament_bracket_id) ||
    !isBoundedText(value.question, 1, POLL_LIMITS.question) ||
    !isNullableBoundedText(value.context, POLL_LIMITS.context) ||
    !isPollOptionSource(value.option_source) ||
    !isIntegerBetween(value.max_selections, 1, 5) ||
    !isIntegerBetween(value.winner_count, 1, 5) ||
    value.winner_count > value.max_selections ||
    !isPollAuthority(value.authority) ||
    !isPollResultVisibility(value.result_visibility) ||
    typeof value.public_final_totals !== "boolean" ||
    !isTimestamp(value.opens_at) ||
    !isTimestamp(value.closes_at) ||
    !isNullableTimestamp(value.published_at) ||
    !isNullableTimestamp(value.cancelled_at) ||
    !isNullableBoundedText(value.cancellation_reason, POLL_LIMITS.cancellationReason) ||
    !isNullableTimestamp(value.final_decision_published_at) ||
    !isNullablePollFinalDecisionBasis(value.final_decision_basis) ||
    !isNullableBoundedText(value.final_rationale, POLL_LIMITS.finalRationale) ||
    typeof value.binding_tie_rule_used !== "boolean" ||
    !isPollStatus(value.status) ||
    !Array.isArray(value.options)
  ) {
    return null;
  }

  if (
    value.purpose === "community_feedback" &&
    (value.authority !== "advisory" || value.public_final_totals)
  ) {
    return null;
  }
  if (!isProjectionAudienceValid(value)) return null;

  const optionSource = value.option_source as PollOptionSource;
  const winnerCount = value.winner_count as number;
  const options = value.options.map((option) =>
    parsePollOption(option, optionSource)
  );
  if (
    options.some((option) => option === null) ||
    options.length < POLL_LIMITS.minimumOptions ||
    options.length > POLL_LIMITS.maximumOptions
  ) {
    return null;
  }
  const parsedOptions = options as PollOptionProjection[];
  const optionIds = new Set(parsedOptions.map((option) => option.id));
  const positions = parsedOptions.map((option) => option.position);
  const ranks = parsedOptions
    .map((option) => option.finalDecisionRank)
    .filter((rank): rank is number => rank !== null);
  if (
    optionIds.size !== parsedOptions.length ||
    new Set(positions).size !== positions.length ||
    positions.some((position) => position < 1 || position > parsedOptions.length) ||
    new Set(ranks).size !== ranks.length ||
    ranks.some((rank) => rank > winnerCount)
  ) {
    return null;
  }

  const eligibleCount = readOptionalNonNegativeInteger(value, "eligible_count");
  const submittedBallotCount = readOptionalNonNegativeInteger(
    value,
    "submitted_ballot_count"
  );
  const ballotRevision = readOptionalNonNegativeInteger(value, "ballot_revision");
  const selectedOptionIds = readOptionalUuidArray(value, "selected_option_ids");
  const selectedPlayerIds = readOptionalUuidArray(value, "selected_player_ids");
  const computedWinnerOptionIds = readOptionalUuidArray(
    value,
    "computed_winner_option_ids"
  );
  const cutoffTieOptionIds = readOptionalUuidArray(value, "cutoff_tie_option_ids");
  const cutoffSlotsRemaining = readOptionalIntegerBetween(
    value,
    "cutoff_slots_remaining",
    0,
    POLL_LIMITS.maximumWinners
  );
  const draftAudienceInvalidated = readOptionalBoolean(
    value,
    "draft_audience_invalidated"
  );
  if (
    eligibleCount === false ||
    submittedBallotCount === false ||
    ballotRevision === false ||
    selectedOptionIds === false ||
    selectedPlayerIds === false ||
    computedWinnerOptionIds === false ||
    cutoffTieOptionIds === false ||
    cutoffSlotsRemaining === false ||
    draftAudienceInvalidated === null
  ) {
    return null;
  }
  if (
    Array.isArray(selectedOptionIds) &&
    selectedOptionIds.some((optionId) => !optionIds.has(optionId))
  ) {
    return null;
  }
  if (
    [computedWinnerOptionIds, cutoffTieOptionIds]
      .filter(Array.isArray)
      .some((ids) => ids.some((optionId) => !optionIds.has(optionId))) ||
    (Array.isArray(computedWinnerOptionIds) &&
      Array.isArray(cutoffTieOptionIds) &&
      computedWinnerOptionIds.some((optionId) => cutoffTieOptionIds.includes(optionId)))
  ) {
    return null;
  }

  const hasOptionTotals = parsedOptions.some(
    (option) => option.voteCount !== undefined || option.selectionSharePercent !== undefined
  );
  const everyOptionHasTotals = parsedOptions.every(
    (option) => option.voteCount !== undefined && option.selectionSharePercent !== undefined
  );
  if (hasOptionTotals !== everyOptionHasTotals) return null;

  const hiddenWhileOpen =
    value.status === "open" && value.result_visibility === "after_close";
  const hasPollResultRanks = parsedOptions.some(
    (option) => option.pollResultRank !== null
  );
  const hasFinalDecisionRanks = parsedOptions.some(
    (option) => option.finalDecisionRank !== null
  );
  const published = value.published_at !== null;
  const finalPublished = value.final_decision_published_at !== null;
  const cancelled = value.cancelled_at !== null;
  const finalBasis = value.final_decision_basis;
  const selectedAudience =
    value.audience_kind === "selected_tournament_players" ||
    value.audience_kind === "selected_active_players";
  if (
    (eligibleCount !== undefined &&
      submittedBallotCount !== undefined &&
      submittedBallotCount > eligibleCount) ||
    ((ballotRevision === undefined) !== (selectedOptionIds === undefined)) ||
    (ballotRevision !== undefined &&
      Array.isArray(selectedOptionIds) &&
      ((ballotRevision === 0 && selectedOptionIds.length !== 0) ||
        (ballotRevision > 0 && selectedOptionIds.length === 0) ||
        selectedOptionIds.length > value.max_selections)) ||
    (scope === "viewer" && selectedPlayerIds !== undefined) ||
    (scope === "admin" &&
      (selectedOptionIds !== undefined || ballotRevision !== undefined)) ||
    (scope === "admin" &&
      selectedPlayerIds !== undefined &&
      (published || !selectedAudience)) ||
    (scope === "admin" &&
      published &&
      draftAudienceInvalidated !== undefined &&
      draftAudienceInvalidated) ||
    (scope !== "admin" &&
      (computedWinnerOptionIds !== undefined ||
        cutoffTieOptionIds !== undefined ||
        cutoffSlotsRemaining !== undefined ||
        draftAudienceInvalidated !== undefined)) ||
    (scope === "public" &&
      (selectedPlayerIds !== undefined ||
        selectedOptionIds !== undefined ||
        ballotRevision !== undefined)) ||
    (hiddenWhileOpen &&
      scope !== "admin" &&
      (eligibleCount !== undefined || submittedBallotCount !== undefined)) ||
    (hiddenWhileOpen && (hasOptionTotals || hasPollResultRanks)) ||
    (!finalPublished && hasFinalDecisionRanks) ||
    (finalPublished && ranks.length !== winnerCount) ||
    (!published && value.status !== "draft") ||
    (published && value.status === "draft") ||
    (cancelled !== (value.status === "cancelled")) ||
    (finalPublished !== (value.status === "final_decision_published")) ||
    (cancelled && finalPublished) ||
    (cancelled !== (value.cancellation_reason !== null)) ||
    (finalPublished !== (finalBasis !== null)) ||
    (!finalPublished &&
      (value.final_rationale !== null || value.binding_tie_rule_used)) ||
    (finalBasis === "advisory_admin_override" && value.final_rationale === null) ||
    (value.authority === "advisory" &&
      finalBasis !== null &&
      finalBasis !== "advisory_poll_result" &&
      finalBasis !== "advisory_admin_override") ||
    (value.authority === "binding" &&
      finalBasis !== null &&
      finalBasis !== "binding_computed" &&
      finalBasis !== "binding_cutoff_tiebreak") ||
    (value.binding_tie_rule_used !==
      (finalBasis === "binding_cutoff_tiebreak")) ||
    (scope === "public" &&
      (value.purpose !== "tournament_decision" ||
        value.final_decision_published_at === null)) ||
    (scope === "public" &&
      !value.public_final_totals &&
      (eligibleCount !== undefined ||
        submittedBallotCount !== undefined ||
        hasOptionTotals))
  ) {
    return null;
  }

  return {
    id: value.id,
    purpose: value.purpose,
    audienceKind: value.audience_kind,
    tournamentId: value.tournament_id,
    tournamentBracketId: value.tournament_bracket_id,
    question: value.question,
    context: value.context,
    optionSource,
    maxSelections: value.max_selections,
    winnerCount,
    authority: value.authority,
    resultVisibility: value.result_visibility,
    publicFinalTotals: value.public_final_totals,
    opensAt: value.opens_at,
    closesAt: value.closes_at,
    publishedAt: value.published_at,
    cancelledAt: value.cancelled_at,
    cancellationReason: value.cancellation_reason,
    finalDecisionPublishedAt: value.final_decision_published_at,
    finalDecisionBasis: value.final_decision_basis,
    finalRationale: value.final_rationale,
    bindingTieRuleUsed: value.binding_tie_rule_used,
    status: value.status,
    ...(eligibleCount !== undefined ? { eligibleCount } : {}),
    ...(submittedBallotCount !== undefined ? { submittedBallotCount } : {}),
    ...(ballotRevision !== undefined ? { ballotRevision } : {}),
    ...(selectedOptionIds !== undefined ? { selectedOptionIds } : {}),
    ...(selectedPlayerIds !== undefined ? { selectedPlayerIds } : {}),
    ...(computedWinnerOptionIds !== undefined ? { computedWinnerOptionIds } : {}),
    ...(cutoffTieOptionIds !== undefined ? { cutoffTieOptionIds } : {}),
    ...(cutoffSlotsRemaining !== undefined ? { cutoffSlotsRemaining } : {}),
    ...(draftAudienceInvalidated !== undefined
      ? { draftAudienceInvalidated }
      : {}),
    options: parsedOptions.sort((left, right) => left.position - right.position),
  };
}

function parsePollOption(
  value: unknown,
  source: PollOptionSource
): PollOptionProjection | null {
  if (
    !isRecord(value) ||
    !hasOnlyAllowedKeys(value, OPTION_KEYS) ||
    !hasRequiredKeys(value, [
      "id",
      "position",
      "label",
      "map",
      "poll_result_rank",
      "final_decision_rank",
    ]) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.position) ||
    !isBoundedText(value.label, 1, POLL_LIMITS.optionLabel) ||
    !isNullableIntegerBetween(value.poll_result_rank, 1, 5) ||
    !isNullableIntegerBetween(value.final_decision_rank, 1, 5)
  ) {
    return null;
  }
  const map = parsePollMap(value.map);
  if (map === false || (source === "text" && map !== null) || (source === "coh3_map" && map === null)) {
    return null;
  }
  const voteCount = readOptionalNonNegativeInteger(value, "vote_count");
  const selectionSharePercent = readOptionalPercentage(value, "selection_share_percent");
  if (voteCount === false || selectionSharePercent === false) return null;
  if ((voteCount === undefined) !== (selectionSharePercent === undefined)) return null;
  return {
    id: value.id,
    position: value.position,
    label: value.label,
    map,
    ...(voteCount !== undefined ? { voteCount } : {}),
    ...(selectionSharePercent !== undefined ? { selectionSharePercent } : {}),
    pollResultRank: value.poll_result_rank,
    finalDecisionRank: value.final_decision_rank,
  };
}

function parsePollMap(value: unknown): PollMapSnapshot | null | false {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, MAP_KEYS) ||
    !isNullableUuid(value.id) ||
    !isBoundedText(value.name, 1, POLL_LIMITS.optionLabel) ||
    !isBoundedText(value.slug, 1, 120)
  ) {
    return false;
  }
  return { id: value.id, name: value.name, slug: value.slug };
}

function readOptionalNonNegativeInteger(
  value: Record<string, unknown>,
  key: string
): number | undefined | false {
  if (!(key in value)) return undefined;
  return isNonNegativeInteger(value[key]) ? value[key] : false;
}

function readOptionalIntegerBetween(
  value: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number
): number | undefined | false {
  if (!(key in value)) return undefined;
  return isIntegerBetween(value[key], minimum, maximum) ? value[key] : false;
}

function readOptionalBoolean(
  value: Record<string, unknown>,
  key: string
): boolean | undefined | null {
  if (!(key in value)) return undefined;
  return typeof value[key] === "boolean" ? value[key] : null;
}

function readOptionalPercentage(
  value: Record<string, unknown>,
  key: string
): number | undefined | false {
  if (!(key in value)) return undefined;
  const candidate = value[key];
  return typeof candidate === "number" && candidate >= 0 && candidate <= 100
    ? candidate
    : false;
}

function readOptionalUuidArray(
  value: Record<string, unknown>,
  key: string
): string[] | undefined | false {
  if (!(key in value)) return undefined;
  const candidate = value[key];
  if (
    !Array.isArray(candidate) ||
    !candidate.every(isUuid) ||
    new Set(candidate).size !== candidate.length
  ) {
    return false;
  }
  return [...candidate];
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function hasOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasRequiredKeys(
  value: Record<string, unknown>,
  required: readonly string[]
) {
  return required.every((key) => key in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPollPurpose(value: unknown): value is PollPurpose {
  return POLL_PURPOSES.includes(value as PollPurpose);
}

function isPollAudienceKind(value: unknown): value is PollAudienceKind {
  return POLL_AUDIENCE_KINDS.includes(value as PollAudienceKind);
}

function isPollAuthority(value: unknown): value is PollAuthority {
  return POLL_AUTHORITIES.includes(value as PollAuthority);
}

function isPollResultVisibility(value: unknown): value is PollResultVisibility {
  return POLL_RESULT_VISIBILITIES.includes(value as PollResultVisibility);
}

function isPollOptionSource(value: unknown): value is PollOptionSource {
  return POLL_OPTION_SOURCES.includes(value as PollOptionSource);
}

function isPollStatus(value: unknown): value is PollStatus {
  return POLL_STATUSES.includes(value as PollStatus);
}

function isNullablePollFinalDecisionBasis(
  value: unknown
): value is PollFinalDecisionBasis | null {
  return (
    value === null ||
    value === "advisory_poll_result" ||
    value === "advisory_admin_override" ||
    value === "binding_computed" ||
    value === "binding_cutoff_tiebreak"
  );
}

function isProjectionAudienceValid(value: Record<string, unknown>) {
  if (value.purpose === "tournament_decision") {
    return (
      isUuid(value.tournament_id) &&
      (value.audience_kind === "tournament_division_approved"
        ? isUuid(value.tournament_bracket_id)
        : (value.audience_kind === "tournament_approved" ||
            value.audience_kind === "selected_tournament_players") &&
          value.tournament_bracket_id === null)
    );
  }
  return (
    value.purpose === "community_feedback" &&
    (value.audience_kind === "active_players" ||
      value.audience_kind === "selected_active_players") &&
    value.tournament_id === null &&
    value.tournament_bracket_id === null
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isNullableIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number
): value is number | null {
  return value === null || isIntegerBetween(value, minimum, maximum);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function readTrimmedText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function isBoundedText(
  value: unknown,
  minimum: number,
  maximum: number
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minimum &&
    value.length <= maximum
  );
}

function isNullableBoundedText(
  value: unknown,
  maximum: number
): value is string | null {
  return value === null || isBoundedText(value, 1, maximum);
}
