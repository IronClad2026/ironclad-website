import "server-only";

import { createHash, randomUUID } from "node:crypto";
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

export type FinalizeMatchReplayResultInput = {
  matchId: string;
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
  notes: string;
  replayPaths: string[];
};

export type CleanupMatchReplayUploadsInput = {
  matchId: string;
  replayPaths: string[];
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

export async function prepareMatchReplayUploadsForPlayer(
  supabase: SupabaseAdminClient,
  clerkUserId: string,
  input: PrepareMatchReplayUploadsInput
): Promise<PreparedMatchReplayUpload[]> {
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

  const attemptId = randomUUID();
  const uploads: PreparedMatchReplayUpload[] = [];

  for (const [index] of replayFiles.entries()) {
    const path = `${matchId}/${attemptId}/game-${index + 1}-${randomUUID()}.rec`;
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

  return uploads;
}

export async function finalizeMatchReplayResultForPlayer(
  supabase: SupabaseAdminClient,
  clerkUserId: string,
  input: FinalizeMatchReplayResultInput
): Promise<CommittedMatchReplayResult> {
  const matchId = validateMatchId(input?.matchId);
  const parsedPaths = parseReplayPaths(matchId, input?.replayPaths);
  const authorized = await authorizeReplayParticipant(
    supabase,
    clerkUserId,
    matchId
  );

  try {
    assertTournamentAcceptsResults(authorized.match);
    const result = validateResult(
      authorized.match,
      input?.playerOneScore,
      input?.playerTwoScore,
      input?.winnerRegistrationId
    );
    const notes = validateNotes(input?.notes);

    if (parsedPaths.paths.length !== result.requiredReplayCount) {
      throw replayCountError(result.requiredReplayCount);
    }

    await assertNoExistingResultActivity(supabase, authorized.match);
    const verifiedReplays = await verifyStoredReplays(
      supabase,
      parsedPaths.paths
    );
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
      "submit_match_series_result_report",
      {
        p_match_id: matchId,
        p_submitted_by_clerk_user_id: clerkUserId,
        p_winner_registration_id: result.winnerRegistrationId,
        p_player_one_score: result.playerOneScore,
        p_player_two_score: result.playerTwoScore,
        p_replay_storage_paths: verifiedReplays.map((replay) => replay.path),
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
    };
  } catch (error) {
    try {
      await removeUnreferencedReplayPaths(supabase, parsedPaths.paths);
    } catch (cleanupError) {
      logReplayCleanupFailure(cleanupError);
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
  const parsedPaths = parseReplayPaths(matchId, input?.replayPaths);

  await authorizeReplayParticipant(supabase, clerkUserId, matchId);
  return removeUnreferencedReplayPaths(supabase, parsedPaths.paths);
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

async function removeUnreferencedReplayPaths(
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
  const removablePaths = paths.filter((path) => !referencedPaths.has(path));

  if (removablePaths.length === 0) {
    return 0;
  }

  const { error } = await supabase.storage
    .from(MATCH_REPLAY_BUCKET)
    .remove(removablePaths);

  if (error) {
    throw new MatchReplayUploadError(
      "REMOVE_FAIL",
      "Replay cleanup could not be completed safely."
    );
  }

  return removablePaths.length;
}

function replayCountError(requiredReplayCount: number) {
  return new MatchReplayUploadError(
    "REPLAY_COUNT",
    `This score requires exactly ${requiredReplayCount} replay file${
      requiredReplayCount === 1 ? "" : "s"
    }.`
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
