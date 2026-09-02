import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  MatchResultReportGroup,
  MatchResultSubmission,
} from "@/lib/tournaments";

const MATCH_RESULT_SUBMISSION_SELECT =
  "id, submission_number, game_number, match_id, submitted_by_registration_id, claimed_winner_registration_id, player_one_score, player_two_score, replay_storage_path, screenshot_storage_path, notes, status, review_notes, reviewed_at, created_at, report_group_id";
const MATCH_RESULT_REPORT_GROUP_SELECT =
  "id, match_id, tournament_id, result_type, submitted_by_registration_id, opponent_registration_id, winner_registration_id, player_one_score, player_two_score, replay_storage_path, status, confirmation_deadline_at, confirmed_at, disputed_at, dispute_notes, reviewed_at, review_notes, no_show_reported_by_registration_id, no_show_registration_id, no_show_status, no_show_note, no_show_resolved_at, finalized_at, finalized_source, created_at";
const MATCH_RESULT_REPLAY_PROOF_SELECT =
  "id, report_group_id, match_id, game_number, replay_storage_path";
const SUBMISSION_AUDIT_SELECT =
  "id, submitted_by_clerk_user_id, reviewed_by";
const REPORT_GROUP_AUDIT_SELECT =
  "id, submitted_by_clerk_user_id, reviewed_by, no_show_resolved_by";

const submissionRowKeys = new Set(
  MATCH_RESULT_SUBMISSION_SELECT.split(", ").map((key) => key.trim())
);
const reportGroupRowKeys = new Set(
  MATCH_RESULT_REPORT_GROUP_SELECT.split(", ").map((key) => key.trim())
);
const replayProofRowKeys = new Set(
  MATCH_RESULT_REPLAY_PROOF_SELECT.split(", ").map((key) => key.trim())
);
const submissionAuditRowKeys = new Set(
  SUBMISSION_AUDIT_SELECT.split(", ").map((key) => key.trim())
);
const reportGroupAuditRowKeys = new Set(
  REPORT_GROUP_AUDIT_SELECT.split(", ").map((key) => key.trim())
);

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type MatchResultSubmissionRow = {
  id: string;
  submission_number: number;
  game_number: number;
  match_id: string;
  submitted_by_registration_id: string | null;
  claimed_winner_registration_id: string;
  player_one_score: number;
  player_two_score: number;
  replay_storage_path: string | null;
  screenshot_storage_path: string | null;
  notes: string | null;
  status: MatchResultSubmission["status"];
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  report_group_id: string | null;
};

type MatchResultReportGroupRow = {
  id: string;
  match_id: string;
  tournament_id: string;
  result_type: MatchResultReportGroup["resultType"] | null;
  submitted_by_registration_id: string;
  opponent_registration_id: string;
  winner_registration_id: string;
  player_one_score: number;
  player_two_score: number;
  replay_storage_path: string | null;
  status: MatchResultReportGroup["status"];
  confirmation_deadline_at: string;
  confirmed_at: string | null;
  disputed_at: string | null;
  dispute_notes: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  no_show_reported_by_registration_id: string | null;
  no_show_registration_id: string | null;
  no_show_status: MatchResultReportGroup["noShowStatus"] | null;
  no_show_note: string | null;
  no_show_resolved_at: string | null;
  finalized_at: string | null;
  finalized_source: string | null;
  created_at: string;
};

type MatchResultReplayProofRow = {
  id: string;
  report_group_id: string;
  match_id: string;
  game_number: number;
  replay_storage_path: string | null;
};

type SubmissionAuditRow = {
  id: string;
  submitted_by_clerk_user_id: string;
  reviewed_by: string | null;
};

type ReportGroupAuditRow = {
  id: string;
  submitted_by_clerk_user_id: string;
  reviewed_by: string | null;
  no_show_resolved_by: string | null;
};

export type AdminMatchResultAudit = {
  submissions: ReadonlyMap<
    string,
    Omit<SubmissionAuditRow, "id">
  >;
  reportGroups: ReadonlyMap<
    string,
    Omit<ReportGroupAuditRow, "id">
  >;
};

export type MatchResultData = {
  submissions: MatchResultSubmission[];
  reportGroups: MatchResultReportGroup[];
  viewerRole: "anonymous" | "participant" | "admin";
  error: "load-failed" | null;
};

export type MatchResultDataLoadOptions = {
  adminMatchIds?: readonly string[];
};

const emptyAnonymousResult: MatchResultData = {
  submissions: [],
  reportGroups: [],
  viewerRole: "anonymous",
  error: null,
};

export async function loadMatchResultData(
  options: MatchResultDataLoadOptions = {}
): Promise<MatchResultData> {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return emptyAnonymousResult;
  }

  const isAdmin =
    (sessionClaims as CustomClaims | null)?.metadata?.role === "admin";
  const viewerRole = isAdmin ? "admin" : "participant";

  try {
    const supabase = createSupabaseAdminClient();
    const adminMatchIds =
      isAdmin && options.adminMatchIds !== undefined
        ? uniqueIds(options.adminMatchIds)
        : null;

    if (isAdmin && adminMatchIds?.length === 0) {
      return {
        submissions: [],
        reportGroups: [],
        viewerRole,
        error: null,
      };
    }

    const viewerRegistrationIds = isAdmin
      ? []
      : await loadViewerRegistrationIds(supabase, userId);

    if (!isAdmin && viewerRegistrationIds.length === 0) {
      return {
        submissions: [],
        reportGroups: [],
        viewerRole,
        error: null,
      };
    }

    const participantMatchIds = isAdmin
      ? []
      : await loadParticipantMatchIds(supabase, viewerRegistrationIds);
    const reportGroupRows = await loadVisibleReportGroupRows(
      supabase,
      isAdmin,
      viewerRegistrationIds,
      adminMatchIds
    );
    const submissionRows = await loadVisibleSubmissionRows(
      supabase,
      isAdmin,
      participantMatchIds,
      adminMatchIds
    );
    const replayProofRows = await loadReplayProofRows(
      supabase,
      reportGroupRows.map((row) => row.id)
    );
    const audit = isAdmin
      ? await loadAdminMatchResultAudit({
          submissionIds: submissionRows.map((row) => row.id),
          reportGroupIds: reportGroupRows.map((row) => row.id),
        })
      : createEmptyAudit();
    const viewerRegistrations = new Set(viewerRegistrationIds);
    const replayProofsByGroup = groupReplayProofs(replayProofRows);

    return {
      submissions: submissionRows.map((row) =>
        buildSubmissionPresentation(row, viewerRegistrations, audit)
      ),
      reportGroups: reportGroupRows.map((row) =>
        buildReportGroupPresentation(
          row,
          replayProofsByGroup.get(row.id) ?? [],
          viewerRegistrations,
          audit
        )
      ),
      viewerRole,
      error: null,
    };
  } catch {
    console.error("Match result data load failed.", {
      operation: "load-match-result-data",
    });
    return {
      submissions: [],
      reportGroups: [],
      viewerRole,
      error: "load-failed",
    };
  }
}

export async function loadAdminMatchResultAudit({
  submissionIds,
  reportGroupIds,
}: {
  submissionIds: readonly string[];
  reportGroupIds: readonly string[];
}): Promise<AdminMatchResultAudit> {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const scopedSubmissionIds = uniqueIds(submissionIds);
  const scopedReportGroupIds = uniqueIds(reportGroupIds);

  if (scopedSubmissionIds.length === 0 && scopedReportGroupIds.length === 0) {
    return createEmptyAudit();
  }

  const supabase = createSupabaseAdminClient();
  const [submissionResult, reportGroupResult] = await Promise.all([
    scopedSubmissionIds.length > 0
      ? supabase
          .from("match_result_submissions")
          .select(SUBMISSION_AUDIT_SELECT)
          .in("id", scopedSubmissionIds)
      : Promise.resolve({ data: [], error: null }),
    scopedReportGroupIds.length > 0
      ? supabase
          .from("match_result_report_groups")
          .select(REPORT_GROUP_AUDIT_SELECT)
          .in("id", scopedReportGroupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    submissionResult.error ||
    reportGroupResult.error ||
    !Array.isArray(submissionResult.data) ||
    !Array.isArray(reportGroupResult.data) ||
    submissionResult.data.length !== scopedSubmissionIds.length ||
    reportGroupResult.data.length !== scopedReportGroupIds.length
  ) {
    throw new Error("Match result audit unavailable.");
  }

  const submissions = new Map<string, Omit<SubmissionAuditRow, "id">>();
  for (const candidate of submissionResult.data) {
    const row = assertExactRow<SubmissionAuditRow>(
      candidate,
      submissionAuditRowKeys,
      "submission audit"
    );
    submissions.set(row.id, {
      submitted_by_clerk_user_id: row.submitted_by_clerk_user_id,
      reviewed_by: row.reviewed_by,
    });
  }

  const reportGroups = new Map<string, Omit<ReportGroupAuditRow, "id">>();
  for (const candidate of reportGroupResult.data) {
    const row = assertExactRow<ReportGroupAuditRow>(
      candidate,
      reportGroupAuditRowKeys,
      "report-group audit"
    );
    reportGroups.set(row.id, {
      submitted_by_clerk_user_id: row.submitted_by_clerk_user_id,
      reviewed_by: row.reviewed_by,
      no_show_resolved_by: row.no_show_resolved_by,
    });
  }

  return {
    submissions,
    reportGroups,
  };
}

export function buildSubmissionPresentation(
  candidate: unknown,
  viewerRegistrationIds: ReadonlySet<string>,
  audit: AdminMatchResultAudit = createEmptyAudit()
): MatchResultSubmission {
  const row = assertExactRow<MatchResultSubmissionRow>(
    candidate,
    submissionRowKeys,
    "match-result submission"
  );
  const submissionAudit = audit.submissions.get(row.id);
  const hasReplay = Boolean(row.replay_storage_path);
  const hasScreenshot = Boolean(row.screenshot_storage_path);

  return {
    id: row.id,
    submissionNumber: row.submission_number,
    gameNumber: row.game_number,
    matchId: row.match_id,
    submittedByRegistrationId: row.submitted_by_registration_id,
    submittedByViewer: Boolean(
      row.submitted_by_registration_id &&
        viewerRegistrationIds.has(row.submitted_by_registration_id)
    ),
    claimedWinnerRegistrationId: row.claimed_winner_registration_id,
    playerOneScore: row.player_one_score,
    playerTwoScore: row.player_two_score,
    hasReplay,
    hasScreenshot,
    replayAccessHref: hasReplay
      ? buildProofAccessHref(row.match_id, "submission", row.id, "replay")
      : null,
    screenshotAccessHref: hasScreenshot
      ? buildProofAccessHref(row.match_id, "submission", row.id, "screenshot")
      : null,
    notes: row.notes,
    status: row.status,
    reviewNotes: row.review_notes,
    reviewerLabel:
      submissionAudit?.reviewed_by || row.reviewed_at
        ? "Administrator"
        : null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export function buildReportGroupPresentation(
  candidate: unknown,
  proofCandidates: readonly unknown[],
  viewerRegistrationIds: ReadonlySet<string>,
  audit: AdminMatchResultAudit = createEmptyAudit()
): MatchResultReportGroup {
  const row = assertExactRow<MatchResultReportGroupRow>(
    candidate,
    reportGroupRowKeys,
    "match-result report group"
  );
  const reportGroupAudit = audit.reportGroups.get(row.id);
  const replayProofs = proofCandidates
    .map((proofCandidate) =>
      buildReplayProofPresentation(proofCandidate, row)
    )
    .sort(
      (left, right) =>
        left.gameNumber - right.gameNumber || left.id.localeCompare(right.id)
    );
  const hasReplay = Boolean(row.replay_storage_path);
  const fallbackProofs =
    replayProofs.length === 0 && hasReplay
      ? [
          {
            id: row.id,
            gameNumber: 1,
            proofAvailable: true,
            replayAccessHref: buildProofAccessHref(
              row.match_id,
              "report-group",
              row.id,
              "replay"
            ),
          },
        ]
      : replayProofs;

  return {
    id: row.id,
    matchId: row.match_id,
    tournamentId: row.tournament_id,
    resultType: row.result_type ?? "normal",
    submittedByRegistrationId: row.submitted_by_registration_id,
    submittedByViewer: viewerRegistrationIds.has(
      row.submitted_by_registration_id
    ),
    opponentRegistrationId: row.opponent_registration_id,
    winnerRegistrationId: row.winner_registration_id,
    playerOneScore: row.player_one_score,
    playerTwoScore: row.player_two_score,
    hasReplay: hasReplay || fallbackProofs.length > 0,
    replayAccessHref: hasReplay
      ? buildProofAccessHref(row.match_id, "report-group", row.id, "replay")
      : null,
    replayProofs: fallbackProofs,
    status: row.status,
    confirmationDeadlineAt: row.confirmation_deadline_at,
    confirmedAt: row.confirmed_at,
    disputedAt: row.disputed_at,
    disputeNotes: row.dispute_notes,
    reviewerLabel:
      reportGroupAudit?.reviewed_by || row.reviewed_at
        ? "Administrator"
        : null,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    noShowReportedByRegistrationId:
      row.no_show_reported_by_registration_id,
    noShowRegistrationId: row.no_show_registration_id,
    noShowStatus: row.no_show_status,
    noShowNote: row.no_show_note,
    noShowResolvedAt: row.no_show_resolved_at,
    noShowResolverLabel:
      reportGroupAudit?.no_show_resolved_by || row.no_show_resolved_at
        ? "Administrator"
        : null,
    finalizedAt: row.finalized_at,
    finalizedSource: row.finalized_source,
    createdAt: row.created_at,
  };
}

async function loadViewerRegistrationIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const { data, error } = await supabase
    .from("registrations")
    .select("id")
    .eq("clerk_user_id", userId);

  if (error || !Array.isArray(data)) {
    throw new Error("Viewer registrations unavailable.");
  }

  return uniqueIds(data.map((registration) => registration.id));
}

async function loadParticipantMatchIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  registrationIds: string[]
) {
  if (registrationIds.length === 0) return [];

  const [playerOneResult, playerTwoResult] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select("id")
      .in("player_one_registration_id", registrationIds),
    supabase
      .from("tournament_matches")
      .select("id")
      .in("player_two_registration_id", registrationIds),
  ]);

  if (
    playerOneResult.error ||
    playerTwoResult.error ||
    !Array.isArray(playerOneResult.data) ||
    !Array.isArray(playerTwoResult.data)
  ) {
    throw new Error("Participant matches unavailable.");
  }

  return uniqueIds([
    ...playerOneResult.data.map((match) => match.id),
    ...playerTwoResult.data.map((match) => match.id),
  ]);
}

async function loadVisibleSubmissionRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  isAdmin: boolean,
  participantMatchIds: string[],
  adminMatchIds: string[] | null
) {
  if (!isAdmin && participantMatchIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("match_result_submissions")
    .select(MATCH_RESULT_SUBMISSION_SELECT)
    .is("report_group_id", null)
    .order("created_at", { ascending: false });

  if (!isAdmin) {
    query = query.in("match_id", participantMatchIds);
  } else if (adminMatchIds) {
    query = query.in("match_id", adminMatchIds);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    throw new Error("Match-result submissions unavailable.");
  }

  return data.map((candidate) =>
    assertExactRow<MatchResultSubmissionRow>(
      candidate,
      submissionRowKeys,
      "match-result submission"
    )
  );
}

async function loadVisibleReportGroupRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  isAdmin: boolean,
  viewerRegistrationIds: string[],
  adminMatchIds: string[] | null
) {
  if (isAdmin) {
    let query = supabase
      .from("match_result_report_groups")
      .select(MATCH_RESULT_REPORT_GROUP_SELECT)
      .order("created_at", { ascending: false });

    if (adminMatchIds) {
      query = query.in("match_id", adminMatchIds);
    }

    const { data, error } = await query;

    if (error || !Array.isArray(data)) {
      throw new Error("Match-result report groups unavailable.");
    }

    return data.map((candidate) =>
      assertExactRow<MatchResultReportGroupRow>(
        candidate,
        reportGroupRowKeys,
        "match-result report group"
      )
    );
  }

  if (viewerRegistrationIds.length === 0) return [];

  const [submittedResult, opponentResult] = await Promise.all([
    supabase
      .from("match_result_report_groups")
      .select(MATCH_RESULT_REPORT_GROUP_SELECT)
      .in("submitted_by_registration_id", viewerRegistrationIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("match_result_report_groups")
      .select(MATCH_RESULT_REPORT_GROUP_SELECT)
      .in("opponent_registration_id", viewerRegistrationIds)
      .order("created_at", { ascending: false }),
  ]);

  if (
    submittedResult.error ||
    opponentResult.error ||
    !Array.isArray(submittedResult.data) ||
    !Array.isArray(opponentResult.data)
  ) {
    throw new Error("Match-result report groups unavailable.");
  }

  const rowsById = new Map<string, MatchResultReportGroupRow>();
  for (const candidate of [
    ...submittedResult.data,
    ...opponentResult.data,
  ]) {
    const row = assertExactRow<MatchResultReportGroupRow>(
      candidate,
      reportGroupRowKeys,
      "match-result report group"
    );
    rowsById.set(row.id, row);
  }

  return [...rowsById.values()].sort((left, right) =>
    right.created_at.localeCompare(left.created_at)
  );
}

async function loadReplayProofRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  reportGroupIds: string[]
) {
  if (reportGroupIds.length === 0) return [];

  const { data, error } = await supabase
    .from("match_result_submissions")
    .select(MATCH_RESULT_REPLAY_PROOF_SELECT)
    .in("report_group_id", reportGroupIds)
    .not("replay_storage_path", "is", null)
    .order("game_number", { ascending: true });

  if (error || !Array.isArray(data)) {
    throw new Error("Match-result replay proofs unavailable.");
  }

  return data.map((candidate) =>
    assertExactRow<MatchResultReplayProofRow>(
      candidate,
      replayProofRowKeys,
      "match-result replay proof"
    )
  );
}

function buildReplayProofPresentation(
  candidate: unknown,
  reportGroup: MatchResultReportGroupRow
) {
  const row = assertExactRow<MatchResultReplayProofRow>(
    candidate,
    replayProofRowKeys,
    "match-result replay proof"
  );

  if (
    row.report_group_id !== reportGroup.id ||
    row.match_id !== reportGroup.match_id
  ) {
    throw new Error("Replay proof scope mismatch.");
  }

  const proofAvailable = Boolean(row.replay_storage_path);
  return {
    id: row.id,
    gameNumber: row.game_number,
    proofAvailable,
    replayAccessHref: proofAvailable
      ? buildProofAccessHref(
          row.match_id,
          "submission",
          row.id,
          "replay"
        )
      : null,
  };
}

function groupReplayProofs(rows: MatchResultReplayProofRow[]) {
  const byGroup = new Map<string, MatchResultReplayProofRow[]>();

  for (const row of rows) {
    const groupRows = byGroup.get(row.report_group_id) ?? [];
    groupRows.push(row);
    byGroup.set(row.report_group_id, groupRows);
  }

  return byGroup;
}

function buildProofAccessHref(
  matchId: string,
  source: "submission" | "report-group",
  recordId: string,
  kind: "replay" | "screenshot"
) {
  return `/api/match-proofs/${matchId}/${source}/${recordId}/${kind}`;
}

function createEmptyAudit(): AdminMatchResultAudit {
  return {
    submissions: new Map(),
    reportGroups: new Map(),
  };
}

function uniqueIds(ids: readonly string[]) {
  return [...new Set(ids.filter(Boolean))];
}

function assertExactRow<Row extends object>(
  candidate: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string
): Row {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    throw new Error(`Invalid ${label} row.`);
  }

  const keys = Object.keys(candidate);
  if (
    keys.length !== allowedKeys.size ||
    keys.some((key) => !allowedKeys.has(key))
  ) {
    throw new Error(`Unexpected ${label} fields.`);
  }

  return candidate as Row;
}
