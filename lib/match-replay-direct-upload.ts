import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const MATCH_REPLAY_BUCKET = "match-proofs";
export const MAX_MATCH_REPLAY_BYTES = 10 * 1024 * 1024;

const MAX_MATCH_REPLAY_COUNT = 5;
const ACTIVE_REPORT_GROUP_STATUSES = [
  "pending_confirmation",
  "disputed",
  "under_review",
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPLAY_OBJECT_PATTERN =
  /^game-([1-5])-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.rec$/i;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type MatchReplayFileMetadata = {
  name: string;
  size: number;
};

export type PrepareMatchReplayUploadsInput = {
  matchId: string;
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
  replayFiles: MatchReplayFileMetadata[];
};

export type PreparedMatchReplayUpload = {
  gameNumber: number;
  path: string;
  token: string;
};

export type PreparedMatchReplayAttempt = {
  attemptId: string;
  uploads: PreparedMatchReplayUpload[];
};

export type FinalizeMatchReplayResultInput = {
  matchId: string;
  attemptId: string;
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
  notes: string;
};

export type CleanupMatchReplayUploadsInput = {
  matchId: string;
  attemptId: string;
};

export type VerifiedStoredReplay = {
  path: string;
  size: number;
  sha256: string;
};

export type CommittedMatchReplayResult = {
  report: unknown;
  match: ReplayMatchContext;
  ownedRegistrationId: string;
  verifiedReplays: VerifiedStoredReplay[];
  reconciled: boolean;
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
};

export class MatchReplayUploadError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MatchReplayUploadError";
    this.code = code;
  }
}

type ReplayMatchContext = {
  id: string;
  tournamentId: string | null;
  tournamentTitle: string | null;
  tournamentStatus: string | null;
  launchedAt: string;
  matchNumber: number;
  roundName: string;
  seriesBestOf: number;
  matchStatus: string;
  officialResultSubmissionId: string | null;
  playerOneRegistrationId: string | null;
  playerTwoRegistrationId: string | null;
  playerOneName: string | null;
  playerTwoName: string | null;
};

type AuthorizedReplayMatch = {
  match: ReplayMatchContext;
  ownedRegistrationId: string;
};

type ValidatedResult = {
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
  requiredReplayCount: number;
};

type ParsedReplayPaths = {
  attemptId: string;
  paths: string[];
};

type PreparedReplayAttemptRecord = ParsedReplayPaths & {
  requiredReplayCount: number;
};

type ReplayAttemptPreparation =
  | ({ outcome: "prepared" } & PreparedReplayAttemptRecord)
  | {
      outcome: "cleanup_required";
      attemptId: string;
      claimId: string;
      paths: string[];
    }
  | {
      outcome: "recycle_required";
      attemptId: string;
      claimId: string;
      paths: string[];
    };

type FinalizationClaim =
  | { outcome: "committed"; report: unknown; result: ValidatedResult }
  | {
      outcome: "claimed";
      claimId: string;
      paths: string[];
      result: ValidatedResult;
    };

type CleanupReplayAttemptResult = {
  outcome: "removed" | "preserved" | "already_cleaned";
  removedCount: number;
};

export async function prepareMatchReplayUploadsForPlayer(
  supabase: SupabaseAdminClient,
  clerkUserId: string,
  input: PrepareMatchReplayUploadsInput
): Promise<PreparedMatchReplayAttempt> {
  const matchId = validateMatchId(input?.matchId);
  const replayFiles = validateReplayFileMetadata(input?.replayFiles);
  const authorized = await authorizeReplayParticipant(
    supabase,
    clerkUserId,
    matchId
  );

  assertTournamentAcceptsResults(authorized.match);
  const result = validateResult(
    authorized.match,
    input?.playerOneScore,
    input?.playerTwoScore,
    input?.winnerRegistrationId
  );

  if (replayFiles.length !== result.requiredReplayCount) {
    throw replayCountError(result.requiredReplayCount);
  }

  await assertNoExistingResultActivity(supabase, authorized.match);
  let preparedAttempt: PreparedReplayAttemptRecord | null = null;
  for (let transition = 0; transition < 4 && !preparedAttempt; transition += 1) {
    const { data: attemptData, error: attemptError } = await supabase.rpc(
      "prepare_match_replay_upload_attempt",
      {
        p_match_id: matchId,
        p_submitted_by_clerk_user_id: clerkUserId,
        p_winner_registration_id: result.winnerRegistrationId,
        p_player_one_score: result.playerOneScore,
        p_player_two_score: result.playerTwoScore,
        p_declared_replay_sizes: replayFiles.map((file) => file.size),
      }
    );

    if (attemptError) throw attemptError;
    const preparation = parseReplayAttemptPreparation(
      matchId,
      result.requiredReplayCount,
      attemptData
    );

    if (preparation.outcome === "prepared") {
      preparedAttempt = preparation;
      break;
    }

    await removeClaimedReplayPaths(supabase, preparation.paths);

    if (preparation.outcome === "cleanup_required") {
      await completeClaimedReplayCleanup(
        supabase,
        preparation.attemptId,
        preparation.claimId
      );
      continue;
    }

    const { data: recycledData, error: recycledError } = await supabase.rpc(
      "complete_match_replay_attempt_recycling",
      {
        p_attempt_id: preparation.attemptId,
        p_recycle_claim_id: preparation.claimId,
        p_match_id: matchId,
        p_submitted_by_clerk_user_id: clerkUserId,
      }
    );
    if (recycledError) throw recycledError;
    const recycled = parseReplayAttemptPreparation(
      matchId,
      result.requiredReplayCount,
      recycledData
    );
    if (recycled.outcome !== "prepared") throw invalidAttemptResponse();
    preparedAttempt = recycled;
  }

  if (!preparedAttempt) {
    throw new MatchReplayUploadError(
      "ATTEMPT_TRANSITIONS",
      "The replay attempt could not be prepared safely. Please try again."
    );
  }
  const uploads: PreparedMatchReplayUpload[] = [];

  try {
    for (const [index, path] of preparedAttempt.paths.entries()) {
      const { data, error } = await supabase.storage
        .from(MATCH_REPLAY_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });

      if (
        error ||
        !data ||
        data.path !== path ||
        typeof data.token !== "string" ||
        data.token.length === 0
      ) {
        throw new MatchReplayUploadError(
          "SIGN_FAILED",
          "The replay upload could not be prepared. Please try again."
        );
      }

      uploads.push({
        gameNumber: index + 1,
        path,
        token: data.token,
      });
    }
  } catch (error) {
    await cleanupReplayAttempt(
      supabase,
      clerkUserId,
      matchId,
      preparedAttempt.attemptId
    ).catch(logReplayCleanupFailure);
    throw error;
  }

  return { attemptId: preparedAttempt.attemptId, uploads };
}

export async function finalizeMatchReplayResultForPlayer(
  supabase: SupabaseAdminClient,
  clerkUserId: string,
  input: FinalizeMatchReplayResultInput
): Promise<CommittedMatchReplayResult> {
  const matchId = validateMatchId(input?.matchId);
  const attemptId = validateAttemptId(input?.attemptId);
  const authorized = await authorizeReplayParticipant(
    supabase,
    clerkUserId,
    matchId
  );
  const expectedResult = validateResult(
    authorized.match,
    input?.playerOneScore,
    input?.playerTwoScore,
    input?.winnerRegistrationId
  );
  const notes = validateNotes(input?.notes);
  let finalizationClaimId: string | null = null;
  let finalizationStateAcquired = false;

  try {
    const { data: claimData, error: claimError } = await supabase.rpc(
      "claim_match_replay_attempt_finalization",
      {
        p_attempt_id: attemptId,
        p_match_id: matchId,
        p_submitted_by_clerk_user_id: clerkUserId,
        p_winner_registration_id: expectedResult.winnerRegistrationId,
        p_player_one_score: expectedResult.playerOneScore,
        p_player_two_score: expectedResult.playerTwoScore,
      }
    );
    if (claimError) throw claimError;
    finalizationStateAcquired = true;

    const claim = parseFinalizationClaim(
      matchId,
      attemptId,
      expectedResult,
      claimData
    );
    if (claim.outcome === "committed") {
      return {
        report: claim.report,
        match: authorized.match,
        ownedRegistrationId: authorized.ownedRegistrationId,
        verifiedReplays: [],
        reconciled: true,
        playerOneScore: claim.result.playerOneScore,
        playerTwoScore: claim.result.playerTwoScore,
        winnerRegistrationId: claim.result.winnerRegistrationId,
      };
    }

    finalizationClaimId = claim.claimId;
    const verifiedReplays = await verifyStoredReplays(supabase, claim.paths);
    const uniqueHashes = new Set(
      verifiedReplays.map((replay) => replay.sha256)
    );

    if (uniqueHashes.size !== verifiedReplays.length) {
      throw new MatchReplayUploadError(
        "DUP_REPLAY",
        "Each game requires a unique replay file. Remove duplicate replay uploads before submitting."
      );
    }

    const { data: report, error: submissionError } = await supabase.rpc(
      "commit_match_replay_attempt_result",
      {
        p_attempt_id: attemptId,
        p_finalization_claim_id: claim.claimId,
        p_match_id: matchId,
        p_submitted_by_clerk_user_id: clerkUserId,
        p_replay_content_hashes: verifiedReplays.map((replay) => replay.sha256),
        p_notes: notes || null,
      }
    );

    if (submissionError) {
      throw submissionError;
    }

    // A successful RPC is the authoritative commit boundary. Nothing after
    // this return path is allowed to delete the now-referenced replay proof.
    return {
      report,
      match: authorized.match,
      ownedRegistrationId: authorized.ownedRegistrationId,
      verifiedReplays,
      reconciled: false,
      playerOneScore: claim.result.playerOneScore,
      playerTwoScore: claim.result.playerTwoScore,
      winnerRegistrationId: claim.result.winnerRegistrationId,
    };
  } catch (error) {
    // The claim RPC binds result facts before changing attempt state. A caller
    // that supplies different, otherwise-valid facts must not turn the still-
    // prepared attempt into cleanup work or lose an immediately valid retry.
    if (
      !finalizationStateAcquired &&
      hasExactReplayDatabaseMessage(
        error,
        "Final result does not match this replay attempt"
      )
    ) {
      throw error;
    }

    try {
      const cleanup = await cleanupReplayAttempt(
        supabase,
        clerkUserId,
        matchId,
        attemptId,
        finalizationClaimId
      );
      if (cleanup.outcome === "preserved") {
        const { data: retryData, error: retryError } = await supabase.rpc(
          "claim_match_replay_attempt_finalization",
          {
            p_attempt_id: attemptId,
            p_match_id: matchId,
            p_submitted_by_clerk_user_id: clerkUserId,
            p_winner_registration_id: expectedResult.winnerRegistrationId,
            p_player_one_score: expectedResult.playerOneScore,
            p_player_two_score: expectedResult.playerTwoScore,
          }
        );
        if (retryError) throw retryError;
        const reconciled = parseFinalizationClaim(
          matchId,
          attemptId,
          expectedResult,
          retryData
        );
        if (reconciled.outcome !== "committed") {
          throw invalidAttemptResponse();
        }
        return {
          report: reconciled.report,
          match: authorized.match,
          ownedRegistrationId: authorized.ownedRegistrationId,
          verifiedReplays: [],
          reconciled: true,
          playerOneScore: reconciled.result.playerOneScore,
          playerTwoScore: reconciled.result.playerTwoScore,
          winnerRegistrationId: reconciled.result.winnerRegistrationId,
        };
      }
    } catch (cleanupError) {
      logReplayCleanupFailure(cleanupError);
      if (finalizationStateAcquired) {
        throw new MatchReplayUploadError(
          "FINALIZATION_UNCERTAIN",
          "IronClad could not confirm the final result state. Refresh this match before retrying."
        );
      }
    }
    throw error;
  }
}

export async function cleanupMatchReplayUploadsForPlayer(
  supabase: SupabaseAdminClient,
  clerkUserId: string,
  input: CleanupMatchReplayUploadsInput
): Promise<number> {
  const matchId = validateMatchId(input?.matchId);
  const attemptId = validateAttemptId(input?.attemptId);

  const cleanup = await cleanupReplayAttempt(
    supabase,
    clerkUserId,
    matchId,
    attemptId
  );
  return cleanup.removedCount;
}

async function authorizeReplayParticipant(
  supabase: SupabaseAdminClient,
  clerkUserId: string,
  matchId: string
): Promise<AuthorizedReplayMatch> {
  if (typeof clerkUserId !== "string" || clerkUserId.trim().length === 0) {
    throw new MatchReplayUploadError(
      "UNAUTHORIZED",
      "Sign in before managing match replays."
    );
  }

  const match = await loadReplayMatch(supabase, matchId);
  if (!match) {
    throw new MatchReplayUploadError(
      "MATCH_MISSING",
      "This tournament match is no longer available."
    );
  }

  const participantRegistrationIds = [
    match.playerOneRegistrationId,
    match.playerTwoRegistrationId,
  ].filter((value): value is string => Boolean(value));

  if (participantRegistrationIds.length !== 2) {
    throw new MatchReplayUploadError(
      "PARTICIPANTS",
      "Both match participants must be assigned."
    );
  }

  const { data: ownedRegistration, error } = await supabase
    .from("registrations")
    .select("id")
    .in("id", participantRegistrationIds)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error || !ownedRegistration) {
    throw new MatchReplayUploadError(
      "NOT_PARTICIPANT",
      "You can only submit results for matches you are participating in."
    );
  }

  return {
    match,
    ownedRegistrationId: ownedRegistration.id as string,
  };
}

async function loadReplayMatch(
  supabase: SupabaseAdminClient,
  matchId: string
): Promise<ReplayMatchContext | null> {
  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_number, series_best_of, status, official_result_submission_id, player_one_registration_id, player_two_registration_id, player_one:registrations!tournament_matches_player_one_registration_id_fkey(player_name), player_two:registrations!tournament_matches_player_two_registration_id_fkey(player_name), bracket_rounds!inner(name), generated_brackets!inner(tournament_brackets!inner(tournament_id, launched_at, tournaments!inner(id, title, status)))"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as {
    id: string;
    match_number: number;
    series_best_of: number;
    status: string;
    official_result_submission_id: string | null;
    player_one_registration_id: string | null;
    player_two_registration_id: string | null;
    player_one?: { player_name: string | null } | { player_name: string | null }[];
    player_two?: { player_name: string | null } | { player_name: string | null }[];
    bracket_rounds?: { name: string | null } | { name: string | null }[];
    generated_brackets?:
      | {
          tournament_brackets?:
            | {
                tournament_id: string | null;
                launched_at: string | null;
                tournaments?:
                  | { id: string; title: string | null; status: string | null }
                  | { id: string; title: string | null; status: string | null }[];
              }
            | {
                tournament_id: string | null;
                launched_at: string | null;
                tournaments?:
                  | { id: string; title: string | null; status: string | null }
                  | { id: string; title: string | null; status: string | null }[];
              }[];
        }
      | {
          tournament_brackets?:
            | {
                tournament_id: string | null;
                launched_at: string | null;
                tournaments?:
                  | { id: string; title: string | null; status: string | null }
                  | { id: string; title: string | null; status: string | null }[];
              }
            | {
                tournament_id: string | null;
                launched_at: string | null;
                tournaments?:
                  | { id: string; title: string | null; status: string | null }
                  | { id: string; title: string | null; status: string | null }[];
              }[];
        }[];
  };
  const generatedBracket = first(row.generated_brackets);
  const tournamentBracket = first(generatedBracket?.tournament_brackets);
  const tournament = first(tournamentBracket?.tournaments);
  const playerOne = first(row.player_one);
  const playerTwo = first(row.player_two);
  const round = first(row.bracket_rounds);

  if (!tournamentBracket?.launched_at) {
    return null;
  }

  return {
    id: row.id,
    tournamentId: tournament?.id ?? tournamentBracket.tournament_id ?? null,
    tournamentTitle: tournament?.title ?? null,
    tournamentStatus: tournament?.status ?? null,
    launchedAt: tournamentBracket.launched_at,
    matchNumber: row.match_number,
    roundName: round?.name ?? "",
    seriesBestOf: row.series_best_of,
    matchStatus: row.status,
    officialResultSubmissionId: row.official_result_submission_id,
    playerOneRegistrationId: row.player_one_registration_id,
    playerTwoRegistrationId: row.player_two_registration_id,
    playerOneName: playerOne?.player_name ?? null,
    playerTwoName: playerTwo?.player_name ?? null,
  };
}

function assertTournamentAcceptsResults(match: ReplayMatchContext) {
  if (
    match.tournamentStatus === "cancelled" ||
    match.tournamentStatus === "voided"
  ) {
    throw new MatchReplayUploadError(
      "TERMINAL",
      "This tournament is closed and cannot accept match results."
    );
  }
}

async function assertNoExistingResultActivity(
  supabase: SupabaseAdminClient,
  match: ReplayMatchContext
) {
  if (
    match.matchStatus === "completed" ||
    match.officialResultSubmissionId !== null
  ) {
    throw new MatchReplayUploadError(
      "OFFICIAL_RESULT",
      "This match already has an official result."
    );
  }

  const { data: reportGroup, error: reportGroupError } = await supabase
    .from("match_result_report_groups")
    .select("id")
    .eq("match_id", match.id)
    .is("finalized_at", null)
    .in("status", [...ACTIVE_REPORT_GROUP_STATUSES])
    .limit(1)
    .maybeSingle();

  if (reportGroupError) {
    throw new MatchReplayUploadError(
      "RESULT_CHECK",
      "The active match result could not be checked. Please try again."
    );
  }

  if (reportGroup) {
    throw new MatchReplayUploadError(
      "ACTIVE_RESULT",
      "This match already has a result awaiting confirmation or review."
    );
  }

  const { data: legacySubmission, error: legacySubmissionError } = await supabase
    .from("match_result_submissions")
    .select("id")
    .eq("match_id", match.id)
    .eq("status", "pending")
    .is("report_group_id", null)
    .limit(1)
    .maybeSingle();

  if (legacySubmissionError) {
    throw new MatchReplayUploadError(
      "RESULT_CHECK",
      "The active match result could not be checked. Please try again."
    );
  }

  if (legacySubmission) {
    throw new MatchReplayUploadError(
      "LEGACY_RESULT",
      "This match has a result awaiting administrator review."
    );
  }
}

function validateMatchId(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new MatchReplayUploadError(
      "BAD_MATCH",
      "This tournament match is no longer available."
    );
  }
  return value;
}

function validateAttemptId(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new MatchReplayUploadError(
      "BAD_ATTEMPT",
      "This replay upload attempt is invalid. Please prepare the uploads again."
    );
  }
  return value;
}

function validateReplayFileMetadata(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new MatchReplayUploadError(
      "NO_REPLAY",
      "Upload the match replay files before submitting."
    );
  }

  if (value.length > MAX_MATCH_REPLAY_COUNT) {
    throw new MatchReplayUploadError(
      "REPLAY_COUNT",
      "Too many replay files were selected."
    );
  }

  return value.map((candidate) => {
    if (typeof Blob !== "undefined" && candidate instanceof Blob) {
      throw new MatchReplayUploadError(
        "FILE_BODY",
        "Replay file bodies must be uploaded directly to private Storage."
      );
    }

    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("name" in candidate) ||
      !("size" in candidate) ||
      typeof candidate.name !== "string" ||
      candidate.name.length === 0 ||
      candidate.name.length > 255 ||
      typeof candidate.size !== "number" ||
      !Number.isInteger(candidate.size)
    ) {
      throw new MatchReplayUploadError(
        "BAD_REPLAY",
        "The selected replay files are invalid."
      );
    }

    if (candidate.size <= 0) {
      throw new MatchReplayUploadError(
        "EMPTY_REPLAY",
        "Replay files cannot be empty."
      );
    }

    if (candidate.size > MAX_MATCH_REPLAY_BYTES) {
      throw new MatchReplayUploadError(
        "LARGE_REPLAY",
        "Replay files must be 10 MiB or smaller."
      );
    }

    if (getExtension(candidate.name) !== "rec") {
      throw new MatchReplayUploadError(
        "BAD_REPLAY",
        "Replay proof must use a .rec file."
      );
    }

    return { name: candidate.name, size: candidate.size };
  });
}

function validateResult(
  match: ReplayMatchContext,
  playerOneScoreValue: unknown,
  playerTwoScoreValue: unknown,
  winnerRegistrationIdValue: unknown
): ValidatedResult {
  const playerOneScore = parseScore(playerOneScoreValue);
  const playerTwoScore = parseScore(playerTwoScoreValue);
  const winnerRegistrationId =
    typeof winnerRegistrationIdValue === "string"
      ? winnerRegistrationIdValue.trim()
      : "";

  if (!match.playerOneRegistrationId || !match.playerTwoRegistrationId) {
    throw new MatchReplayUploadError(
      "PARTICIPANTS",
      "Both match participants must be assigned before recording a result."
    );
  }

  if (
    winnerRegistrationId !== match.playerOneRegistrationId &&
    winnerRegistrationId !== match.playerTwoRegistrationId
  ) {
    throw new MatchReplayUploadError(
      "BAD_WINNER",
      "Select one of the match participants as the winner."
    );
  }

  if (
    playerOneScore === null ||
    playerTwoScore === null ||
    playerOneScore === playerTwoScore
  ) {
    throw new MatchReplayUploadError(
      "BAD_SCORE",
      "Enter a valid non-tied final score."
    );
  }

  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;
  const winnerScore =
    winnerRegistrationId === match.playerOneRegistrationId
      ? playerOneScore
      : playerTwoScore;
  const loserScore =
    winnerRegistrationId === match.playerOneRegistrationId
      ? playerTwoScore
      : playerOneScore;

  if (winnerScore !== winsRequired || loserScore >= winsRequired) {
    throw new MatchReplayUploadError(
      "BAD_SCORE",
      `This BO${match.seriesBestOf} series requires the winner to finish on ${winsRequired}.`
    );
  }

  return {
    playerOneScore,
    playerTwoScore,
    winnerRegistrationId,
    requiredReplayCount: playerOneScore + playerTwoScore,
  };
}

function validateNotes(value: unknown) {
  if (typeof value !== "string") {
    throw new MatchReplayUploadError(
      "BAD_NOTES",
      "Result notes are invalid."
    );
  }

  const notes = value.trim();
  if (notes.length > 2000) {
    throw new MatchReplayUploadError(
      "BAD_NOTES",
      "Result notes must be 2000 characters or fewer."
    );
  }
  return notes;
}

function parseScore(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function parseReplayPaths(matchId: string, value: unknown): ParsedReplayPaths {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_MATCH_REPLAY_COUNT ||
    !value.every((path): path is string => typeof path === "string")
  ) {
    throw new MatchReplayUploadError(
      "BAD_PATH",
      "The replay upload paths are invalid. Please upload the files again."
    );
  }

  const uniquePaths = new Set(value);
  if (uniquePaths.size !== value.length) {
    throw new MatchReplayUploadError(
      "BAD_PATH",
      "Each completed game requires a unique replay file."
    );
  }

  let attemptId = "";
  for (const [index, path] of value.entries()) {
    const segments = path.split("/");
    const objectMatch = segments[2]?.match(REPLAY_OBJECT_PATTERN);

    if (
      segments.length !== 3 ||
      segments[0] !== matchId ||
      !UUID_PATTERN.test(segments[1] ?? "") ||
      !objectMatch ||
      Number(objectMatch[1]) !== index + 1
    ) {
      throw new MatchReplayUploadError(
        "BAD_PATH",
        "The replay upload paths are invalid. Please upload the files again."
      );
    }

    if (index === 0) {
      attemptId = segments[1];
    } else if (segments[1] !== attemptId) {
      throw new MatchReplayUploadError(
        "BAD_PATH",
        "All replay files must belong to the same upload attempt."
      );
    }
  }

  return { attemptId, paths: [...value] };
}

function parseReplayAttemptPreparation(
  matchId: string,
  requiredReplayCount: number,
  value: unknown
): ReplayAttemptPreparation {
  if (typeof value !== "object" || value === null) {
    throw invalidAttemptResponse();
  }

  const candidate = value as Record<string, unknown>;
  const attemptId = validateAttemptId(candidate.attempt_id);
  const parsed = parseReplayPaths(matchId, candidate.replay_storage_paths);
  if (parsed.attemptId !== attemptId) throw invalidAttemptResponse();

  if (
    candidate.outcome === "cleanup_required" ||
    candidate.outcome === "recycle_required"
  ) {
    if (parsed.paths.length !== MAX_MATCH_REPLAY_COUNT) {
      throw invalidAttemptResponse();
    }
    const claimId = validateAttemptId(
      candidate.outcome === "cleanup_required"
        ? candidate.cleanup_claim_id
        : candidate.recycle_claim_id
    );
    return {
      outcome: candidate.outcome,
      attemptId,
      claimId,
      paths: parsed.paths,
    };
  }

  if (
    candidate.outcome !== "prepared" ||
    parsed.paths.length !== requiredReplayCount ||
    candidate.required_replay_count !== requiredReplayCount
  ) {
    throw invalidAttemptResponse();
  }

  return {
    outcome: "prepared",
    attemptId,
    paths: parsed.paths,
    requiredReplayCount,
  };
}

function parseFinalizationClaim(
  matchId: string,
  attemptId: string,
  expectedResult: ValidatedResult,
  value: unknown
): FinalizationClaim {
  if (typeof value !== "object" || value === null) {
    throw invalidAttemptResponse();
  }

  const candidate = value as Record<string, unknown>;
  const result = {
    playerOneScore: candidate.player_one_score,
    playerTwoScore: candidate.player_two_score,
    winnerRegistrationId: candidate.winner_registration_id,
    requiredReplayCount: candidate.required_replay_count,
  };
  if (
    result.playerOneScore !== expectedResult.playerOneScore ||
    result.playerTwoScore !== expectedResult.playerTwoScore ||
    result.winnerRegistrationId !== expectedResult.winnerRegistrationId ||
    result.requiredReplayCount !== expectedResult.requiredReplayCount
  ) {
    throw invalidAttemptResponse();
  }

  if (candidate.outcome === "committed") {
    return {
      outcome: "committed",
      report: candidate.report,
      result: expectedResult,
    };
  }

  if (candidate.outcome !== "claimed") {
    throw invalidAttemptResponse();
  }

  const claimId = validateAttemptId(candidate.claim_id);
  const parsed = parseReplayPaths(matchId, candidate.replay_storage_paths);
  if (
    parsed.attemptId !== attemptId ||
    parsed.paths.length !== expectedResult.requiredReplayCount
  ) {
    throw invalidAttemptResponse();
  }

  return {
    outcome: "claimed",
    claimId,
    paths: parsed.paths,
    result: expectedResult,
  };
}

function invalidAttemptResponse() {
  return new MatchReplayUploadError(
    "ATTEMPT_RESPONSE",
    "The replay attempt could not be verified safely. Please refresh and try again."
  );
}

async function verifyStoredReplays(
  supabase: SupabaseAdminClient,
  paths: string[]
): Promise<VerifiedStoredReplay[]> {
  const verified: VerifiedStoredReplay[] = [];

  for (const path of paths) {
    const { data: stream, error } = await supabase.storage
      .from(MATCH_REPLAY_BUCKET)
      .download(path)
      .asStream();

    if (error || !stream) {
      throw new MatchReplayUploadError(
        "MISSING_REPLAY",
        "A replay file could not be verified. Please upload the files again."
      );
    }

    const hash = createHash("sha256");
    const reader = stream.getReader();
    let size = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        size += value.byteLength;
        if (size > MAX_MATCH_REPLAY_BYTES) {
          await reader.cancel();
          throw new MatchReplayUploadError(
            "LARGE_REPLAY",
            "A stored replay exceeds the 10 MiB limit."
          );
        }
        hash.update(value);
      }
    } finally {
      reader.releaseLock();
    }

    if (size === 0) {
      throw new MatchReplayUploadError(
        "EMPTY_REPLAY",
        "A stored replay is empty. Please upload the files again."
      );
    }

    verified.push({ path, size, sha256: hash.digest("hex") });
  }

  return verified;
}

async function removeClaimedReplayPaths(
  supabase: SupabaseAdminClient,
  paths: string[]
) {
  await assertReplayPathsUnreferenced(supabase, paths);

  const { error } = await supabase.storage
    .from(MATCH_REPLAY_BUCKET)
    .remove(paths);
  if (error) {
    throw new MatchReplayUploadError(
      "REMOVE_FAIL",
      "Replay cleanup could not be completed safely."
    );
  }
}

async function completeClaimedReplayCleanup(
  supabase: SupabaseAdminClient,
  attemptId: string,
  cleanupClaimId: string
) {
  const { data, error } = await supabase.rpc(
    "complete_match_replay_attempt_cleanup",
    {
      p_attempt_id: attemptId,
      p_cleanup_claim_id: cleanupClaimId,
    }
  );
  if (error || data !== true) {
    throw new MatchReplayUploadError(
      "CLEANUP_STATE",
      "Replay cleanup could not be completed safely."
    );
  }
}

async function cleanupReplayAttempt(
  supabase: SupabaseAdminClient,
  clerkUserId: string,
  matchId: string,
  attemptId: string,
  finalizationClaimId: string | null = null
) {
  const { data: cleanupData, error: cleanupClaimError } = await supabase.rpc(
    "claim_match_replay_attempt_cleanup",
    {
      p_attempt_id: attemptId,
      p_match_id: matchId,
      p_submitted_by_clerk_user_id: clerkUserId,
      p_finalization_claim_id: finalizationClaimId,
    }
  );

  if (cleanupClaimError) throw cleanupClaimError;
  if (typeof cleanupData !== "object" || cleanupData === null) {
    throw invalidAttemptResponse();
  }

  const cleanup = cleanupData as Record<string, unknown>;
  if (cleanup.outcome === "preserved" || cleanup.outcome === "cleaned") {
    return {
      outcome: cleanup.outcome === "preserved" ? "preserved" : "already_cleaned",
      removedCount: 0,
    } satisfies CleanupReplayAttemptResult;
  }
  if (cleanup.outcome !== "claimed") {
    throw invalidAttemptResponse();
  }

  const cleanupClaimId = validateAttemptId(cleanup.cleanup_claim_id);
  const parsed = parseReplayPaths(matchId, cleanup.replay_storage_paths);
  if (
    parsed.attemptId !== attemptId ||
    parsed.paths.length !== MAX_MATCH_REPLAY_COUNT
  ) {
    throw invalidAttemptResponse();
  }

  await removeClaimedReplayPaths(supabase, parsed.paths);
  await completeClaimedReplayCleanup(supabase, attemptId, cleanupClaimId);

  return {
    outcome: "removed",
    removedCount: parsed.paths.length,
  } satisfies CleanupReplayAttemptResult;
}

async function assertReplayPathsUnreferenced(
  supabase: SupabaseAdminClient,
  paths: string[]
) {
  const [submissionsResult, reportGroupsResult] = await Promise.all([
    supabase
      .from("match_result_submissions")
      .select("replay_storage_path")
      .in("replay_storage_path", paths),
    supabase
      .from("match_result_report_groups")
      .select("replay_storage_path")
      .in("replay_storage_path", paths),
  ]);

  if (submissionsResult.error || reportGroupsResult.error) {
    throw new MatchReplayUploadError(
      "REF_CHECK",
      "Replay cleanup could not be completed safely."
    );
  }

  const referencedPaths = new Set(
    [
      ...(submissionsResult.data ?? []),
      ...(reportGroupsResult.data ?? []),
    ]
      .map((row) => row.replay_storage_path)
      .filter((path): path is string => typeof path === "string")
  );
  if (referencedPaths.size > 0) {
    throw new MatchReplayUploadError(
      "REFERENCED_PROOF",
      "Replay cleanup could not be completed safely."
    );
  }
}

function replayCountError(requiredReplayCount: number) {
  return new MatchReplayUploadError(
    "REPLAY_COUNT",
    `This score requires exactly ${requiredReplayCount} replay file${
      requiredReplayCount === 1 ? "" : "s"
    }.`
  );
}

function hasExactReplayDatabaseMessage(error: unknown, expected: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes(expected.toLowerCase())
  );
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function logReplayCleanupFailure(error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9_]{3,20}$/.test(candidateCode)
    ? candidateCode
    : "CLEANUP_FAILED";

  console.error("Replay upload cleanup failed.", {
    operation: "replay-upload-cleanup",
    code,
  });
}
