"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import {
  getIronCladDivision,
  type IronCladDivision,
} from "@/lib/elo-verification/divisions";
import { type RelicEloResult } from "@/lib/elo-verification/relic";
import {
  getRegistrationRelic1v1Elo,
  type RegistrationRelicEloResult,
} from "@/lib/elo-verification/staging-synthetic-academy";
import { createInAppNotification } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getRequestLocale } from "@/lib/i18n/request";
import {
  isTournamentRegistrationOpen as isTournamentEventRegistrationOpen,
  WAITLIST_DISCLOSURE_MESSAGE,
} from "@/lib/tournaments";

const REGISTRATION_UNAVAILABLE_MESSAGE =
  "This tournament is full or already in progress. We hope to see you in the next one.";
const REGISTRATION_FAILED_MESSAGE =
  "Registration could not be submitted. Please try again or contact an admin.";
const DUPLICATE_REGISTRATION_MESSAGE =
  "You are already registered for this tournament.";
const WRONG_DIVISION_MESSAGE =
  "Your ELO division has changed. Refresh your verified ELO from the Profile page and try again.";
const WAITLIST_CONFIRMATION_REQUIRED_MESSAGE = `${WAITLIST_DISCLOSURE_MESSAGE} Review this notice, then press Join Waitlist to continue.`;
const PLAYER_SELECT = [
  "id",
  "clerk_user_id",
  "in_game_name",
  "steam_id64",
  "profile_completed",
].join(", ");
const TOURNAMENT_SELECT = [
  "id",
  "title",
  "status",
  "registration_open_at",
  "registration_close_at",
  "registration_enabled",
  "tournament_brackets!inner(id, name, launched_at)",
].join(", ");

type TournamentRegistrationInput = {
  tournamentId: string;
  bracketId: string;
  tournamentTitle: string;
  bracketName: string;
  rulebookDocumentId: string;
  ppaDocumentId: string;
  termsDocumentId: string;
  privacyDocumentId: string;
  rulebookAgreement: boolean;
  playerParticipationAgreement: boolean;
  termsAgreement: boolean;
  privacyAcknowledgement: boolean;
  age18Confirmation: boolean;
  accountAndSteamOwnershipConfirmation: boolean;
  waitlistConfirmed: boolean;
};

export type TournamentRegistrationResult = {
  success: boolean;
  message: string;
  code: TournamentRegistrationCode;
  values?: Record<string, string | number>;
  requiresProfile?: boolean;
  requiresWaitlistConfirmation?: boolean;
};

export type TournamentRegistrationCode =
  | "LOCALE_REGISTRATION_GATE"
  | "AUTH_REQUIRED"
  | "INVALID_INPUT"
  | "SERVICE_UNAVAILABLE"
  | "PROFILE_VERIFICATION_FAILED"
  | "PROFILE_REQUIRED"
  | "STEAM_REQUIRED"
  | "DUPLICATE_REGISTRATION"
  | "TOURNAMENT_UNAVAILABLE"
  | "REGISTRATION_UNAVAILABLE"
  | "RELIC_UNAVAILABLE"
  | "STEAM_IDENTITY_INVALID"
  | "RELIC_PROFILE_NOT_FOUND"
  | "STEAM_IDENTITY_MISMATCH"
  | "ELO_UNAVAILABLE"
  | "ELO_VERIFICATION_FAILED"
  | "DIVISION_MISMATCH"
  | "LEGAL_DOCUMENTS_UNAVAILABLE"
  | "WAITLIST_QUEUE_ACTIVE"
  | "BRACKET_FULL"
  | "WAITLIST_CONFIRMATION_REQUIRED"
  | "REGISTRATION_FAILED"
  | "REGISTRATION_SUBMITTED"
  | "WAITLIST_SUBMITTED";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type RegistrationIdentity = {
  id: string;
  inGameName: string;
  steamId64: string | null;
  profileCompleted: boolean;
};
type RegistrationTournament = {
  id: string;
  title: string;
  status: string;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  registrationEnabled: boolean;
  bracket: {
    id: string;
    name: string;
    division: IronCladDivision;
    launchedAt: string | null;
  };
};
type SavedRegistration = {
  id: string;
  tournamentId: string;
  tournamentBracketId: string;
  registrationStatus: "pending" | "waitlisted";
  submittedElo: number;
};
type RegistrationTransactionResult =
  | { waitlistConfirmationRequired: true }
  | {
      waitlistConfirmationRequired: false;
      registration: SavedRegistration;
    };

export async function submitTournamentRegistration(
  input: TournamentRegistrationInput
): Promise<TournamentRegistrationResult> {
  const locale = await getRequestLocale();

  if (locale !== "en") {
    return {
      success: false,
      code: "LOCALE_REGISTRATION_GATE",
      message:
        "Registration is currently available only through the Effective English governing corpus.",
    };
  }

  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Tournament registration authentication failed.");
    return failure("Your session could not be verified. Sign in again.", "AUTH_REQUIRED");
  }

  if (!userId) {
    return failure("Sign in before registering for a tournament.", "AUTH_REQUIRED");
  }

  await requireCurrentAccountLegalAcceptance();

  if (!isValidRegistrationInput(input)) {
    return failure(
      "Complete the tournament selection and required agreements.",
      "INVALID_INPUT"
    );
  }

  let supabase: SupabaseAdminClient;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    console.error("Tournament registration service configuration failed.");
    return failure(REGISTRATION_FAILED_MESSAGE, "SERVICE_UNAVAILABLE");
  }

  const identity = await loadRegistrationIdentity(supabase, userId);

  if (identity.status === "error") {
    return failure(
      "IronClad could not verify your player profile.",
      "PROFILE_VERIFICATION_FAILED"
    );
  }

  if (identity.status === "missing") {
    return {
      success: false,
      code: "PROFILE_REQUIRED",
      message: "Complete your player profile before registering.",
      requiresProfile: true,
    };
  }

  if (!identity.player.steamId64) {
    return failure(
      "Connect your Steam account before registering for a tournament.",
      "STEAM_REQUIRED"
    );
  }

  const duplicateCheck = await hasExistingRegistration(
    supabase,
    userId,
    input.tournamentId
  );

  if (duplicateCheck === "error") {
    return failure(REGISTRATION_FAILED_MESSAGE, "REGISTRATION_FAILED");
  }

  if (duplicateCheck) {
    return failure(DUPLICATE_REGISTRATION_MESSAGE, "DUPLICATE_REGISTRATION");
  }

  const tournamentResult = await loadRegistrationTournament(
    supabase,
    input.tournamentId,
    input.bracketId
  );

  if (tournamentResult.status === "error") {
    return failure(
      "The selected tournament or bracket is no longer available.",
      "TOURNAMENT_UNAVAILABLE"
    );
  }

  if (tournamentResult.status === "missing") {
    return failure(
      "The selected tournament or bracket is no longer available.",
      "TOURNAMENT_UNAVAILABLE"
    );
  }

  const tournament = tournamentResult.tournament;

  if (!isTournamentRegistrationOpen(tournament)) {
    return failure(REGISTRATION_UNAVAILABLE_MESSAGE, "REGISTRATION_UNAVAILABLE");
  }

  let relicResult: RegistrationRelicEloResult;

  try {
    relicResult = await getRegistrationRelic1v1Elo({
      supabase,
      identity: {
        playerId: identity.player.id,
        clerkUserId: userId,
        steamId64: identity.player.steamId64,
      },
    });
  } catch {
    console.error("Tournament registration Relic request failed unexpectedly.");
    return failure(
      "Relic is temporarily unavailable. Please try registering again later.",
      "RELIC_UNAVAILABLE"
    );
  }

  if (relicResult.status !== "rated") {
    return mapRelicFailure(relicResult);
  }

  const calculatedDivision = getIronCladDivision(relicResult.elo);

  if (
    !calculatedDivision.ok ||
    calculatedDivision.division !== relicResult.division ||
    calculatedDivision.division !== tournament.bracket.division
  ) {
    return failure(WRONG_DIVISION_MESSAGE, "DIVISION_MISMATCH");
  }

  let registrationResult: { data: unknown; error: unknown };

  try {
    registrationResult = await supabase.rpc(
      "submit_verified_player_registration",
      {
        p_profile_id: identity.player.id,
        p_clerk_user_id: userId,
        p_steam_id64: identity.player.steamId64,
        p_tournament_id: tournament.id,
        p_tournament_bracket_id: tournament.bracket.id,
        p_relic_elo: relicResult.elo,
        p_relic_faction: relicResult.faction,
        p_relic_division: relicResult.division,
        p_relic_calculation_version: relicResult.calculationVersion,
        p_rulebook_document_id: input.rulebookDocumentId,
        p_ppa_document_id: input.ppaDocumentId,
        p_terms_document_id: input.termsDocumentId,
        p_privacy_document_id: input.privacyDocumentId,
        p_rulebook_accepted: input.rulebookAgreement,
        p_ppa_accepted: input.playerParticipationAgreement,
        p_terms_accepted: input.termsAgreement,
        p_privacy_acknowledged: input.privacyAcknowledgement,
        p_age_18_confirmed: input.age18Confirmation,
        p_account_and_steam_ownership_confirmed:
          input.accountAndSteamOwnershipConfirmation,
        p_waitlist_confirmed: input.waitlistConfirmed,
      }
    );
  } catch {
    console.error("Tournament registration transaction failed unexpectedly.");
    return failure(REGISTRATION_FAILED_MESSAGE, "REGISTRATION_FAILED");
  }

  if (registrationResult.error) {
    console.error("Tournament registration transaction failed.");
    const registrationFailure = getRegistrationFailure(registrationResult.error);
    return failure(registrationFailure.message, registrationFailure.code);
  }

  const transactionResult = parseRegistrationTransactionResult(
    registrationResult.data,
    tournament.id,
    tournament.bracket.id,
    relicResult.elo
  );

  if (!transactionResult) {
    console.error("Tournament registration transaction returned an invalid result.");
    return failure(REGISTRATION_FAILED_MESSAGE, "REGISTRATION_FAILED");
  }

  if (transactionResult.waitlistConfirmationRequired) {
    return {
      success: false,
      code: "WAITLIST_CONFIRMATION_REQUIRED",
      message: WAITLIST_CONFIRMATION_REQUIRED_MESSAGE,
      requiresWaitlistConfirmation: true,
    };
  }

  const savedRegistration = transactionResult.registration;

  revalidateRegistrationPaths();

  const waitlistPosition =
    savedRegistration.registrationStatus === "waitlisted"
      ? await loadWaitlistPosition(
          supabase,
          savedRegistration.tournamentBracketId,
          savedRegistration.id
        )
      : null;

  try {
    await createInAppNotification({
      recipientRole: "admin",
      type: "registration.submitted",
      title: "New Tournament Registration",
      message: `${identity.player.inGameName} registered for ${tournament.title}.`,
      actorClerkUserId: userId,
      actorDisplayName: identity.player.inGameName,
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      registrationId: savedRegistration.id,
      metadata: {
        bracketId: savedRegistration.tournamentBracketId,
        bracketName: tournament.bracket.name,
        registrationStatus: savedRegistration.registrationStatus,
        waitlistPosition,
      },
    });
  } catch {
    console.error("Tournament registration notification failed unexpectedly.");
  }

  return {
    success: true,
    code:
      savedRegistration.registrationStatus === "waitlisted"
        ? "WAITLIST_SUBMITTED"
        : "REGISTRATION_SUBMITTED",
    values: waitlistPosition ? { position: waitlistPosition } : undefined,
    message:
      savedRegistration.registrationStatus === "waitlisted"
        ? `Registration submitted to waitlist${
            waitlistPosition ? ` position #${waitlistPosition}` : ""
          }.`
        : "Registration submitted.",
  };
}

async function loadRegistrationIdentity(
  supabase: SupabaseAdminClient,
  userId: string
): Promise<
  | { status: "loaded"; player: RegistrationIdentity }
  | { status: "missing" }
  | { status: "error" }
> {
  let result: { data: unknown; error: unknown };

  try {
    result = await supabase
      .from("players")
      .select(PLAYER_SELECT)
      .eq("clerk_user_id", userId)
      .maybeSingle();
  } catch {
    console.error("Tournament registration player lookup failed unexpectedly.");
    return { status: "error" };
  }

  if (result.error) {
    console.error("Tournament registration player lookup failed.");
    return { status: "error" };
  }

  const player = parseRegistrationIdentity(result.data, userId);

  if (!player || !player.profileCompleted) {
    return { status: "missing" };
  }

  return { status: "loaded", player };
}

async function hasExistingRegistration(
  supabase: SupabaseAdminClient,
  userId: string,
  tournamentId: string
): Promise<boolean | "error"> {
  let result: { data: unknown; error: unknown };

  try {
    result = await supabase
      .from("registrations")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
  } catch {
    console.error(
      "Tournament registration duplicate check failed unexpectedly."
    );
    return "error";
  }

  if (result.error) {
    console.error("Tournament registration duplicate check failed.");
    return "error";
  }

  if (result.data === null) {
    return false;
  }

  if (!isRecord(result.data) || !isUuid(result.data.id)) {
    console.error("Tournament registration duplicate check was invalid.");
    return "error";
  }

  return true;
}

async function loadRegistrationTournament(
  supabase: SupabaseAdminClient,
  tournamentId: string,
  bracketId: string
): Promise<
  | { status: "loaded"; tournament: RegistrationTournament }
  | { status: "missing" }
  | { status: "error" }
> {
  let result: { data: unknown; error: unknown };

  try {
    result = await supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq("id", tournamentId)
      .eq("tournament_brackets.id", bracketId)
      .maybeSingle();
  } catch {
    console.error("Tournament registration tournament lookup failed unexpectedly.");
    return { status: "error" };
  }

  if (result.error) {
    console.error("Tournament registration tournament lookup failed.");
    return { status: "error" };
  }

  if (result.data === null) {
    return { status: "missing" };
  }

  const tournament = parseRegistrationTournament(
    result.data,
    tournamentId,
    bracketId
  );

  if (!tournament) {
    console.error("Tournament registration tournament lookup was invalid.");
    return { status: "error" };
  }

  return { status: "loaded", tournament };
}

async function loadWaitlistPosition(
  supabase: SupabaseAdminClient,
  tournamentBracketId: string,
  registrationId: string
) {
  let result: { data: unknown; error: unknown };

  try {
    result = await supabase
      .from("registrations")
      .select("id")
      .eq("tournament_bracket_id", tournamentBracketId)
      .eq("registration_status", "waitlisted")
      .is("waitlist_offer_status", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  } catch {
    console.error("Tournament registration waitlist lookup failed unexpectedly.");
    return null;
  }

  if (result.error || !Array.isArray(result.data)) {
    console.error("Tournament registration waitlist lookup failed.");
    return null;
  }

  const index = result.data.findIndex(
    (registration) =>
      isRecord(registration) && registration.id === registrationId
  );
  return index >= 0 ? index + 1 : null;
}

function isValidRegistrationInput(
  value: unknown
): value is TournamentRegistrationInput {
  return Boolean(
    isRecord(value) &&
      isUuid(value.tournamentId) &&
      isUuid(value.bracketId) &&
      isBoundedText(value.tournamentTitle) &&
      isBoundedText(value.bracketName) &&
      isUuid(value.rulebookDocumentId) &&
      isUuid(value.ppaDocumentId) &&
      isUuid(value.termsDocumentId) &&
      isUuid(value.privacyDocumentId) &&
      value.rulebookAgreement === true &&
      value.playerParticipationAgreement === true &&
      value.termsAgreement === true &&
      value.privacyAcknowledgement === true &&
      value.age18Confirmation === true &&
      value.accountAndSteamOwnershipConfirmation === true &&
      typeof value.waitlistConfirmed === "boolean"
  );
}

function parseRegistrationIdentity(
  value: unknown,
  userId: string
): RegistrationIdentity | null {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    value.clerk_user_id !== userId ||
    !isBoundedText(value.in_game_name) ||
    typeof value.profile_completed !== "boolean" ||
    !(
      value.steam_id64 === null ||
      (typeof value.steam_id64 === "string" &&
        value.steam_id64.length > 0 &&
        value.steam_id64.length <= 20)
    )
  ) {
    return null;
  }

  return {
    id: value.id,
    inGameName: value.in_game_name,
    steamId64: value.steam_id64,
    profileCompleted: value.profile_completed,
  };
}

function parseRegistrationTournament(
  value: unknown,
  expectedTournamentId: string,
  expectedBracketId: string
): RegistrationTournament | null {
  if (
    !isRecord(value) ||
    value.id !== expectedTournamentId ||
    !isBoundedText(value.title) ||
    typeof value.status !== "string" ||
    !isNullableTimestamp(value.registration_open_at) ||
    !isNullableTimestamp(value.registration_close_at) ||
    typeof value.registration_enabled !== "boolean" ||
    !Array.isArray(value.tournament_brackets)
  ) {
    return null;
  }

  const bracket = value.tournament_brackets.find(
    (candidate) => isRecord(candidate) && candidate.id === expectedBracketId
  );

  if (
    !isRecord(bracket) ||
    bracket.id !== expectedBracketId ||
    typeof bracket.name !== "string" ||
    !isNullableTimestamp(bracket.launched_at)
  ) {
    return null;
  }

  const division = getBracketDivision(bracket.name);

  if (!division) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    status: value.status,
    registrationOpenAt: value.registration_open_at,
    registrationCloseAt: value.registration_close_at,
    registrationEnabled: value.registration_enabled,
    bracket: {
      id: bracket.id,
      name: bracket.name,
      division,
      launchedAt: bracket.launched_at,
    },
  };
}

function parseRegistrationTransactionResult(
  value: unknown,
  expectedTournamentId: string,
  expectedBracketId: string,
  expectedElo: number
): RegistrationTransactionResult | null {
  const candidate = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : null
    : value;

  if (
    isRecord(candidate) &&
    candidate.waitlist_confirmation_required === true &&
    candidate.id === null &&
    candidate.registration_status === null
  ) {
    return { waitlistConfirmationRequired: true };
  }

  if (
    !isRecord(candidate) ||
    candidate.waitlist_confirmation_required !== false ||
    !isUuid(candidate.id) ||
    candidate.tournament_id !== expectedTournamentId ||
    candidate.tournament_bracket_id !== expectedBracketId ||
    (candidate.registration_status !== "pending" &&
      candidate.registration_status !== "waitlisted")
  ) {
    return null;
  }

  const submittedElo = parseSafeInteger(candidate.submitted_elo);

  if (submittedElo === null || submittedElo !== expectedElo) {
    return null;
  }

  return {
    waitlistConfirmationRequired: false,
    registration: {
      id: candidate.id,
      tournamentId: candidate.tournament_id,
      tournamentBracketId: candidate.tournament_bracket_id,
      registrationStatus: candidate.registration_status,
      submittedElo,
    },
  };
}

function isTournamentRegistrationOpen(tournament: RegistrationTournament) {
  return (
    tournament.bracket.launchedAt === null &&
    isTournamentEventRegistrationOpen({
      statusValue: tournament.status,
      registrationEnabled: tournament.registrationEnabled,
      registrationOpenAt: tournament.registrationOpenAt,
      registrationCloseAt: tournament.registrationCloseAt,
    })
  );
}

function getBracketDivision(name: string): IronCladDivision | null {
  if (name === "Academy") return "Academy";
  if (name === "Challenge") return "Challenge";
  if (name === "Main") return "Main / Pro";
  return null;
}

function mapRelicFailure(
  result: Exclude<RelicEloResult, { status: "rated" }>
): TournamentRegistrationResult {
  switch (result.status) {
    case "invalid_steam_input":
      return failure(
        "Your connected Steam identity could not be verified.",
        "STEAM_IDENTITY_INVALID"
      );
    case "profile_not_found":
      return failure(
        "No Company of Heroes 3 profile was found for your connected Steam account.",
        "RELIC_PROFILE_NOT_FOUND"
      );
    case "steam_identity_mismatch":
      return failure(
        "Relic could not confirm your connected game identity.",
        "STEAM_IDENTITY_MISMATCH"
      );
    case "unranked":
      return failure(
        "No rated 1v1 ELO is currently available.",
        "ELO_UNAVAILABLE"
      );
    case "invalid_relic_response":
    case "relic_integration_error":
      return failure(
        "ELO verification could not be completed right now.",
        "ELO_VERIFICATION_FAILED"
      );
    case "external_relic_unavailable":
      return failure(
        "Relic is temporarily unavailable. Please try registering again later.",
        "RELIC_UNAVAILABLE"
      );
  }
}

function getRegistrationFailure(error: unknown): {
  message: string;
  code: TournamentRegistrationCode;
} {
  const code = getErrorField(error, "code").toUpperCase();

  if (code === "23505") {
    return {
      message: DUPLICATE_REGISTRATION_MESSAGE,
      code: "DUPLICATE_REGISTRATION",
    };
  }

  return { message: REGISTRATION_FAILED_MESSAGE, code: "REGISTRATION_FAILED" };
}

function getErrorField(error: unknown, field: string) {
  return isRecord(error) && typeof error[field] === "string"
    ? error[field]
    : "";
}

function failure(
  message: string,
  code: TournamentRegistrationCode
): TournamentRegistrationResult {
  return { success: false, message, code };
}

function revalidateRegistrationPaths() {
  for (const path of [
    "/admin",
    "/admin/registrations",
    "/dashboard",
    "/tournaments",
  ]) {
    try {
      revalidatePath(path);
    } catch {
      console.error("Tournament registration cache invalidation failed.");
    }
  }
}

function parseSafeInteger(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isBoundedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 500
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
