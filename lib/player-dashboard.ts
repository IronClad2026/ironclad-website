import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type DashboardNotification = {
  id: string;
  source: "submission" | "report_group";
  sourceId: string;
  reportGroupId: string | null;
  submissionNumber: number;
  gameNumber: number;
  tournamentName: string;
  roundName: string;
  matchNumber: number;
  opponentName: string;
  reportedWinner: string;
  reportedLoser: string;
  reportedScore: string;
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "resubmission_requested"
    | "pending_confirmation"
    | "confirmed"
    | "auto_approved"
    | "disputed"
    | "under_review"
    | "reset";
  reviewNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  submittedByViewer: boolean;
  confirmationDeadlineAt: string | null;
  finalizedAt: string | null;
  canConfirm: boolean;
  canDispute: boolean;
};

export type ChampionAchievement = {
  id: string;
  winnerName: string;
  tournamentName: string;
  bracketName: string;
  bannerImageUrl: string | null;
  wonAt: string;
};

export type PlayerStatistics = {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
  tournamentsParticipated: number;
  tournamentsWon: number;
};

export type MatchHistoryEntry = {
  id: string;
  tournamentName: string;
  bracketName: string;
  opponentName: string;
  result: "Win" | "Loss";
  score: string;
  playedAt: string;
  roundName: string;
  matchNumber: number;
  seriesBestOf: number;
  replayAvailable: boolean;
  screenshotAvailable: boolean;
};

export type PlayerCareerDashboard = {
  notifications: DashboardNotification[];
  champions: ChampionAchievement[];
  statistics: PlayerStatistics;
  matchHistory: MatchHistoryEntry[];
  error: string | null;
};

type RegistrationRow = {
  id: string;
  clerk_user_id: string;
  tournament_id: string | null;
  tournament_bracket_id: string | null;
  tournament_title: string;
  bracket_name: string;
  player_name: string;
  registration_status: string;
};

type MatchRow = {
  id: string;
  generated_bracket_id: string;
  round_id: string;
  match_number: number;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  player_one_score: number | null;
  player_two_score: number | null;
  winner_registration_id: string | null;
  official_result_submission_id: string | null;
  series_best_of: number;
  status: string;
  updated_at: string;
};

type SubmissionRow = {
  id: string;
  submission_number: number;
  game_number: number;
  match_id: string;
  submitted_by_clerk_user_id: string;
  submitted_by_registration_id: string | null;
  claimed_winner_registration_id: string;
  player_one_score: number;
  player_two_score: number;
  status: DashboardNotification["status"];
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  replay_storage_path: string | null;
  screenshot_storage_path: string | null;
  report_group_id: string | null;
};

type ReportGroupRow = {
  id: string;
  match_id: string;
  tournament_id: string;
  submitted_by_clerk_user_id: string;
  submitted_by_registration_id: string;
  opponent_registration_id: string;
  winner_registration_id: string;
  player_one_score: number;
  player_two_score: number;
  replay_storage_path: string | null;
  status: DashboardNotification["status"];
  confirmation_deadline_at: string;
  confirmed_at: string | null;
  disputed_at: string | null;
  dispute_notes: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  finalized_at: string | null;
  finalized_source: string | null;
  created_at: string;
};

type GeneratedBracketRow = {
  id: string;
  tournament_bracket_id: string;
  format: "single_elimination" | "round_robin";
  slot_count: number;
};

type RoundRow = {
  id: string;
  round_number: number;
  name: string;
};

type TournamentBracketRow = {
  id: string;
  tournament_id: string;
  name: string;
};

type TournamentRow = {
  id: string;
  title: string;
  banner_image_url: string | null;
};

type StandingRow = {
  generated_bracket_id: string;
  registration_id: string;
  rank: number | null;
  updated_at: string;
};

type BracketMatchStatusRow = {
  generated_bracket_id: string;
  status: string;
};

const emptyCareer: PlayerCareerDashboard = {
  notifications: [],
  champions: [],
  statistics: {
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    winRate: 0,
    tournamentsParticipated: 0,
    tournamentsWon: 0,
  },
  matchHistory: [],
  error: null,
};

export async function loadPlayerCareerDashboard(
  clerkUserId: string
): Promise<PlayerCareerDashboard> {
  const supabase = createSupabaseAdminClient();
  const { data: registrationData, error: registrationError } = await supabase
    .from("registrations")
    .select(
      "id, clerk_user_id, tournament_id, tournament_bracket_id, tournament_title, bracket_name, player_name, registration_status"
    )
    .eq("clerk_user_id", clerkUserId);

  if (registrationError) {
    console.error("Dashboard career registrations load error:", registrationError);
    return {
      ...emptyCareer,
      error: "Your competitive history could not be loaded.",
    };
  }

  const registrations = (registrationData ?? []) as RegistrationRow[];
  const registrationIds = registrations.map((registration) => registration.id);
  const approvedTournamentIds = new Set(
    registrations
      .filter(
        (registration) =>
          registration.registration_status === "approved" &&
          registration.tournament_id
      )
      .map((registration) => registration.tournament_id as string)
  );

  if (registrationIds.length === 0) {
    return {
      ...emptyCareer,
      statistics: {
        ...emptyCareer.statistics,
        tournamentsParticipated: approvedTournamentIds.size,
      },
    };
  }

  const [playerOneMatchesResult, playerTwoMatchesResult] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select(
        "id, generated_bracket_id, round_id, match_number, series_best_of, player_one_registration_id, player_two_registration_id, player_one_score, player_two_score, winner_registration_id, official_result_submission_id, status, updated_at"
      )
      .in("player_one_registration_id", registrationIds),
    supabase
      .from("tournament_matches")
      .select(
        "id, generated_bracket_id, round_id, match_number, series_best_of, player_one_registration_id, player_two_registration_id, player_one_score, player_two_score, winner_registration_id, official_result_submission_id, status, updated_at"
      )
      .in("player_two_registration_id", registrationIds),
  ]);

  if (playerOneMatchesResult.error || playerTwoMatchesResult.error) {
    console.error(
      "Dashboard career matches load error:",
      playerOneMatchesResult.error ?? playerTwoMatchesResult.error
    );
    return {
      ...emptyCareer,
      statistics: {
        ...emptyCareer.statistics,
        tournamentsParticipated: approvedTournamentIds.size,
      },
      error: "Your competitive history could not be loaded.",
    };
  }

  const matches = [
    ...new Map(
      [
        ...((playerOneMatchesResult.data ?? []) as MatchRow[]),
        ...((playerTwoMatchesResult.data ?? []) as MatchRow[]),
      ].map((match) => [match.id, match])
    ).values(),
  ];

  if (matches.length === 0) {
    return {
      ...emptyCareer,
      statistics: {
        ...emptyCareer.statistics,
        tournamentsParticipated: approvedTournamentIds.size,
      },
    };
  }

  const matchIds = matches.map((match) => match.id);
  const generatedBracketIds = [
    ...new Set(matches.map((match) => match.generated_bracket_id)),
  ];
  const roundIds = [...new Set(matches.map((match) => match.round_id))];
  const participantRegistrationIds = [
    ...new Set(
      matches.flatMap((match) =>
        [
          match.player_one_registration_id,
          match.player_two_registration_id,
        ].filter((value): value is string => Boolean(value))
      )
    ),
  ];

  const [
    submissionsResult,
    reportGroupsResult,
    generatedBracketsResult,
    roundsResult,
    participantsResult,
    standingsResult,
  ] = await Promise.all([
    supabase
      .from("match_result_submissions")
      .select(
        "id, submission_number, game_number, match_id, submitted_by_clerk_user_id, submitted_by_registration_id, claimed_winner_registration_id, player_one_score, player_two_score, replay_storage_path, screenshot_storage_path, status, review_notes, reviewed_at, created_at, report_group_id"
      )
      .in("match_id", matchIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("match_result_report_groups")
      .select(
        "id, match_id, tournament_id, submitted_by_clerk_user_id, submitted_by_registration_id, opponent_registration_id, winner_registration_id, player_one_score, player_two_score, replay_storage_path, status, confirmation_deadline_at, confirmed_at, disputed_at, dispute_notes, reviewed_at, review_notes, finalized_at, finalized_source, created_at"
      )
      .in("match_id", matchIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("generated_brackets")
      .select("id, tournament_bracket_id, format, slot_count")
      .in("id", generatedBracketIds),
    supabase
      .from("bracket_rounds")
      .select("id, round_number, name")
      .in("id", roundIds),
    supabase
      .from("registrations")
      .select(
        "id, clerk_user_id, tournament_id, tournament_bracket_id, tournament_title, bracket_name, player_name, registration_status"
      )
      .in("id", participantRegistrationIds),
    supabase
      .from("tournament_standings")
      .select("generated_bracket_id, registration_id, rank, updated_at")
      .in("registration_id", registrationIds)
      .eq("rank", 1),
  ]);

  const metadataError =
    submissionsResult.error ??
    reportGroupsResult.error ??
    generatedBracketsResult.error ??
    roundsResult.error ??
    participantsResult.error ??
    standingsResult.error;

  if (metadataError) {
    console.error("Dashboard career metadata load error:", metadataError);
    return {
      ...emptyCareer,
      statistics: {
        ...emptyCareer.statistics,
        tournamentsParticipated: approvedTournamentIds.size,
      },
      error: "Your competitive history could not be loaded.",
    };
  }

  const generatedBrackets = (generatedBracketsResult.data ??
    []) as GeneratedBracketRow[];
  const roundRobinGeneratedBracketIds = generatedBrackets
    .filter((generated) => generated.format === "round_robin")
    .map((generated) => generated.id);
  const roundRobinMatchesResult =
    roundRobinGeneratedBracketIds.length > 0
      ? await supabase
          .from("tournament_matches")
          .select("generated_bracket_id, status")
          .in("generated_bracket_id", roundRobinGeneratedBracketIds)
      : { data: [], error: null };

  if (roundRobinMatchesResult.error) {
    console.error(
      "Dashboard round-robin completion load error:",
      roundRobinMatchesResult.error
    );
  }

  const bracketIds = [
    ...new Set(
      generatedBrackets.map((generated) => generated.tournament_bracket_id)
    ),
  ];
  const { data: bracketData, error: bracketError } = await supabase
    .from("tournament_brackets")
    .select("id, tournament_id, name")
    .in("id", bracketIds);

  if (bracketError) {
    console.error("Dashboard tournament bracket load error:", bracketError);
    return {
      ...emptyCareer,
      statistics: {
        ...emptyCareer.statistics,
        tournamentsParticipated: approvedTournamentIds.size,
      },
      error: "Your competitive history could not be loaded.",
    };
  }

  const tournamentBrackets = (bracketData ?? []) as TournamentBracketRow[];
  const tournamentIds = [
    ...new Set([
      ...tournamentBrackets.map((bracket) => bracket.tournament_id),
      ...approvedTournamentIds,
    ]),
  ];
  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, title, banner_image_url")
    .in("id", tournamentIds);

  if (tournamentError) {
    console.error("Dashboard tournaments load error:", tournamentError);
  }

  const submissionRows = (submissionsResult.data ?? []) as SubmissionRow[];
  const reportGroupRows = (reportGroupsResult.data ?? []) as ReportGroupRow[];
  const legacyNotificationSubmissions = submissionRows.filter(
    (submission) => submission.report_group_id === null
  );
  const dismissalResult =
    legacyNotificationSubmissions.length > 0
      ? await supabase
          .from("player_notification_dismissals")
          .select("submission_id, dismissed_status")
          .eq("clerk_user_id", clerkUserId)
          .in(
            "submission_id",
            legacyNotificationSubmissions.map((submission) => submission.id)
          )
      : { data: [], error: null };
  const reportGroupDismissalResult =
    reportGroupRows.length > 0
      ? await supabase
          .from("player_report_group_notification_dismissals")
          .select("report_group_id, dismissed_status")
          .eq("clerk_user_id", clerkUserId)
          .in(
            "report_group_id",
            reportGroupRows.map((reportGroup) => reportGroup.id)
          )
      : { data: [], error: null };
  const { data: dismissalData, error: dismissalError } = dismissalResult;
  const {
    data: reportGroupDismissalData,
    error: reportGroupDismissalError,
  } = reportGroupDismissalResult;

  if (dismissalError) {
    console.error("Dashboard notification dismissals load error:", dismissalError);
  }
  if (reportGroupDismissalError) {
    console.error(
      "Dashboard report-group notification dismissals load error:",
      reportGroupDismissalError
    );
  }

  const dismissedSubmissionNotifications = new Set(
    (dismissalData ?? []).map(
      (dismissal) =>
        `${dismissal.submission_id as string}:${
          dismissal.dismissed_status as string
        }`
    )
  );
  const dismissedReportGroupNotifications = new Set(
    (reportGroupDismissalData ?? []).map(
      (dismissal) =>
        `${dismissal.report_group_id as string}:${
          dismissal.dismissed_status as string
        }`
    )
  );

  return buildCareerDashboard({
    clerkUserId,
    registrations,
    matches,
    submissions: submissionRows,
    reportGroups: reportGroupRows,
    generatedBrackets,
    rounds: (roundsResult.data ?? []) as RoundRow[],
    participants: (participantsResult.data ?? []) as RegistrationRow[],
    tournamentBrackets,
    tournaments: (tournamentData ?? []) as TournamentRow[],
    standings: (standingsResult.data ?? []) as StandingRow[],
    roundRobinMatches: (roundRobinMatchesResult.data ??
      []) as BracketMatchStatusRow[],
    approvedTournamentIds,
    dismissedSubmissionNotifications,
    dismissedReportGroupNotifications,
    metadataIncomplete: Boolean(
      tournamentError ||
        dismissalError ||
        reportGroupDismissalError ||
        roundRobinMatchesResult.error
    ),
  });
}

function buildCareerDashboard({
  clerkUserId,
  registrations,
  matches,
  submissions,
  reportGroups,
  generatedBrackets,
  rounds,
  participants,
  tournamentBrackets,
  tournaments,
  standings,
  roundRobinMatches,
  approvedTournamentIds,
  dismissedSubmissionNotifications,
  dismissedReportGroupNotifications,
  metadataIncomplete,
}: {
  clerkUserId: string;
  registrations: RegistrationRow[];
  matches: MatchRow[];
  submissions: SubmissionRow[];
  reportGroups: ReportGroupRow[];
  generatedBrackets: GeneratedBracketRow[];
  rounds: RoundRow[];
  participants: RegistrationRow[];
  tournamentBrackets: TournamentBracketRow[];
  tournaments: TournamentRow[];
  standings: StandingRow[];
  roundRobinMatches: BracketMatchStatusRow[];
  approvedTournamentIds: Set<string>;
  dismissedSubmissionNotifications: Set<string>;
  dismissedReportGroupNotifications: Set<string>;
  metadataIncomplete: boolean;
}): PlayerCareerDashboard {
  const viewerRegistrationIds = new Set(
    registrations.map((registration) => registration.id)
  );
  const registrationsById = new Map(
    [...registrations, ...participants].map((registration) => [
      registration.id,
      registration,
    ])
  );
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const generatedById = new Map(
    generatedBrackets.map((generated) => [generated.id, generated])
  );
  const roundsById = new Map(rounds.map((round) => [round.id, round]));
  const bracketsById = new Map(
    tournamentBrackets.map((bracket) => [bracket.id, bracket])
  );
  const tournamentsById = new Map(
    tournaments.map((tournament) => [tournament.id, tournament])
  );
  const roundRobinMatchesByBracket = new Map<
    string,
    BracketMatchStatusRow[]
  >();

  for (const match of roundRobinMatches) {
    const bracketMatches =
      roundRobinMatchesByBracket.get(match.generated_bracket_id) ?? [];
    bracketMatches.push(match);
    roundRobinMatchesByBracket.set(
      match.generated_bracket_id,
      bracketMatches
    );
  }

  const completedRoundRobinBracketIds = new Set(
    generatedBrackets
      .filter((generated) => {
        if (generated.format !== "round_robin") return false;

        const requiredMatchCount =
          (generated.slot_count * (generated.slot_count - 1)) / 2;
        const bracketMatches =
          roundRobinMatchesByBracket.get(generated.id) ?? [];

        return (
          requiredMatchCount > 0 &&
          bracketMatches.length === requiredMatchCount &&
          bracketMatches.every((match) => match.status === "completed")
        );
      })
      .map((generated) => generated.id)
  );

  const tournamentForMatch = (match: MatchRow) => {
    const generated = generatedById.get(match.generated_bracket_id);
    const bracket = generated
      ? bracketsById.get(generated.tournament_bracket_id)
      : null;
    const tournament = bracket
      ? tournamentsById.get(bracket.tournament_id)
      : null;
    return { generated, bracket, tournament };
  };

  const submissionsByReportGroupId = new Map<string, SubmissionRow[]>();
  for (const submission of submissions) {
    if (!submission.report_group_id) continue;

    const groupSubmissions =
      submissionsByReportGroupId.get(submission.report_group_id) ?? [];
    groupSubmissions.push(submission);
    submissionsByReportGroupId.set(submission.report_group_id, groupSubmissions);
  }

  const legacyNotifications = submissions
    .filter(
      (submission) =>
        submission.report_group_id === null &&
        !dismissedSubmissionNotifications.has(
          `${submission.id}:${submission.status}`
        )
    )
    .map((submission) => {
    const match = matchesById.get(submission.match_id);
    const participantOneId = match?.player_one_registration_id ?? null;
    const participantTwoId = match?.player_two_registration_id ?? null;
    const winnerId = submission.claimed_winner_registration_id;
    const loserId =
      winnerId === participantOneId ? participantTwoId : participantOneId;
    const viewerRegistrationId = participantOneId &&
      viewerRegistrationIds.has(participantOneId)
      ? participantOneId
      : participantTwoId;
    const opponentId =
      viewerRegistrationId === participantOneId
        ? participantTwoId
        : participantOneId;
    const reporterSubmissions = submissions.filter(
      (candidate) =>
        candidate.match_id === submission.match_id &&
        candidate.submitted_by_registration_id ===
          submission.submitted_by_registration_id &&
        candidate.status === submission.status &&
        new Date(candidate.created_at).getTime() <=
          new Date(submission.created_at).getTime()
    );
    const playerOneWins = reporterSubmissions.filter(
      (candidate) =>
        candidate.claimed_winner_registration_id === participantOneId
    ).length;
    const playerTwoWins = reporterSubmissions.filter(
      (candidate) =>
        candidate.claimed_winner_registration_id === participantTwoId
    ).length;
    const round = match ? roundsById.get(match.round_id) : null;
    const context = match ? tournamentForMatch(match) : null;

    return {
      id: `submission:${submission.id}`,
      source: "submission",
      sourceId: submission.id,
      reportGroupId: null,
      submissionNumber: submission.submission_number,
      gameNumber: submission.game_number,
      tournamentName:
        context?.tournament?.title ??
        registrationsById.get(viewerRegistrationId ?? "")?.tournament_title ??
        "IronClad Tournament",
      roundName: round?.name ?? "Tournament Match",
      matchNumber: match?.match_number ?? 0,
      opponentName: registrationName(registrationsById, opponentId),
      reportedWinner: registrationName(registrationsById, winnerId),
      reportedLoser: registrationName(registrationsById, loserId),
      reportedScore: `${playerOneWins}-${playerTwoWins}`,
      status: submission.status,
      reviewNotes: submission.review_notes,
      submittedAt: submission.created_at,
      reviewedAt: submission.reviewed_at,
      submittedByViewer:
        submission.submitted_by_clerk_user_id === clerkUserId,
      confirmationDeadlineAt: null,
      finalizedAt: null,
      canConfirm: false,
      canDispute: false,
    } satisfies DashboardNotification;
  });

  const now = Date.now();
  const reportGroupNotifications = reportGroups
    .filter(
      (reportGroup) =>
        !dismissedReportGroupNotifications.has(
          `${reportGroup.id}:${reportGroup.status}`
        )
    )
    .map((reportGroup) => {
      const match = matchesById.get(reportGroup.match_id);
      const participantOneId = match?.player_one_registration_id ?? null;
      const participantTwoId = match?.player_two_registration_id ?? null;
      const winnerId = reportGroup.winner_registration_id;
      const loserId =
        winnerId === participantOneId ? participantTwoId : participantOneId;
      const submittedByViewer =
        reportGroup.submitted_by_clerk_user_id === clerkUserId;
      const opponentId = submittedByViewer
        ? reportGroup.opponent_registration_id
        : reportGroup.submitted_by_registration_id;
      const round = match ? roundsById.get(match.round_id) : null;
      const context = match ? tournamentForMatch(match) : null;
      const linkedSubmissions =
        submissionsByReportGroupId.get(reportGroup.id) ?? [];
      const firstSubmission = linkedSubmissions
        .slice()
        .sort(
          (left, right) =>
            left.submission_number - right.submission_number ||
            new Date(left.created_at).getTime() -
              new Date(right.created_at).getTime()
        )[0];
      const canRespond =
        !submittedByViewer &&
        reportGroup.status === "pending_confirmation" &&
        reportGroup.finalized_at === null &&
        now < new Date(reportGroup.confirmation_deadline_at).getTime();

      return {
        id: `report_group:${reportGroup.id}`,
        source: "report_group",
        sourceId: reportGroup.id,
        reportGroupId: reportGroup.id,
        submissionNumber: firstSubmission?.submission_number ?? 0,
        gameNumber: firstSubmission?.game_number ?? 1,
        tournamentName:
          context?.tournament?.title ??
          registrationsById.get(participantOneId ?? "")?.tournament_title ??
          "IronClad Tournament",
        roundName: round?.name ?? "Tournament Match",
        matchNumber: match?.match_number ?? 0,
        opponentName: registrationName(registrationsById, opponentId),
        reportedWinner: registrationName(registrationsById, winnerId),
        reportedLoser: registrationName(registrationsById, loserId),
        reportedScore: `${reportGroup.player_one_score}-${reportGroup.player_two_score}`,
        status: reportGroup.status,
        reviewNotes:
          reportGroup.review_notes ??
          (reportGroup.status === "disputed" ? reportGroup.dispute_notes : null),
        submittedAt: reportGroup.created_at,
        reviewedAt: reportGroup.reviewed_at,
        submittedByViewer,
        confirmationDeadlineAt: reportGroup.confirmation_deadline_at,
        finalizedAt: reportGroup.finalized_at,
        canConfirm: canRespond,
        canDispute: canRespond,
      } satisfies DashboardNotification;
    });

  const notifications = [...legacyNotifications, ...reportGroupNotifications].sort(
    (left, right) =>
      new Date(right.submittedAt).getTime() -
      new Date(left.submittedAt).getTime()
  );

  const completedMatches = matches.filter(
    (match) =>
      match.status === "completed" &&
      match.player_one_score !== null &&
      match.player_two_score !== null &&
      match.winner_registration_id
  );
  const matchesWon = completedMatches.filter(
    (match) =>
      match.winner_registration_id &&
      viewerRegistrationIds.has(match.winner_registration_id)
  ).length;
  const matchesLost = completedMatches.length - matchesWon;
  const championsByKey = new Map<string, ChampionAchievement>();

  for (const match of completedMatches) {
    if (
      !match.winner_registration_id ||
      !viewerRegistrationIds.has(match.winner_registration_id)
    ) {
      continue;
    }

    const round = roundsById.get(match.round_id);
    const { generated, bracket, tournament } = tournamentForMatch(match);
    const isSingleEliminationFinal =
      generated?.format === "single_elimination" &&
      round?.round_number === Math.log2(generated.slot_count);

    if (!isSingleEliminationFinal || !bracket) {
      continue;
    }

    championsByKey.set(`${bracket.tournament_id}:${bracket.id}`, {
      id: `${bracket.id}:${match.id}`,
      tournamentName:
        tournament?.title ??
        registrationsById.get(match.winner_registration_id)?.tournament_title ??
        "IronClad Tournament",
      bracketName: bracket.name,
      bannerImageUrl: tournament?.banner_image_url ?? null,
      wonAt: match.updated_at,
      winnerName: registrationName(
        registrationsById,
        match.winner_registration_id
      ),
    });
  }

  for (const standing of standings) {
    const generated = generatedById.get(standing.generated_bracket_id);
    if (
      generated?.format !== "round_robin" ||
      !completedRoundRobinBracketIds.has(generated.id)
    ) {
      continue;
    }

    const bracket = bracketsById.get(generated.tournament_bracket_id);
    if (!bracket) {
      continue;
    }
    const tournament = tournamentsById.get(bracket.tournament_id);
    championsByKey.set(`${bracket.tournament_id}:${bracket.id}`, {
      id: `${bracket.id}:${standing.registration_id}`,
      tournamentName:
        tournament?.title ??
        registrationsById.get(standing.registration_id)?.tournament_title ??
        "IronClad Tournament",
      bracketName: bracket.name,
      bannerImageUrl: tournament?.banner_image_url ?? null,
      wonAt: standing.updated_at,
      winnerName: registrationName(
        registrationsById,
        standing.registration_id
      ),
    });
  }

  const champions = [...championsByKey.values()].sort(
    (left, right) =>
      new Date(right.wonAt).getTime() - new Date(left.wonAt).getTime()
  );
  const matchHistory = completedMatches
    .map((match) => {
      const viewerIsPlayerOne =
        match.player_one_registration_id !== null &&
        viewerRegistrationIds.has(match.player_one_registration_id);
      const opponentId = viewerIsPlayerOne
        ? match.player_two_registration_id
        : match.player_one_registration_id;
      const viewerScore = viewerIsPlayerOne
        ? match.player_one_score
        : match.player_two_score;
      const opponentScore = viewerIsPlayerOne
        ? match.player_two_score
        : match.player_one_score;
      const round = roundsById.get(match.round_id);
      const { bracket, tournament } = tournamentForMatch(match);
      const proofSubmission =
        submissions.find(
          (submission) =>
            submission.id === match.official_result_submission_id
        ) ??
        submissions.find(
          (submission) =>
            submission.match_id === match.id &&
            submission.status === "approved"
        );

      return {
        id: match.id,
        tournamentName:
          tournament?.title ??
          registrationsById.get(
            viewerIsPlayerOne
              ? match.player_one_registration_id ?? ""
              : match.player_two_registration_id ?? ""
          )?.tournament_title ??
          "IronClad Tournament",
        bracketName:
          bracket?.name ??
          registrationsById.get(
            viewerIsPlayerOne
              ? match.player_one_registration_id ?? ""
              : match.player_two_registration_id ?? ""
          )?.bracket_name ??
          "Tournament",
        opponentName: registrationName(registrationsById, opponentId),
        result:
          match.winner_registration_id &&
          viewerRegistrationIds.has(match.winner_registration_id)
            ? "Win"
            : "Loss",
        score: `${viewerScore ?? 0}-${opponentScore ?? 0}`,
        playedAt: match.updated_at,
        roundName: round?.name ?? "Tournament Match",
        matchNumber: match.match_number,
        seriesBestOf: match.series_best_of,
        replayAvailable: Boolean(proofSubmission?.replay_storage_path),
        screenshotAvailable: Boolean(
          proofSubmission?.screenshot_storage_path
        ),
      } satisfies MatchHistoryEntry;
    })
    .sort(
      (left, right) =>
        new Date(right.playedAt).getTime() -
        new Date(left.playedAt).getTime()
    );

  return {
    notifications,
    champions,
    statistics: {
      matchesPlayed: completedMatches.length,
      matchesWon,
      matchesLost,
      winRate:
        completedMatches.length > 0
          ? Math.round((matchesWon / completedMatches.length) * 100)
          : 0,
      tournamentsParticipated: approvedTournamentIds.size,
      tournamentsWon: new Set(
        [...championsByKey.keys()].map((key) => key.split(":")[0])
      ).size,
    },
    matchHistory,
    error: metadataIncomplete
      ? "Some tournament presentation details could not be loaded."
      : null,
  };
}

function registrationName(
  registrationsById: Map<string, RegistrationRow>,
  registrationId: string | null
) {
  if (!registrationId) {
    return "Opponent";
  }

  return registrationsById.get(registrationId)?.player_name || "Opponent";
}
