import "server-only";

import { loadAdminTournamentMatchWorkspace } from "@/lib/admin-tournament-match-workspace";
import type {
  GeneratedTournamentMatch,
  MatchResultReportGroup,
  MatchResultSubmission,
  TournamentCard,
  TournamentParticipant,
} from "@/lib/tournaments";

export const REPLAY_ARCHIVE_AUDIT_CATEGORIES = [
  "pending_confirmation",
  "disputed",
  "under_review",
  "pending_review",
  "rejected",
  "resubmission_requested",
  "superseded",
] as const;

export type ReplayArchiveEvidenceCategory =
  | "official"
  | (typeof REPLAY_ARCHIVE_AUDIT_CATEGORIES)[number];

export type AdminReplayArchiveItem = {
  key: string;
  category: ReplayArchiveEvidenceCategory;
  categoryLabel: string;
  divisionName: string;
  divisionOrder: number;
  roundName: string;
  roundNumber: number;
  matchNumber: number;
  playerOneName: string;
  playerTwoName: string;
  scoreLabel: string;
  matchStatus: GeneratedTournamentMatch["status"];
  replayLabel: string;
  evidenceSource: "Modern per-game" | "Legacy Series Replay";
  submittedAt: string;
  finalizedAt: string | null;
  downloadHref: string;
};

export type AdminTournamentReplayArchive = {
  tournamentId: string;
  tournamentTitle: string;
  items: AdminReplayArchiveItem[];
  officialCount: number;
  auditCount: number;
};

export type AdminTournamentReplayArchiveLoadResult =
  | {
      ok: true;
      archive: AdminTournamentReplayArchive;
    }
  | {
      ok: false;
      reason: "unauthorized" | "not-found" | "load-failed";
    };

export async function loadAdminTournamentReplayArchive(
  tournamentId: string
): Promise<AdminTournamentReplayArchiveLoadResult> {
  const workspace = await loadAdminTournamentMatchWorkspace(tournamentId);
  if (!workspace.ok) return workspace;

  try {
    return {
      ok: true,
      archive: buildAdminTournamentReplayArchive({
        tournament: workspace.tournament,
        submissions: workspace.submissions,
        reportGroups: workspace.reportGroups,
      }),
    };
  } catch {
    console.error("Admin Tournament replay archive load failed.", {
      operation: "project-replay-archive",
    });
    return { ok: false, reason: "load-failed" };
  }
}

export function buildAdminTournamentReplayArchive({
  tournament,
  submissions,
  reportGroups,
}: {
  tournament: TournamentCard;
  submissions: readonly MatchResultSubmission[];
  reportGroups: readonly MatchResultReportGroup[];
}): AdminTournamentReplayArchive {
  const participantsById = new Map<string, TournamentParticipant>();
  for (const participant of [
    ...tournament.participants,
    ...tournament.bracketParticipants,
  ]) {
    participantsById.set(participant.registrationId, participant);
  }

  const matchesById = new Map<
    string,
    {
      divisionName: string;
      divisionOrder: number;
      match: GeneratedTournamentMatch;
    }
  >();

  for (const generatedBracket of tournament.generatedBrackets) {
    const divisionOrder = tournament.brackets.findIndex(
      (bracket) => bracket.id === generatedBracket.tournamentBracketId
    );
    const divisionName =
      tournament.brackets.find(
        (bracket) => bracket.id === generatedBracket.tournamentBracketId
      )?.name ?? "Tournament Division";

    for (const match of generatedBracket.matches) {
      matchesById.set(match.id, {
        divisionName,
        divisionOrder:
          divisionOrder === -1 ? Number.MAX_SAFE_INTEGER : divisionOrder,
        match,
      });
    }
  }

  const items: AdminReplayArchiveItem[] = [];

  for (const reportGroup of reportGroups) {
    const matchContext = matchesById.get(reportGroup.matchId);
    if (!matchContext || reportGroup.tournamentId !== tournament.id) {
      throw new Error("Replay report group escaped its Tournament scope.");
    }

    const classification = classifyReportGroupReplay(reportGroup);
    const modernProofs = reportGroup.replayProofs.filter(
      (proof) =>
        proof.proofAvailable &&
        proof.replayAccessHref?.includes("/submission/")
    );

    for (const proof of modernProofs) {
      if (!proof.replayAccessHref) continue;
      items.push(
        createArchiveItem({
          category: classification.category,
          categoryLabel: classification.label,
          downloadHref: proof.replayAccessHref,
          evidenceSource: "Modern per-game",
          finalizedAt: reportGroup.finalizedAt,
          gameNumber: proof.gameNumber,
          itemKey: `report-group:${reportGroup.id}:proof:${proof.id}`,
          matchContext,
          participantsById,
          playerOneScore: reportGroup.playerOneScore,
          playerTwoScore: reportGroup.playerTwoScore,
          submittedAt: reportGroup.createdAt,
        })
      );
    }

    // Modern report groups retain a compatibility path to their first game.
    // Show that group-level path only when no per-game submissions exist, so
    // the first game is never mislabeled or duplicated as a Series Replay.
    if (modernProofs.length === 0 && reportGroup.replayAccessHref) {
      items.push(
        createArchiveItem({
          category: classification.category,
          categoryLabel: classification.label,
          downloadHref: reportGroup.replayAccessHref,
          evidenceSource: "Legacy Series Replay",
          finalizedAt: reportGroup.finalizedAt,
          gameNumber: null,
          itemKey: `report-group:${reportGroup.id}:series`,
          matchContext,
          participantsById,
          playerOneScore: reportGroup.playerOneScore,
          playerTwoScore: reportGroup.playerTwoScore,
          submittedAt: reportGroup.createdAt,
        })
      );
    }
  }

  for (const submission of submissions) {
    if (!submission.hasReplay || !submission.replayAccessHref) continue;
    const matchContext = matchesById.get(submission.matchId);
    if (!matchContext) {
      throw new Error("Replay submission escaped its Tournament scope.");
    }

    const classification = classifyLegacySubmissionReplay(
      submission,
      matchContext.match
    );
    items.push(
      createArchiveItem({
        category: classification.category,
        categoryLabel: classification.label,
        downloadHref: submission.replayAccessHref,
        evidenceSource: "Legacy Series Replay",
        finalizedAt:
          classification.category === "official"
            ? matchContext.match.officialResultDecidedAt ??
              submission.reviewedAt
            : null,
        gameNumber: null,
        itemKey: `submission:${submission.id}`,
        matchContext,
        participantsById,
        playerOneScore: submission.playerOneScore,
        playerTwoScore: submission.playerTwoScore,
        submittedAt: submission.createdAt,
      })
    );
  }

  items.sort(compareArchiveItems);

  return {
    tournamentId: tournament.id,
    tournamentTitle: tournament.title,
    items,
    officialCount: items.filter((item) => item.category === "official").length,
    auditCount: items.filter((item) => item.category !== "official").length,
  };
}

export function classifyReportGroupReplay(
  reportGroup: MatchResultReportGroup
): { category: ReplayArchiveEvidenceCategory; label: string } {
  if (
    reportGroup.resultType === "normal" &&
    reportGroup.finalizedAt !== null &&
    ["confirmed", "auto_approved", "approved"].includes(reportGroup.status)
  ) {
    return {
      category: "official",
      label:
        reportGroup.status === "confirmed"
          ? "Official · Opponent confirmed"
          : reportGroup.status === "auto_approved"
            ? "Official · Auto-approved"
            : "Official · Admin approved",
    };
  }

  const categories: Record<
    MatchResultReportGroup["status"],
    { category: ReplayArchiveEvidenceCategory; label: string }
  > = {
    pending_confirmation: {
      category: "pending_confirmation",
      label: "Pending opponent confirmation",
    },
    disputed: { category: "disputed", label: "Disputed evidence" },
    under_review: {
      category: "under_review",
      label: "Under Admin review",
    },
    rejected: { category: "rejected", label: "Rejected evidence" },
    reset: { category: "superseded", label: "Superseded / reset" },
    confirmed: {
      category: "under_review",
      label: "Incomplete finalization",
    },
    auto_approved: {
      category: "under_review",
      label: "Incomplete finalization",
    },
    approved: {
      category: "under_review",
      label: "Incomplete finalization",
    },
  };

  return reportGroup.resultType === "no_show"
    ? { category: "under_review", label: "No-show evidence · Audit only" }
    : categories[reportGroup.status];
}

export function classifyLegacySubmissionReplay(
  submission: MatchResultSubmission,
  match: GeneratedTournamentMatch
): { category: ReplayArchiveEvidenceCategory; label: string } {
  if (
    submission.status === "approved" &&
    match.officialResultReference === submission.id
  ) {
    return { category: "official", label: "Official · Legacy approval" };
  }

  if (submission.status === "approved") {
    return { category: "superseded", label: "Superseded approval" };
  }

  const categories = {
    pending: {
      category: "pending_review",
      label: "Pending Admin review",
    },
    rejected: { category: "rejected", label: "Rejected evidence" },
    resubmission_requested: {
      category: "resubmission_requested",
      label: "Resubmission requested",
    },
  } as const;

  return categories[submission.status];
}

function createArchiveItem({
  category,
  categoryLabel,
  downloadHref,
  evidenceSource,
  finalizedAt,
  gameNumber,
  itemKey,
  matchContext,
  participantsById,
  playerOneScore,
  playerTwoScore,
  submittedAt,
}: {
  category: ReplayArchiveEvidenceCategory;
  categoryLabel: string;
  downloadHref: string;
  evidenceSource: AdminReplayArchiveItem["evidenceSource"];
  finalizedAt: string | null;
  gameNumber: number | null;
  itemKey: string;
  matchContext: {
    divisionName: string;
    divisionOrder: number;
    match: GeneratedTournamentMatch;
  };
  participantsById: ReadonlyMap<string, TournamentParticipant>;
  playerOneScore: number;
  playerTwoScore: number;
  submittedAt: string;
}): AdminReplayArchiveItem {
  const { divisionName, divisionOrder, match } = matchContext;

  return {
    key: itemKey,
    category,
    categoryLabel,
    divisionName,
    divisionOrder,
    roundName: match.roundName,
    roundNumber: match.roundNumber,
    matchNumber: match.matchNumber,
    playerOneName: getParticipantName(
      match.playerOneRegistrationId,
      "Player 1",
      participantsById
    ),
    playerTwoName: getParticipantName(
      match.playerTwoRegistrationId,
      "Player 2",
      participantsById
    ),
    scoreLabel: `${playerOneScore}–${playerTwoScore}`,
    matchStatus: match.status,
    replayLabel: gameNumber ? `Game ${gameNumber}` : "Series Replay",
    evidenceSource,
    submittedAt,
    finalizedAt,
    downloadHref,
  };
}

function getParticipantName(
  registrationId: string | null,
  fallback: string,
  participantsById: ReadonlyMap<string, TournamentParticipant>
) {
  return registrationId
    ? participantsById.get(registrationId)?.name ?? fallback
    : fallback;
}

function compareArchiveItems(
  left: AdminReplayArchiveItem,
  right: AdminReplayArchiveItem
) {
  return (
    left.divisionOrder - right.divisionOrder ||
    left.roundNumber - right.roundNumber ||
    left.matchNumber - right.matchNumber ||
    replayOrder(left) - replayOrder(right) ||
    left.submittedAt.localeCompare(right.submittedAt) ||
    left.key.localeCompare(right.key)
  );
}

function replayOrder(item: AdminReplayArchiveItem) {
  const game = item.replayLabel.match(/^Game (\d+)$/)?.[1];
  return game ? Number(game) : Number.MAX_SAFE_INTEGER;
}
