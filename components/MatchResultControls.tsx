"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import {
  resetAdminMatch,
  saveAdminMatchResult,
  reviewMatchResult,
  reviewMatchResultReportGroup,
  type MatchResultActionState,
} from "@/app/tournaments/match-actions";
import AdminMatchResultSummaries from "@/components/AdminMatchResultSummaries";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import PlayerMatchResultForm from "@/components/PlayerMatchResultForm";
import PlayerMatchResultStatus from "@/components/PlayerMatchResultStatus";
import useHydrationSafeNow from "@/components/useHydrationSafeNow";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import type { Locale } from "@/lib/i18n/config";
import { localizeBracketRoundName } from "@/lib/i18n/round-display";
import { translate } from "@/lib/i18n/translate";
import type { MessageValues } from "@/lib/i18n/types";
import type {
  GeneratedTournamentMatch,
  MatchResultReportGroup,
  MatchResultSubmission,
  TournamentParticipant,
} from "@/lib/tournaments";

const initialState: MatchResultActionState = {
  status: "idle",
  message: "",
};

type CompetitionTranslator = (path: string, values?: MessageValues) => string;
const translateCompetitionEnglish: CompetitionTranslator = (path, values) =>
  translate(competitionEnglish, path, values);

export default function MatchResultControls({
  match,
  participantsById,
  isAdmin,
  canSubmit,
  submissions,
  reportGroups,
  deadlineManaged,
  showDirectAdminControls = false,
  presentation = "inline",
  viewerRegistrationId = null,
}: {
  match: GeneratedTournamentMatch;
  participantsById: Map<string, TournamentParticipant>;
  isAdmin: boolean;
  canSubmit: boolean;
  submissions: MatchResultSubmission[];
  reportGroups: MatchResultReportGroup[];
  deadlineManaged: boolean;
  showDirectAdminControls?: boolean;
  presentation?: "inline" | "workspace";
  viewerRegistrationId?: string | null;
}) {
  const selectedT = useOptionalTranslations("competition", competitionEnglish);
  const selectedLocale = useOptionalLocale();
  const t = isAdmin ? translateCompetitionEnglish : selectedT;
  const locale = isAdmin ? "en" : selectedLocale;
  const [expanded, setExpanded] = useState(false);
  const playerOne = match.playerOneRegistrationId
    ? participantsById.get(match.playerOneRegistrationId)
    : null;
  const playerTwo = match.playerTwoRegistrationId
    ? participantsById.get(match.playerTwoRegistrationId)
    : null;
  const hasParticipants = Boolean(playerOne && playerTwo);
  const pendingSubmission = submissions.find(
    (submission) => submission.status === "pending"
  );
  const activeReportGroup = reportGroups.find(
    (reportGroup) =>
      reportGroup.finalizedAt === null &&
      ["pending_confirmation", "disputed", "under_review"].includes(
        reportGroup.status
      )
  );
  const canOpenForReportGroups = reportGroups.length > 0;
  // Canonical resets mark prior groups "reset". Public match projections omit
  // admin audit references, so identify the surviving finalized result here.
  const officialReport =
    match.status === "completed"
      ? (reportGroups.find(
          (group) =>
            group.finalizedAt &&
            ["confirmed", "auto_approved", "approved"].includes(group.status) &&
            group.winnerRegistrationId === match.winnerRegistrationId &&
            group.playerOneScore === match.playerOneScore &&
            group.playerTwoScore === match.playerTwoScore
        ) ?? null)
      : null;
  const holdActive = Boolean(match.holdStartedAt && !match.holdReleasedAt);
  const now = useHydrationSafeNow({
    enabled: deadlineManaged && match.status === "in_progress" && !holdActive,
  });
  const deadlineOpen = Boolean(
    match.deadlineAt &&
      now !== null &&
      now < new Date(match.deadlineAt).getTime()
  );

  const canSubmitNewReport =
    canSubmit &&
    Boolean(viewerRegistrationId) &&
    hasParticipants &&
    (deadlineManaged
      ? match.status === "in_progress" && deadlineOpen && !holdActive
      : match.status !== "completed") &&
    !activeReportGroup &&
    !pendingSubmission;
  const shouldShowAdminResultEntry =
    isAdmin &&
    hasParticipants &&
    (!deadlineManaged || (match.status === "in_progress" && !holdActive)) &&
    !activeReportGroup &&
    !pendingSubmission;
  const playerControlLabel = getPlayerControlLabel({
    match,
    deadlineManaged,
    hasParticipants,
    holdActive,
    deadlineOpen,
    hasActiveReportGroup: Boolean(activeReportGroup),
    hasPendingSubmission: Boolean(pendingSubmission),
    t,
  });
  const adminControlLabel = getAdminControlLabel({
    match,
    deadlineManaged,
    hasParticipants,
    holdActive,
    hasActiveReportGroup: Boolean(activeReportGroup),
    hasPendingSubmission: Boolean(pendingSubmission),
  });

  if (
    !isAdmin &&
    !canSubmit &&
    submissions.length === 0 &&
    !canOpenForReportGroups
  ) {
    return null;
  }

  const content = (
    <div
      className={
        presentation === "workspace" && isAdmin
          ? "grid gap-6 xl:grid-cols-2"
          : "space-y-4"
      }
    >
      {isAdmin && match.status === "completed" && !match.outcomeType && (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 text-[10px] leading-5 text-slate-400">
          <p className="font-black uppercase tracking-wider text-emerald-200">
            Official Result Audit
          </p>
          <p className="mt-2 break-all">
            Submission ID:{" "}
            <span className="font-mono text-slate-200">
              {match.officialResultReference ?? "Direct admin entry"}
            </span>
          </p>
          <p className="break-all">
            Decided by:{" "}
            <span className="font-mono text-slate-200">
              {match.officialResultDecisionLabel ?? "Legacy result"}
            </span>
          </p>
          <p>
            Decided at:{" "}
            <span className="text-slate-200">
              <HydrationSafeLocalDateTime
                value={match.officialResultDecidedAt}
                fallback="Not recorded"
                locale="en"
              />
            </span>
          </p>
        </div>
      )}

      {shouldShowAdminResultEntry && (
        <div className="rounded-2xl border border-orange-400/20 bg-orange-500/[0.04] p-5">
          <ResultEntryForm
            match={match}
            playerOneName={playerOne?.name ?? "Player 1"}
            playerTwoName={playerTwo?.name ?? "Player 2"}
          />
        </div>
      )}

      {isAdmin && showDirectAdminControls && (
        <div className="xl:col-span-2">
          <AdminResetMatchForm match={match} />
        </div>
      )}

      {canSubmitNewReport && (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5">
          <PlayerMatchResultForm
            match={match}
            playerOneName={playerOne?.name ?? "Player 1"}
            playerTwoName={playerTwo?.name ?? "Player 2"}
            viewerRegistrationId={viewerRegistrationId}
          />
        </div>
      )}

      {!isAdmin &&
        (activeReportGroup ||
          (match.status === "completed" &&
            match.winnerRegistrationId &&
            !match.outcomeType)) && (
          <PlayerMatchResultStatus
            key={activeReportGroup?.id ?? officialReport?.id ?? match.id}
            match={match}
            report={activeReportGroup ?? officialReport}
            participantsById={participantsById}
            viewerRegistrationId={viewerRegistrationId}
            canRespond={canSubmit}
          />
        )}

      {isAdmin &&
        canSubmit &&
        activeReportGroup &&
        match.status !== "completed" && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/80">
            {activeReportGroup.submittedByViewer
              ? activeReportGroup.resultType === "no_show"
                ? t("matchControls.yourNoShowPending")
                : t("matchControls.yourResultPending")
              : activeReportGroup.resultType === "no_show"
                ? t("matchControls.opponentNoShowPending")
                : t("matchControls.opponentResultPending")}
          </div>
        )}

      {canSubmit &&
        pendingSubmission &&
        match.status !== "completed" &&
        !activeReportGroup && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/80">
            {t("matchControls.legacyPending")}
          </div>
        )}

      {(reportGroups.length > 0 || submissions.length > 0) && (
        <details open={isAdmin}>
          <summary className="cursor-pointer py-3 text-sm text-zinc-400 focus-visible:outline focus-visible:outline-orange-400">
            {t("resultUx.details")}
          </summary>
          {reportGroups.length > 0 && (
            <div className="space-y-4 xl:col-span-2">
              {reportGroups.map((reportGroup) => (
                <ReportGroupReview
                  key={reportGroup.id}
                  reportGroup={reportGroup}
                  match={match}
                  isAdmin={isAdmin}
                  participantsById={participantsById}
                  t={t}
                  locale={locale}
                />
              ))}
            </div>
          )}

          {submissions.length > 0 && (
            <div className="space-y-4 xl:col-span-2">
              {isAdmin ? (
                <AdminMatchResultSummaries
                  match={match}
                  submissions={submissions}
                  participantsById={participantsById}
                />
              ) : (
                submissions.map((submission) => (
                  <SubmissionReview
                    key={submission.id}
                    match={match}
                    submission={submission}
                    isAdmin={false}
                    participantsById={participantsById}
                    t={t}
                    locale={locale}
                  />
                ))
              )}
            </div>
          )}
        </details>
      )}

      {!hasParticipants && (
        <p className="text-xs text-slate-500">
          {deadlineManaged &&
          (match.playerOneRegistrationId || match.playerTwoRegistrationId)
            ? t("matchControls.waitingOpponent")
            : t("matchControls.participantsRequired")}
        </p>
      )}
      {deadlineManaged && hasParticipants && holdActive && (
        <p className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/80">
          {t("matchControls.hold")}
        </p>
      )}
      {deadlineManaged &&
        canSubmit &&
        !activeReportGroup &&
        hasParticipants &&
        match.status === "scheduled" && (
          <p className="rounded-xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-slate-400">
            {t("matchControls.notActivated")}
          </p>
        )}
      {deadlineManaged &&
        isAdmin &&
        hasParticipants &&
        match.status === "scheduled" && (
          <p className="rounded-xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-slate-400">
            This matchup is waiting for authoritative activation. No direct
            result action is available yet.
          </p>
        )}
      {deadlineManaged &&
        canSubmit &&
        match.status === "in_progress" &&
        !activeReportGroup &&
        !holdActive &&
        !deadlineOpen && (
          <p className="rounded-xl border border-red-400/20 bg-red-500/5 p-4 text-xs leading-5 text-red-100/80">
            {t("matchControls.deadlinePassedMessage")}
          </p>
        )}
      {canSubmit && match.status === "completed" && match.outcomeType && (
        <p className="rounded-xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-slate-300">
          {formatTerminalOutcome(match, t)}
        </p>
      )}
    </div>
  );

  if (presentation === "workspace") {
    return content;
  }

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/35">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 px-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-orange-300 transition hover:bg-orange-500/10 ${
          isAdmin ? "min-h-11 py-3" : "py-2"
        }`}
      >
        <span>{isAdmin ? adminControlLabel : playerControlLabel}</span>
        <span className="text-slate-500">
          {expanded
            ? isAdmin
              ? "Hide"
              : t("matchControls.hide")
            : isAdmin
              ? "Open"
              : t("matchControls.open")}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 p-3">{content}</div>
      )}
    </div>
  );
}

function getPlayerControlLabel({
  match,
  deadlineManaged,
  hasParticipants,
  holdActive,
  deadlineOpen,
  hasActiveReportGroup,
  hasPendingSubmission,
  t,
}: {
  match: GeneratedTournamentMatch;
  deadlineManaged: boolean;
  hasParticipants: boolean;
  holdActive: boolean;
  deadlineOpen: boolean;
  hasActiveReportGroup: boolean;
  hasPendingSubmission: boolean;
  t: CompetitionTranslator;
}) {
  if (!deadlineManaged) {
    if (hasActiveReportGroup) return t("matchControls.pendingConfirmation");
    if (hasPendingSubmission) return t("matchControls.pendingReview");
    return t("matchControls.submitResult");
  }

  if (match.outcomeType === "deadline_double_forfeit") {
    return t("matchControls.doubleForfeit");
  }
  if (match.outcomeType === "automatic_bye") {
    return t("matchControls.automaticAdvancement");
  }
  if (match.outcomeType === "empty_feeder") {
    return t("matchControls.noEligiblePlayer");
  }
  if (match.status === "completed") return t("matchControls.completed");
  if (match.status === "scheduled") {
    return hasParticipants
      ? t("matchControls.notActive")
      : t("matchControls.waitingOpponentShort");
  }
  if (holdActive) return t("matchControls.deadlinePaused");
  if (match.status === "in_progress" && !deadlineOpen) {
    return match.deadlineAt
      ? t("matchControls.deadlinePassed")
      : t("matchControls.notActive");
  }
  if (match.status === "pending_review" || hasPendingSubmission) {
    return t("matchControls.pendingReview");
  }
  if (hasActiveReportGroup) return t("matchControls.pendingConfirmation");
  return t("matchControls.submitResult");
}

function getAdminControlLabel({
  match,
  deadlineManaged,
  hasParticipants,
  holdActive,
  hasActiveReportGroup,
  hasPendingSubmission,
}: {
  match: GeneratedTournamentMatch;
  deadlineManaged: boolean;
  hasParticipants: boolean;
  holdActive: boolean;
  hasActiveReportGroup: boolean;
  hasPendingSubmission: boolean;
}) {
  if (!deadlineManaged) {
    if (hasActiveReportGroup) return "Confirmation Review Required";
    if (hasPendingSubmission) return "Result Review Required";
    return "Result Controls";
  }

  if (match.outcomeType === "deadline_double_forfeit") {
    return "Double Forfeit Ruling";
  }
  if (match.outcomeType === "automatic_bye") {
    return "Automatic Advancement";
  }
  if (match.outcomeType === "empty_feeder") return "Empty Feeder Outcome";
  if (match.status === "completed") return "Match Completed";
  if (match.status === "scheduled") {
    return hasParticipants ? "Match Not Active" : "Waiting for Participants";
  }
  if (holdActive) return "Match Deadline Paused";
  if (hasActiveReportGroup) return "Confirmation Review Required";
  if (match.status === "pending_review" || hasPendingSubmission) {
    return "Result Review Required";
  }
  return "Result Controls";
}

function formatTerminalOutcome(
  match: GeneratedTournamentMatch,
  t: CompetitionTranslator
) {
  if (match.outcomeType === "deadline_double_forfeit") {
    return t("matchControls.outcomeDoubleForfeit");
  }
  if (match.outcomeType === "automatic_bye") {
    return t("matchControls.outcomeAutomaticBye");
  }
  return t("matchControls.outcomeEmptyFeeder");
}

export function ResultEntryForm({
  match,
  playerOneName,
  playerTwoName,
  onPendingChange,
}: {
  match: GeneratedTournamentMatch;
  playerOneName: string;
  playerTwoName: string;
  onPendingChange?: (key: string, pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    saveAdminMatchResult,
    initialState
  );
  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;

  useEffect(() => {
    const key = `official-result:${match.id}`;
    onPendingChange?.(key, pending);
    return () => onPendingChange?.(key, false);
  }, [match.id, onPendingChange, pending]);

  return (
    <form action={formAction} aria-busy={pending} className="space-y-5">
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-white">
          Official Result Entry
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Best of {match.seriesBestOf} · winner requires {winsRequired} wins
        </p>
      </div>

      <div className="grid grid-cols-[1fr_90px] gap-3">
        <label className="min-w-0">
          <span className="block whitespace-normal [overflow-wrap:anywhere] text-xs font-bold text-slate-300">
            {playerOneName}
          </span>
          <input
            name="playerOneScore"
            type="number"
            min="0"
            max={winsRequired}
            required
            defaultValue={match.playerOneScore ?? ""}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
          />
        </label>
        <span className="self-end pb-2 text-center text-xs text-slate-600">
          Score
        </span>
      </div>

      <div className="grid grid-cols-[1fr_90px] gap-3">
        <label className="min-w-0">
          <span className="block whitespace-normal [overflow-wrap:anywhere] text-xs font-bold text-slate-300">
            {playerTwoName}
          </span>
          <input
            name="playerTwoScore"
            type="number"
            min="0"
            max={winsRequired}
            required
            defaultValue={match.playerTwoScore ?? ""}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
          />
        </label>
        <span className="self-end pb-2 text-center text-xs text-slate-600">
          Score
        </span>
      </div>

      <label className="block">
        <span className="text-xs font-bold text-slate-300">Winner</span>
        <select
          name="winnerRegistrationId"
          required
          defaultValue={match.winnerRegistrationId ?? ""}
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
        >
          <option value="">Select winner</option>
          <option value={match.playerOneRegistrationId ?? ""}>
            {playerOneName}
          </option>
          <option value={match.playerTwoRegistrationId ?? ""}>
            {playerTwoName}
          </option>
        </select>
      </label>

      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Complete Match & Advance Winner"}
      </button>
    </form>
  );
}

export function AdminResetMatchForm({
  match,
  onPendingChange,
}: {
  match: GeneratedTournamentMatch;
  onPendingChange?: (key: string, pending: boolean) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(
    resetAdminMatch,
    initialState
  );

  useEffect(() => {
    const key = `reset-match:${match.id}`;
    onPendingChange?.(key, pending);
    return () => onPendingChange?.(key, false);
  }, [match.id, onPendingChange, pending]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-5"
    >
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-red-200">
          Destructive Action
        </p>
        <p className="mt-1 text-sm font-black uppercase tracking-wider text-white">
          Reset Match
        </p>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          Resets pending review state when safe. Replay proof and legacy
          attachment records are preserved for audit. Completed results and
          untouched derived outcomes are unwound only while downstream play
          remains safe; extension and hold usage stay consumed.
        </p>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-bold text-slate-300">
          Type RESET to continue
        </span>
        <input
          name="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-2 w-full rounded-xl border border-red-400/20 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-red-300"
        />
      </label>

      <div className="mt-4">
        <ActionMessage state={state} />
      </div>
      <button
        type="submit"
        disabled={pending || confirmation !== "RESET"}
        className="mt-3 min-h-11 w-full rounded-xl bg-red-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
      >
        {pending ? "Resetting..." : "Reset Match"}
      </button>
    </form>
  );
}

export function ReportGroupReview({
  reportGroup,
  match,
  isAdmin,
  participantsById,
  t = translateCompetitionEnglish,
  locale = "en",
  onPendingChange,
  presentation = "inline",
}: {
  presentation?: "inline" | "workspace";
  reportGroup: MatchResultReportGroup;
  match: GeneratedTournamentMatch;
  isAdmin: boolean;
  participantsById: Map<string, TournamentParticipant>;
  t?: CompetitionTranslator;
  locale?: Locale;
  onPendingChange?: (key: string, pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    reviewMatchResultReportGroup,
    initialState
  );
  const reporter = participantName(
    participantsById,
    reportGroup.submittedByRegistrationId
  );
  const opponent = participantName(
    participantsById,
    reportGroup.opponentRegistrationId
  );
  const winner = participantName(
    participantsById,
    reportGroup.winnerRegistrationId
  );
  const isNoShow = reportGroup.resultType === "no_show";
  const loserRegistrationId =
    reportGroup.winnerRegistrationId === match.playerOneRegistrationId
      ? match.playerTwoRegistrationId
      : match.playerOneRegistrationId;
  const noShowRegistrationId =
    reportGroup.noShowRegistrationId ?? loserRegistrationId;
  const loser = loserRegistrationId
    ? participantName(participantsById, loserRegistrationId)
    : t("matchControls.participant");
  const missingPlayer = noShowRegistrationId
    ? participantName(participantsById, noShowRegistrationId)
    : loser;
  const actionable =
    reportGroup.finalizedAt === null &&
    ["pending_confirmation", "disputed", "under_review"].includes(
      reportGroup.status
    );

  useEffect(() => {
    const key = `report-group:${reportGroup.id}`;
    onPendingChange?.(key, pending);
    return () => onPendingChange?.(key, false);
  }, [onPendingChange, pending, reportGroup.id]);

  return (
    <div
      className={
        presentation === "workspace"
          ? "min-w-0 [overflow-wrap:anywhere]"
          : "rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5"
      }
    >
      {presentation === "workspace" ? (
        <div>
          <p className="font-bold text-white">
            {isNoShow
              ? winner + " reported a no-show for " + missingPlayer
              : winner +
                " defeated " +
                loser +
                ", " +
                Math.max(
                  reportGroup.playerOneScore,
                  reportGroup.playerTwoScore
                ) +
                "–" +
                Math.min(
                  reportGroup.playerOneScore,
                  reportGroup.playerTwoScore
                )}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Submitted by {reporter} ·{" "}
            <HydrationSafeLocalDateTime
              value={reportGroup.createdAt}
              fallback="Date unavailable"
            />
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatReportGroupStatus(reportGroup.status, t)} ·{" "}
            {isNoShow
              ? "No replay required"
              : reportGroup.replayProofs.length + " replay files attached"}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className={isAdmin ? "min-w-0" : undefined}>
              <p className="text-xs font-black uppercase tracking-wider text-sky-200">
                {isNoShow
                  ? t("matchControls.noShowReport")
                  : t("matchControls.confirmationPackage")}{" "}
                - {formatReportGroupStatus(reportGroup.status, t)}
              </p>
              <p
                className={`mt-2 text-sm text-white ${
                  isAdmin ? "break-words" : ""
                }`}
              >
                {isNoShow
                  ? t("matchControls.noShowReported", {
                      reporter: winner,
                      player: missingPlayer,
                    })
                  : t("matchControls.scoreReported", {
                      score: `${reportGroup.playerOneScore}-${reportGroup.playerTwoScore}`,
                      winner,
                    })}
              </p>
            </div>
            <span className="text-[10px] text-slate-500">
              <HydrationSafeLocalDateTime
                value={reportGroup.createdAt}
                fallback={t("deadlines.unavailable")}
                locale={locale}
                options={{ dateStyle: "medium", timeStyle: "short" }}
              />
            </span>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-xs text-slate-300 sm:grid-cols-2">
            <SummaryValue
              label={t("matchControls.match")}
              value={t("matchControls.matchReference", {
                round: isAdmin
                  ? match.roundName
                  : localizeBracketRoundName(match.roundName, t),
                number: match.matchNumber,
              })}
            />
            <SummaryValue
              label={t("matchControls.reportingPlayer")}
              value={reporter}
            />
            <SummaryValue
              label={t("matchControls.opponent")}
              value={opponent}
            />
            <SummaryValue
              label={
                isNoShow
                  ? t("matchControls.forfeitWinner")
                  : t("matchControls.reportedWinner")
              }
              value={winner}
            />
            <SummaryValue
              label={
                isNoShow
                  ? t("matchControls.missingPlayer")
                  : t("matchControls.reportedLoser")
              }
              value={isNoShow ? missingPlayer : loser}
            />
            {isNoShow && (
              <SummaryValue
                label={t("matchControls.noShowStatus")}
                value={formatNoShowStatus(reportGroup.noShowStatus, t)}
              />
            )}
            <SummaryValue
              label={t("matchControls.confirmationDeadline")}
              value={
                <HydrationSafeLocalDateTime
                  value={reportGroup.confirmationDeadlineAt}
                  fallback={t("deadlines.unavailable")}
                  locale={locale}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                />
              }
            />
            {reportGroup.finalizedSource && (
              <SummaryValue
                label={t("matchControls.finalizedBy")}
                value={formatFinalizedSource(reportGroup.finalizedSource, t)}
              />
            )}
          </div>
        </>
      )}

      {reportGroup.disputeNotes && (
        <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-red-200">
            {t("matchControls.disputeNotes")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-red-100/80">
            {reportGroup.disputeNotes}
          </p>
        </div>
      )}

      {reportGroup.noShowNote && (
        <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-red-200">
            {t("matchControls.noShowNote")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-red-100/80">
            {reportGroup.noShowNote}
          </p>
        </div>
      )}

      {reportGroup.reviewNotes && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-orange-300">
            {t("matchControls.reviewNotes")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">
            {reportGroup.reviewNotes}
          </p>
        </div>
      )}

      {presentation === "workspace" && !isNoShow ? (
        <div className="mt-4 divide-y divide-white/10">
          {reportGroup.replayProofs.map((proof) => (
            <div
              key={proof.id}
              className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-white">
                  Game {proof.gameNumber}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Winner:{" "}
                  {proof.winnerRegistrationId
                    ? participantName(
                        participantsById,
                        proof.winnerRegistrationId
                      )
                    : "Not recorded in legacy evidence"}
                </p>
              </div>
              {proof.replayAccessHref ? (
                <a
                  href={proof.replayAccessHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-xs font-bold text-orange-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  View Game {proof.gameNumber} Replay
                </a>
              ) : (
                <p className="text-xs text-zinc-500">Replay unavailable</p>
              )}
            </div>
          ))}
          {reportGroup.replayProofs.length === 0 && (
            <p className="text-xs text-zinc-500">Replay unavailable</p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {isNoShow ? (
            <span className="rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-200">
              {t("matchControls.noReplayNoShow")}
            </span>
          ) : reportGroup.replayProofs.length > 0 ? (
            reportGroup.replayProofs.map((proof) =>
              proof.replayAccessHref ? (
                <a
                  key={proof.id}
                  href={proof.replayAccessHref}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-md border border-sky-400/30 bg-sky-500/10 text-[10px] font-black uppercase tracking-wider text-sky-200 ${
                    isAdmin
                      ? "inline-flex min-h-11 items-center justify-center px-3 py-2"
                      : "px-2 py-1"
                  }`}
                >
                  {t("matchControls.gameReplay", { number: proof.gameNumber })}
                </a>
              ) : (
                <span
                  key={proof.id}
                  className="rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-red-200"
                >
                  {t("matchControls.gameReplayUnavailable", {
                    number: proof.gameNumber,
                  })}
                </span>
              )
            )
          ) : (
            <span className="rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-red-200">
              {t("matchControls.replayUnavailable")}
            </span>
          )}
        </div>
      )}
      {presentation === "workspace" && reportGroup.finalizedAt && (
        <p className="mt-3 text-xs text-zinc-500">
          Finalized:{" "}
          <HydrationSafeLocalDateTime
            value={reportGroup.finalizedAt}
            fallback="Unavailable"
          />
          {reportGroup.finalizedSource &&
            " · " + formatFinalizedSource(reportGroup.finalizedSource, t)}
        </p>
      )}

      {presentation === "workspace" && (
        <details className="mt-3 text-xs text-zinc-400">
          <summary className="min-h-11 cursor-pointer py-3 font-bold focus-visible:ring-2 focus-visible:ring-orange-300">
            Report audit
          </summary>
          <dl className="grid gap-3 py-2 sm:grid-cols-2">
            {(
              [
                [
                  "Original confirmation deadline",
                  reportGroup.confirmationDeadlineAt,
                ],
                ["Confirmed", reportGroup.confirmedAt],
                ["Disputed", reportGroup.disputedAt],
                ["Reviewed", reportGroup.reviewedAt],
                ["No-show resolved", reportGroup.noShowResolvedAt],
              ] as const
            ).map(
              ([label, value]) =>
                value && (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd className="mt-1 text-zinc-300">
                      <HydrationSafeLocalDateTime
                        value={value}
                        fallback="Unavailable"
                      />
                    </dd>
                  </div>
                )
            )}
            {reportGroup.reviewerLabel && (
              <div>
                <dt>Reviewed by</dt>
                <dd>{reportGroup.reviewerLabel}</dd>
              </div>
            )}
            {isNoShow && (
              <div>
                <dt>No-show status</dt>
                <dd>{formatNoShowStatus(reportGroup.noShowStatus, t)}</dd>
              </div>
            )}
            {reportGroup.noShowResolverLabel && (
              <div>
                <dt>No-show resolved by</dt>
                <dd>{reportGroup.noShowResolverLabel}</dd>
              </div>
            )}
          </dl>
        </details>
      )}

      {isAdmin && actionable && (
        <details
          open={
            presentation !== "workspace" ||
            reportGroup.status !== "pending_confirmation"
          }
          className="mt-4"
        >
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-zinc-300 focus-visible:ring-2 focus-visible:ring-orange-300">
            {reportGroup.status === "pending_confirmation"
              ? "Optional Admin Review"
              : "Review Result"}
          </summary>
          <form
            action={formAction}
            aria-busy={pending}
            className="mt-4 space-y-2"
          >
            <input type="hidden" name="reportGroupId" value={reportGroup.id} />
            <textarea
              aria-label="Administrator review message"
              name="reviewNotes"
              maxLength={2000}
              rows={2}
              placeholder="Administrator message (required for rejection)"
              className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400"
            />
            <ActionMessage state={state} />
            <div className="grid gap-2 sm:grid-cols-3">
              <ReportGroupReviewButton
                decision="approved"
                label={isNoShow ? "Approve No-Show" : "Approve Result"}
                disabled={pending}
                className="bg-emerald-600 hover:bg-emerald-500"
              />
              <ReportGroupReviewButton
                decision="under_review"
                label="Mark Under Review"
                disabled={pending}
                className="border border-white/20 bg-white/5 hover:bg-white/10"
              />
              <ReportGroupReviewButton
                decision="rejected"
                label={isNoShow ? "Reject No-Show" : "Reject Result"}
                disabled={pending}
                className="border border-white/20 bg-transparent hover:bg-white/10"
              />
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

function ReportGroupReviewButton({
  decision,
  label,
  disabled,
  className,
}: {
  decision: string;
  label: string;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={disabled}
      className={`min-h-11 rounded-lg px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}

function SubmissionReview({
  match,
  submission,
  isAdmin,
  participantsById,
  t = translateCompetitionEnglish,
  locale = "en",
}: {
  match: GeneratedTournamentMatch;
  submission: MatchResultSubmission;
  isAdmin: boolean;
  participantsById: Map<string, TournamentParticipant>;
  t?: CompetitionTranslator;
  locale?: Locale;
}) {
  const [state, formAction, pending] = useActionState(
    reviewMatchResult,
    initialState
  );
  const winner =
    participantsById.get(submission.claimedWinnerRegistrationId)?.name ??
    t("matchControls.participant");
  const loserRegistrationId =
    submission.claimedWinnerRegistrationId === match.playerOneRegistrationId
      ? match.playerTwoRegistrationId
      : match.playerOneRegistrationId;
  const loser = loserRegistrationId
    ? (participantsById.get(loserRegistrationId)?.name ??
      t("matchControls.participant"))
    : t("matchControls.participant");
  const reporter = submission.submittedByRegistrationId
    ? (participantsById.get(submission.submittedByRegistrationId)?.name ??
      t("matchControls.participant"))
    : t("matchControls.participant");

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wider text-amber-200">
          {t("matchControls.submission", {
            number: submission.submissionNumber,
          })}{" "}
          · {formatSubmissionStatus(submission.status, t)}
        </p>
        <span className="text-[10px] text-slate-500">
          <HydrationSafeLocalDateTime
            value={submission.createdAt}
            fallback={t("deadlines.unavailable")}
            locale={locale}
            options={{ dateStyle: "medium", timeStyle: "short" }}
          />
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <p>
          {t("matchControls.match")}:{" "}
          <strong className="text-white">
            {t("matchControls.matchReference", {
              round: isAdmin
                ? match.roundName
                : localizeBracketRoundName(match.roundName, t),
              number: match.matchNumber,
            })}
          </strong>
        </p>
        <p>
          {t("matchControls.reportingPlayer")}:{" "}
          <strong className="text-white">{reporter}</strong>
        </p>
        <p>
          {t("matchControls.reportedWinner")}:{" "}
          <strong className="text-white">{winner}</strong>
        </p>
        <p>
          {t("matchControls.reportedLoser")}:{" "}
          <strong className="text-white">{loser}</strong>
        </p>
      </div>
      <p className="mt-2 text-xs text-slate-300">
        {t("matchControls.claimedWinner")}:{" "}
        <strong className="text-white">{winner}</strong>
        {" · "}
        {t("matchControls.score")} {submission.playerOneScore}-
        {submission.playerTwoScore}
      </p>
      {isAdmin && (
        <div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-black/30 p-3 text-[10px] text-slate-400 sm:grid-cols-2">
          <p className="break-all">
            Submission ID:{" "}
            <span className="font-mono text-slate-200">{submission.id}</span>
          </p>
          <p className="break-all">
            Submitted by:{" "}
            <span className="font-mono text-slate-200">{reporter}</span>
          </p>
          <p className="break-all">
            Reviewed by:{" "}
            <span className="font-mono text-slate-200">
              {submission.reviewerLabel ?? "Pending"}
            </span>
          </p>
          <p>
            Reviewed at:{" "}
            <span className="text-slate-200">
              <HydrationSafeLocalDateTime
                value={submission.reviewedAt}
                fallback="Pending"
                locale="en"
              />
            </span>
          </p>
        </div>
      )}
      {submission.notes && (
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {submission.notes}
        </p>
      )}
      {submission.reviewNotes && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-orange-300">
            {isAdmin
              ? "Administrator Message"
              : t("matchControls.adminMessage")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">
            {submission.reviewNotes}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {submission.replayAccessHref && (
          <a
            href={submission.replayAccessHref}
            target="_blank"
            rel="noreferrer"
            className={`rounded-md border border-sky-400/30 bg-sky-500/10 text-[10px] font-black uppercase tracking-wider text-sky-200 ${
              isAdmin
                ? "inline-flex min-h-11 items-center justify-center px-3 py-2"
                : "px-2 py-1"
            }`}
          >
            {isAdmin
              ? "Download Replay Proof"
              : t("matchControls.downloadReplay")}
          </a>
        )}
        {submission.screenshotAccessHref && (
          <a
            href={submission.screenshotAccessHref}
            target="_blank"
            rel="noreferrer"
            className={`rounded-md border border-sky-400/30 bg-sky-500/10 text-[10px] font-black uppercase tracking-wider text-sky-200 ${
              isAdmin
                ? "inline-flex min-h-11 items-center justify-center px-3 py-2"
                : "px-2 py-1"
            }`}
          >
            {isAdmin
              ? "View Legacy Screenshot Attachment"
              : t("matchControls.viewLegacyScreenshot")}
          </a>
        )}
      </div>
      {isAdmin && (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-[10px] leading-5 text-slate-500">
          <p>
            Replay proof:{" "}
            <span className="text-slate-300">
              {submission.hasReplay ? "Available" : "Unavailable"}
            </span>
          </p>
          <p>
            Legacy screenshot attachment (not accepted proof):{" "}
            <span className="text-slate-300">
              {submission.hasScreenshot ? "Available" : "Unavailable"}
            </span>
          </p>
        </div>
      )}

      {isAdmin && submission.status === "pending" && (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="submissionId" value={submission.id} />
          <textarea
            name="reviewNotes"
            maxLength={2000}
            rows={2}
            placeholder="Administrator message (required for rejection or resubmission)"
            className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400"
          />
          <ActionMessage state={state} />
          <div className="grid gap-2 sm:grid-cols-3">
            <ReviewButton
              decision="approved"
              label="Approve"
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-500"
            />
            <ReviewButton
              decision="rejected"
              label="Reject"
              disabled={pending}
              className="bg-red-700 hover:bg-red-600"
            />
            <ReviewButton
              decision="resubmission_requested"
              label="Request Resubmission"
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-500"
            />
          </div>
        </form>
      )}
    </div>
  );
}

function ReviewButton({
  decision,
  label,
  disabled,
  className,
}: {
  decision: string;
  label: string;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={disabled}
      className={`min-h-11 rounded-lg px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}

function ActionMessage({ state }: { state: MatchResultActionState }) {
  if (state.status === "idle") return null;

  return (
    <p
      className={`rounded-lg border p-2 text-xs ${
        state.status === "success"
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-400/30 bg-red-500/10 text-red-200"
      }`}
    >
      {state.message}
    </p>
  );
}

function SummaryValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p>
      <span className="text-slate-500">{label}:</span>{" "}
      <strong className="text-white">{value}</strong>
    </p>
  );
}

function participantName(
  participantsById: Map<string, TournamentParticipant>,
  registrationId: string
) {
  return participantsById.get(registrationId)?.name ?? "Participant";
}

function formatSubmissionStatus(
  status: MatchResultSubmission["status"],
  t: CompetitionTranslator
) {
  return {
    pending: t("matchControls.statusUnderReview"),
    approved: t("matchControls.statusApproved"),
    rejected: t("matchControls.statusRejected"),
    resubmission_requested: t("matchControls.statusResubmission"),
  }[status];
}

function formatReportGroupStatus(
  status: MatchResultReportGroup["status"],
  t: CompetitionTranslator
) {
  return {
    pending_confirmation: t("matchControls.statusPendingConfirmation"),
    confirmed: t("matchControls.statusConfirmed"),
    auto_approved: t("matchControls.statusAutoApproved"),
    disputed: t("matchControls.statusDisputed"),
    under_review: t("matchControls.statusUnderReview"),
    approved: t("matchControls.statusApproved"),
    rejected: t("matchControls.statusRejected"),
    reset: t("matchControls.statusReset"),
  }[status];
}

function formatNoShowStatus(
  status: MatchResultReportGroup["noShowStatus"],
  t: CompetitionTranslator
) {
  if (!status) return t("matchControls.statusNotNoShow");

  return {
    pending: t("matchControls.statusWaitingOpponent"),
    confirmed: t("matchControls.statusConfirmed"),
    disputed: t("matchControls.statusDisputed"),
    approved: t("matchControls.statusApprovedAdmin"),
    rejected: t("matchControls.statusRejected"),
    auto_confirmed: t("matchControls.statusAutoConfirmed"),
  }[status];
}

function formatFinalizedSource(source: string, t: CompetitionTranslator) {
  return (
    {
      opponent_confirmation: t("matchControls.sourceOpponent"),
      cron_auto_approval: t("matchControls.sourceAutomatic"),
      admin_approval: t("matchControls.sourceAdminApproval"),
      admin_override: t("matchControls.sourceAdminOverride"),
      reset: t("matchControls.statusReset"),
    }[source] ?? source.replaceAll("_", " ")
  );
}
