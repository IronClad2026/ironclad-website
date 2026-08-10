import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  TransactionalEmailTemplateData,
  TransactionalEmailTemplateKey,
} from "@/lib/transactional-email/templates";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPLICIT_TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

export type TransactionalEmailEligibilityClaim = {
  id: string;
  recipientClerkUserId: string;
  type: string;
  eventKey: string;
  templateKey: TransactionalEmailTemplateKey;
  tournamentId: string | null;
  registrationId: string | null;
  matchId: string | null;
  metadata: Record<string, unknown>;
  attemptCount: number;
  claimToken: string;
};

export type TransactionalEmailEligibilityCode =
  | "CANONICAL_EVENT_INVALID"
  | "EVENT_TYPE_UNSUPPORTED"
  | "REGISTRATION_OBSOLETE"
  | "REGISTRATION_CONTEXT_CHANGED"
  | "RECIPIENT_MISMATCH"
  | "MATCH_OBSOLETE"
  | "ACTIVATION_MISMATCH"
  | "REOPENED_ACTIVATION"
  | "DIVISION_NOT_LAUNCHED"
  | "MATCH_NOT_ACTIONABLE"
  | "RESULT_ACTIVITY_PRESENT"
  | "ROUND_NOT_ELIGIBLE"
  | "DEADLINE_CHANGED"
  | "REMINDER_WINDOW_OBSOLETE"
  | "DISPLAY_CONTEXT_INVALID";

export type TransactionalEmailEligibilityResult =
  | {
      eligible: true;
      templateKey: TransactionalEmailTemplateKey;
      data: TransactionalEmailTemplateData;
    }
  | {
      eligible: false;
      disposition: "skipped" | "permanent_failure";
      code: TransactionalEmailEligibilityCode;
    };

export class TransactionalEmailEligibilityLookupError extends Error {
  readonly code = "ELIGIBILITY_LOOKUP_FAILED";

  constructor() {
    super("Transactional email eligibility lookup failed.");
    this.name = "TransactionalEmailEligibilityLookupError";
  }
}

type RegistrationRow = {
  id: string;
  clerk_user_id: string;
  registration_status: string;
  tournament_id: string | null;
  tournament_bracket_id: string | null;
};

type TournamentRow = {
  id: string;
  title: string | null;
};

type TournamentBracketRow = {
  id: string;
  tournament_id: string;
  name: string | null;
};

type MatchParticipantRow = {
  id: string;
  clerk_user_id: string;
  player_name: string | null;
};

type BracketRoundRow = {
  id: string;
  generated_bracket_id: string;
  round_number: number;
  name: string | null;
};

type MatchTournamentBracketRow = {
  id: string;
  tournament_id: string;
  name: string | null;
  launched_at: string | null;
  tournaments?: TournamentRow | TournamentRow[] | null;
};

type GeneratedBracketRow = {
  id: string;
  format: string;
  tournament_brackets?:
    | MatchTournamentBracketRow
    | MatchTournamentBracketRow[]
    | null;
};

type MatchRow = {
  id: string;
  generated_bracket_id: string;
  match_number: number;
  status: string;
  activation_version: number;
  activated_at: string | null;
  deadline_at: string | null;
  outcome_type: string | null;
  deadline_ruled_at: string | null;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  player_one_score: number | null;
  player_two_score: number | null;
  winner_registration_id: string | null;
  official_result_submission_id: string | null;
  official_result_decided_by: string | null;
  official_result_decided_at: string | null;
  hold_started_at: string | null;
  hold_released_at: string | null;
  player_one?: MatchParticipantRow | MatchParticipantRow[] | null;
  player_two?: MatchParticipantRow | MatchParticipantRow[] | null;
  bracket_rounds?: BracketRoundRow | BracketRoundRow[] | null;
  generated_brackets?: GeneratedBracketRow | GeneratedBracketRow[] | null;
};

type ReportGroupRow = {
  status: string;
  finalized_at: string | null;
  result_type: string | null;
  no_show_status: string | null;
};

type ResultSubmissionRow = {
  status: string;
};

type FeederMatchRow = {
  match_number: number;
  status: string;
  winner_registration_id: string | null;
  outcome_type: string | null;
};

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

function skipped(
  code: TransactionalEmailEligibilityCode
): TransactionalEmailEligibilityResult {
  return { eligible: false, disposition: "skipped", code };
}

function permanentFailure(
  code: TransactionalEmailEligibilityCode
): TransactionalEmailEligibilityResult {
  return { eligible: false, disposition: "permanent_failure", code };
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedDisplayValue(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataPositiveInteger(
  metadata: Record<string, unknown>,
  key: string
): number | null {
  const value = metadata[key];
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

function parseCanonicalTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !EXPLICIT_TIMEZONE_PATTERN.test(value)
  ) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isBaseClaimValid(claim: TransactionalEmailEligibilityClaim) {
  return (
    isUuid(claim.id) &&
    isNonBlank(claim.recipientClerkUserId) &&
    isNonBlank(claim.eventKey) &&
    claim.eventKey === claim.eventKey.trim() &&
    isUuid(claim.claimToken) &&
    Number.isInteger(claim.attemptCount) &&
    claim.attemptCount >= 1 &&
    claim.attemptCount <= 5 &&
    claim.metadata !== null &&
    typeof claim.metadata === "object" &&
    !Array.isArray(claim.metadata)
  );
}

function throwLookupFailure(): never {
  throw new TransactionalEmailEligibilityLookupError();
}

function hasBlockingReportGroup(rows: ReportGroupRow[]) {
  return rows.some((row) => {
    if (
      row.result_type === "no_show" &&
      ["pending", "confirmed", "disputed", "approved", "auto_confirmed"].includes(
        row.no_show_status ?? ""
      )
    ) {
      return true;
    }

    if (["confirmed", "auto_approved", "approved"].includes(row.status)) {
      return true;
    }

    return (
      ["pending_confirmation", "disputed", "under_review"].includes(
        row.status
      ) && row.finalized_at === null
    );
  });
}

async function loadRegistrationEligibility(
  supabase: SupabaseAdminClient,
  claim: TransactionalEmailEligibilityClaim
): Promise<TransactionalEmailEligibilityResult> {
  if (
    claim.type !== "registration.approved" ||
    claim.templateKey !== "registration_approved"
  ) {
    return permanentFailure("EVENT_TYPE_UNSUPPORTED");
  }

  const registrationId = claim.registrationId;
  const tournamentId = claim.tournamentId;
  const metadataRegistrationId = metadataString(
    claim.metadata,
    "registrationId"
  );
  const metadataTournamentId = metadataString(claim.metadata, "tournamentId");
  const bracketId = metadataString(claim.metadata, "bracketId");

  if (
    !isUuid(registrationId) ||
    !isUuid(tournamentId) ||
    !isUuid(metadataRegistrationId) ||
    !isUuid(metadataTournamentId) ||
    !isUuid(bracketId) ||
    metadataRegistrationId !== registrationId ||
    metadataTournamentId !== tournamentId ||
    claim.matchId !== null ||
    claim.eventKey !== `registration:${registrationId}:approved`
  ) {
    return permanentFailure("CANONICAL_EVENT_INVALID");
  }

  const registrationResult = await supabase
    .from("registrations")
    .select(
      "id, clerk_user_id, registration_status, tournament_id, tournament_bracket_id"
    )
    .eq("id", registrationId)
    .maybeSingle();

  if (registrationResult.error) throwLookupFailure();
  if (!registrationResult.data) return skipped("REGISTRATION_OBSOLETE");

  const registration = registrationResult.data as RegistrationRow;
  if (registration.clerk_user_id !== claim.recipientClerkUserId) {
    return skipped("RECIPIENT_MISMATCH");
  }
  if (registration.registration_status !== "approved") {
    return skipped("REGISTRATION_OBSOLETE");
  }
  if (
    registration.tournament_id !== tournamentId ||
    registration.tournament_bracket_id !== bracketId
  ) {
    return skipped("REGISTRATION_CONTEXT_CHANGED");
  }

  const [tournamentResult, bracketResult] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, title")
      .eq("id", tournamentId)
      .maybeSingle(),
    supabase
      .from("tournament_brackets")
      .select("id, tournament_id, name")
      .eq("id", bracketId)
      .maybeSingle(),
  ]);

  if (tournamentResult.error || bracketResult.error) throwLookupFailure();
  if (!tournamentResult.data || !bracketResult.data) {
    return skipped("REGISTRATION_CONTEXT_CHANGED");
  }

  const tournament = tournamentResult.data as TournamentRow;
  const bracket = bracketResult.data as TournamentBracketRow;
  const tournamentName = normalizedDisplayValue(tournament.title);
  const divisionName = normalizedDisplayValue(bracket.name);

  if (
    tournament.id !== tournamentId ||
    bracket.id !== bracketId ||
    bracket.tournament_id !== tournamentId
  ) {
    return skipped("REGISTRATION_CONTEXT_CHANGED");
  }
  if (!tournamentName || !divisionName) {
    return permanentFailure("DISPLAY_CONTEXT_INVALID");
  }

  const data: TransactionalEmailTemplateData = {
    templateKey: "registration_approved",
    tournamentName,
    divisionName,
    registrationId,
  };

  return { eligible: true, templateKey: claim.templateKey, data };
}

function validateMatchCanonicalEvent(
  claim: TransactionalEmailEligibilityClaim
):
  | {
      matchId: string;
      registrationId: string;
      tournamentId: string;
      bracketId: string;
      activationVersion: number;
      deadlineTimestamp: number;
      roundNumber: number | null;
      reminderOrdinal: 1 | 2 | null;
    }
  | TransactionalEmailEligibilityResult {
  const matchId = claim.matchId;
  const registrationId = claim.registrationId;
  const tournamentId = claim.tournamentId;
  const metadataMatchId = metadataString(claim.metadata, "matchId");
  const metadataTournamentId = metadataString(claim.metadata, "tournamentId");
  const bracketId = metadataString(claim.metadata, "bracketId");
  const activationVersion = metadataPositiveInteger(
    claim.metadata,
    "activationVersion"
  );
  const deadlineTimestamp = parseCanonicalTimestamp(
    claim.metadata.deadlineAt
  );

  if (
    !isUuid(matchId) ||
    !isUuid(registrationId) ||
    !isUuid(tournamentId) ||
    !isUuid(metadataMatchId) ||
    !isUuid(metadataTournamentId) ||
    !isUuid(bracketId) ||
    metadataMatchId !== matchId ||
    metadataTournamentId !== tournamentId ||
    activationVersion === null ||
    deadlineTimestamp === null
  ) {
    return permanentFailure("CANONICAL_EVENT_INVALID");
  }

  if (activationVersion !== 1) {
    return skipped("REOPENED_ACTIVATION");
  }

  if (Object.hasOwn(claim.metadata, "reopened")) {
    return skipped("REOPENED_ACTIVATION");
  }

  if (claim.type === "match.ready") {
    const roundNumber = metadataPositiveInteger(claim.metadata, "roundNumber");
    if (
      (claim.templateKey !== "division_started_first_match" &&
        claim.templateKey !== "later_round_match_ready") ||
      claim.metadata.deadlineEvent !== "ready" ||
      roundNumber === null ||
      claim.eventKey !==
        `match:${matchId}:activation:${activationVersion}:ready`
    ) {
      return permanentFailure("CANONICAL_EVENT_INVALID");
    }

    return {
      matchId,
      registrationId,
      tournamentId,
      bracketId,
      activationVersion,
      deadlineTimestamp,
      roundNumber,
      reminderOrdinal: null,
    };
  }

  if (claim.type === "match.deadline_reminder") {
    const expectedOrdinal =
      claim.templateKey === "deadline_reminder_72h"
        ? 1
        : claim.templateKey === "deadline_reminder_24h"
          ? 2
          : null;
    const reminderOrdinal = metadataPositiveInteger(
      claim.metadata,
      "reminderOrdinal"
    );

    if (
      expectedOrdinal === null ||
      reminderOrdinal !== expectedOrdinal ||
      claim.metadata.deadlineEvent !== "reminder" ||
      claim.eventKey !==
        `match:${matchId}:activation:${activationVersion}:reminder:${expectedOrdinal}`
    ) {
      return permanentFailure("CANONICAL_EVENT_INVALID");
    }

    return {
      matchId,
      registrationId,
      tournamentId,
      bracketId,
      activationVersion,
      deadlineTimestamp,
      roundNumber: null,
      reminderOrdinal: expectedOrdinal,
    };
  }

  return permanentFailure("EVENT_TYPE_UNSUPPORTED");
}

async function loadMatchEligibility(
  supabase: SupabaseAdminClient,
  claim: TransactionalEmailEligibilityClaim,
  now: Date
): Promise<TransactionalEmailEligibilityResult> {
  const canonical = validateMatchCanonicalEvent(claim);
  if ("eligible" in canonical) return canonical;

  const matchResult = await supabase
    .from("tournament_matches")
    .select(
      "id, generated_bracket_id, match_number, status, activation_version, activated_at, deadline_at, outcome_type, deadline_ruled_at, player_one_registration_id, player_two_registration_id, player_one_score, player_two_score, winner_registration_id, official_result_submission_id, official_result_decided_by, official_result_decided_at, hold_started_at, hold_released_at, player_one:registrations!tournament_matches_player_one_registration_id_fkey(id, clerk_user_id, player_name), player_two:registrations!tournament_matches_player_two_registration_id_fkey(id, clerk_user_id, player_name), bracket_rounds!inner(id, generated_bracket_id, round_number, name), generated_brackets!inner(id, format, tournament_brackets!inner(id, tournament_id, name, launched_at, tournaments!inner(id, title)))"
    )
    .eq("id", canonical.matchId)
    .maybeSingle();

  if (matchResult.error) throwLookupFailure();
  if (!matchResult.data) return skipped("MATCH_OBSOLETE");

  const match = matchResult.data as unknown as MatchRow;
  const round = first(match.bracket_rounds);
  const generatedBracket = first(match.generated_brackets);
  const bracket = first(generatedBracket?.tournament_brackets);
  const tournament = first(bracket?.tournaments);
  const playerOne = first(match.player_one);
  const playerTwo = first(match.player_two);

  if (
    match.id !== canonical.matchId ||
    !round ||
    !generatedBracket ||
    !bracket ||
    !tournament ||
    round.generated_bracket_id !== match.generated_bracket_id ||
    generatedBracket.id !== match.generated_bracket_id ||
    generatedBracket.format !== "single_elimination" ||
    bracket.id !== canonical.bracketId ||
    bracket.tournament_id !== canonical.tournamentId ||
    tournament.id !== canonical.tournamentId
  ) {
    return skipped("MATCH_OBSOLETE");
  }

  if (bracket.launched_at === null) {
    return skipped("DIVISION_NOT_LAUNCHED");
  }
  if (match.activation_version !== canonical.activationVersion) {
    return skipped("ACTIVATION_MISMATCH");
  }

  if (
    match.player_one_registration_id === null ||
    match.player_two_registration_id === null ||
    match.player_one_registration_id === match.player_two_registration_id ||
    !playerOne ||
    !playerTwo
  ) {
    return skipped("MATCH_NOT_ACTIONABLE");
  }

  const recipient =
    canonical.registrationId === match.player_one_registration_id
      ? playerOne
      : canonical.registrationId === match.player_two_registration_id
        ? playerTwo
        : null;
  const opponent = recipient === playerOne ? playerTwo : playerOne;

  if (
    !recipient ||
    recipient.id !== canonical.registrationId ||
    recipient.clerk_user_id !== claim.recipientClerkUserId
  ) {
    return skipped("RECIPIENT_MISMATCH");
  }

  if (
    match.status !== "in_progress" ||
    match.activated_at === null ||
    match.deadline_at === null ||
    match.outcome_type !== null ||
    match.deadline_ruled_at !== null ||
    match.player_one_score !== null ||
    match.player_two_score !== null ||
    match.winner_registration_id !== null ||
    match.official_result_submission_id !== null ||
    match.official_result_decided_by !== null ||
    match.official_result_decided_at !== null
  ) {
    return skipped("MATCH_NOT_ACTIONABLE");
  }

  if (match.hold_started_at !== null && match.hold_released_at === null) {
    return skipped("MATCH_NOT_ACTIONABLE");
  }

  const currentDeadlineTimestamp = Date.parse(match.deadline_at);
  if (!Number.isFinite(currentDeadlineTimestamp)) {
    return skipped("MATCH_NOT_ACTIONABLE");
  }

  if (
    canonical.reminderOrdinal !== null &&
    currentDeadlineTimestamp !== canonical.deadlineTimestamp
  ) {
    return skipped("DEADLINE_CHANGED");
  }

  if (currentDeadlineTimestamp <= now.getTime()) {
    return skipped(
      canonical.reminderOrdinal === null
        ? "MATCH_NOT_ACTIONABLE"
        : "REMINDER_WINDOW_OBSOLETE"
    );
  }

  if (
    canonical.roundNumber !== null &&
    canonical.roundNumber !== round.round_number
  ) {
    return permanentFailure("CANONICAL_EVENT_INVALID");
  }

  if (claim.templateKey === "division_started_first_match") {
    if (round.round_number !== 1) {
      return skipped("ROUND_NOT_ELIGIBLE");
    }
  } else if (claim.templateKey === "later_round_match_ready") {
    const lastRoundResult = await supabase
      .from("bracket_rounds")
      .select("round_number")
      .eq("generated_bracket_id", match.generated_bracket_id)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRoundResult.error) throwLookupFailure();
    const lastRoundNumber = lastRoundResult.data?.round_number;
    if (
      !Number.isInteger(lastRoundNumber) ||
      round.round_number <= 1 ||
      (round.round_number !== lastRoundNumber &&
        round.round_number !== lastRoundNumber - 1)
    ) {
      return skipped("ROUND_NOT_ELIGIBLE");
    }

    const priorRoundResult = await supabase
      .from("bracket_rounds")
      .select("id")
      .eq("generated_bracket_id", match.generated_bracket_id)
      .eq("round_number", round.round_number - 1)
      .maybeSingle();

    if (priorRoundResult.error) throwLookupFailure();
    if (!isUuid(priorRoundResult.data?.id)) {
      return skipped("ROUND_NOT_ELIGIBLE");
    }

    const expectedLeftMatchNumber = (match.match_number * 2) - 1;
    const expectedRightMatchNumber = match.match_number * 2;
    const feedersResult = await supabase
      .from("tournament_matches")
      .select("match_number, status, winner_registration_id, outcome_type")
      .eq("generated_bracket_id", match.generated_bracket_id)
      .eq("round_id", priorRoundResult.data.id)
      .in("match_number", [
        expectedLeftMatchNumber,
        expectedRightMatchNumber,
      ]);

    if (feedersResult.error) throwLookupFailure();
    const feeders = (feedersResult.data ?? []) as FeederMatchRow[];
    const leftFeeder = feeders.find(
      (feeder) => feeder.match_number === expectedLeftMatchNumber
    );
    const rightFeeder = feeders.find(
      (feeder) => feeder.match_number === expectedRightMatchNumber
    );

    if (
      feeders.length !== 2 ||
      !leftFeeder ||
      !rightFeeder ||
      leftFeeder.status !== "completed" ||
      rightFeeder.status !== "completed" ||
      leftFeeder.outcome_type !== null ||
      rightFeeder.outcome_type !== null ||
      leftFeeder.winner_registration_id !==
        match.player_one_registration_id ||
      rightFeeder.winner_registration_id !==
        match.player_two_registration_id
    ) {
      return skipped("MATCH_NOT_ACTIONABLE");
    }
  }

  const [reportGroupsResult, submissionsResult] = await Promise.all([
    supabase
      .from("match_result_report_groups")
      .select("status, finalized_at, result_type, no_show_status")
      .eq("match_id", canonical.matchId),
    supabase
      .from("match_result_submissions")
      .select("status")
      .eq("match_id", canonical.matchId),
  ]);

  if (reportGroupsResult.error || submissionsResult.error) {
    throwLookupFailure();
  }

  if (
    hasBlockingReportGroup(
      (reportGroupsResult.data ?? []) as ReportGroupRow[]
    ) ||
    ((submissionsResult.data ?? []) as ResultSubmissionRow[]).some(
      (submission) => submission.status === "pending"
    )
  ) {
    return skipped("RESULT_ACTIVITY_PRESENT");
  }

  const remainingMilliseconds = currentDeadlineTimestamp - now.getTime();
  const hours24 = 24 * 60 * 60 * 1000;
  const hours72 = 72 * 60 * 60 * 1000;

  if (
    (canonical.reminderOrdinal === 1 &&
      (remainingMilliseconds <= hours24 ||
        remainingMilliseconds > hours72)) ||
    (canonical.reminderOrdinal === 2 && remainingMilliseconds > hours24)
  ) {
    return skipped("REMINDER_WINDOW_OBSOLETE");
  }

  const tournamentName = normalizedDisplayValue(tournament.title);
  const divisionName = normalizedDisplayValue(bracket.name);
  const roundName = normalizedDisplayValue(round.name);
  const opponentName = normalizedDisplayValue(opponent.player_name);

  if (!tournamentName || !divisionName || !roundName || !opponentName) {
    return permanentFailure("DISPLAY_CONTEXT_INVALID");
  }

  const deadlineAt = new Date(currentDeadlineTimestamp).toISOString();
  const commonData = {
    tournamentName,
    tournamentId: canonical.tournamentId,
    divisionName,
    roundName,
    opponentName,
    matchId: canonical.matchId,
    deadlineAt,
  };

  const data = {
    ...commonData,
    templateKey: claim.templateKey,
  } as TransactionalEmailTemplateData;

  return { eligible: true, templateKey: claim.templateKey, data };
}

export async function checkTransactionalEmailEligibility(
  claim: TransactionalEmailEligibilityClaim,
  now = new Date()
): Promise<TransactionalEmailEligibilityResult> {
  if (!isBaseClaimValid(claim) || !Number.isFinite(now.getTime())) {
    return permanentFailure("CANONICAL_EVENT_INVALID");
  }

  const supabase = createSupabaseAdminClient();

  if (claim.templateKey === "registration_approved") {
    return loadRegistrationEligibility(supabase, claim);
  }

  return loadMatchEligibility(supabase, claim, now);
}
